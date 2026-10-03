/* =========================================================
   SOC - SQM MONITORING DASHBOARD
   FINAL APP.JS
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const CSV_PATH = "./data/raw_data.csv";
/*
 * Traffic:
 * Data contoh:
 * Total Traffic(Byte) = 0.05785, 1.57247, 3.54297, dst.
 *
 * Nilai source digunakan apa adanya.
 * Jika nanti CSV benar-benar berisi BYTE mentah,
 * ubah TRAFFIC_DIVISOR menjadi 1000000000.
 */
const TRAFFIC_DIVISOR = 1;
const TRAFFIC_UNIT = "GB";

/* =========================================================
   CSV COLUMNS
   ========================================================= */

const COLUMNS = {
    date: "15 Minutes",
    region: "REGION",
    branch: "BRANCH",
    kabupaten: "KABUPATEN",
    circle: "CIRCLE",

    traffic: "Total Traffic(Byte)",

    dlRetx: "Downlink TCP Retransmission Rate(%)",
    ulRetx: "Uplink TCP Retransmission Rate(%)",

    tcp: "TCP Connection Success Rate (Included RST)(%)",

    dlLoss: "Downlink TCP Packet Loss Rate(%)",
    ulLoss: "Uplink TCP Packet Loss Rate(%)",

    e2e: "E2E Delay(ms)",
    synAckAck: "SYN ACK-ACK Delay(ms)",
    synSynAck: "SYN-SYN ACK Delay(ms)"
};

/* =========================================================
   SQM METRIC SPECIFICATION
   ========================================================= */

const specs = {
    traffic: {
        key: COLUMNS.traffic,
        label: "Total Traffic",
        agg: "sum",
        unit: TRAFFIC_UNIT
    },

    dlRetx: {
        key: COLUMNS.dlRetx,
        label: "DL TCP Retransmission",
        agg: "avg",
        unit: "%"
    },

    ulRetx: {
        key: COLUMNS.ulRetx,
        label: "UL TCP Retransmission",
        agg: "avg",
        unit: "%"
    },

    tcp: {
        key: COLUMNS.tcp,
        label: "TCP Connection Success",
        agg: "avg",
        unit: "%"
    },

    dlLoss: {
        key: COLUMNS.dlLoss,
        label: "DL TCP Packet Loss",
        agg: "avg",
        unit: "%"
    },

    ulLoss: {
        key: COLUMNS.ulLoss,
        label: "UL TCP Packet Loss",
        agg: "avg",
        unit: "%"
    },

    e2e: {
        key: COLUMNS.e2e,
        label: "E2E Delay",
        agg: "avg",
        unit: "ms"
    },

    synAckAck: {
        key: COLUMNS.synAckAck,
        label: "SYN ACK-ACK Delay",
        agg: "avg",
        unit: "ms"
    },

    synSynAck: {
        key: COLUMNS.synSynAck,
        label: "SYN-SYN ACK Delay",
        agg: "avg",
        unit: "ms"
    }
};

/* =========================================================
   STATE
   ========================================================= */

let rows = [];
let filteredRows = [];

let currentPeriod = "15min";
let compareEnabled = false;
let compareMode = "previous";

let charts = {};

let currentTableRows = [];
let currentDataRows = [];

let topologyInitialized = false;

/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}

/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================
   NUMBER HELPERS
   ========================================================= */

function numberValue(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    let text = String(value).trim();

    if (!text) {
        return null;
    }

    text = text.replace(/\s/g, "");

    /*
     * Support:
     * 1.234,56
     * 1234,56
     * 1,234.56
     * 1234.56
     */

    if (text.includes(",") && text.includes(".")) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(",", ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (text.includes(",")) {
        text = text.replace(",", ".");
    }

    const n = Number(text);

    return Number.isFinite(n) ? n : null;
}

function formatNumber(value, decimals = 2) {
    const n = numberValue(value);

    if (n === null) {
        return "-";
    }

    return n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatInteger(value) {
    const n = numberValue(value);

    if (n === null) {
        return "-";
    }

    return Math.round(n).toLocaleString("en-US");
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function parseDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    let text = String(value)
        .replace(/^\uFEFF/, "")
        .trim();

    if (!text) {
        return null;
    }

    /*
     * Format:
     * 10/1/2026 0:00
     * 10/1/2026 00:00
     * 10/01/2026 12:15
     */

    let match = text.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (match) {
        const month = Number(match[1]);
        const day = Number(match[2]);
        const year = Number(match[3]);

        const hour = Number(match[4] || 0);
        const minute = Number(match[5] || 0);
        const second = Number(match[6] || 0);

        const date = new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );

        if (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        ) {
            return date;
        }
    }

    /*
     * Format:
     * 2026-10-01 00:00
     */

    match = text.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        const hour = Number(match[4] || 0);
        const minute = Number(match[5] || 0);
        const second = Number(match[6] || 0);

        const date = new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );

        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    /*
     * ISO / browser-compatible date
     */

    const parsed = new Date(text);

    return isNaN(parsed.getTime()) ? null : parsed;
}

function dateInputValue(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "";
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
}

function formatDateDisplay(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function dateKey(date) {
    if (!(date instanceof Date)) {
        return "";
    }

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

/* =========================================================
   CSV HEADER NORMALIZATION
   ========================================================= */

function normalizeHeader(header) {
    return String(header ?? "")
        .replace(/^\uFEFF/, "")
        .replace(/\u00A0/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}


/* =========================================================
   CSV COMPATIBILITY / ALIASES
   ========================================================= */

/*
 * Mendukung dua format:
 * 1. CSV hasil transformasi dengan header yang sudah sesuai COLUMNS
 * 2. raw_data.csv asli:
 *    timestamp,branch,kabupaten,region,circle,total_traffic_byte,...
 */
const CSV_FALLBACK_PATH =
    "https://raw.githubusercontent.com/indragustihsb/SOC-SQM-DASHBOARD/main/data/raw_data.csv";

const CSV_ALIASES = {
    "timestamp": COLUMNS.date,
    "15 Minutes": COLUMNS.date,

    "branch": COLUMNS.branch,
    "BRANCH": COLUMNS.branch,

    "kabupaten": COLUMNS.kabupaten,
    "KABUPATEN": COLUMNS.kabupaten,

    "region": COLUMNS.region,
    "REGION": COLUMNS.region,

    "circle": COLUMNS.circle,
    "CIRCLE": COLUMNS.circle,

    "total_traffic_byte": COLUMNS.traffic,
    "Total Traffic(Byte)": COLUMNS.traffic,

    "downlink_tcp_retransmission_rate": COLUMNS.dlRetx,
    "Downlink TCP Retransmission Rate(%)": COLUMNS.dlRetx,

    "uplink_tcp_retransmission_rate": COLUMNS.ulRetx,
    "Uplink TCP Retransmission Rate(%)": COLUMNS.ulRetx,

    "tcp_connection_success_rate": COLUMNS.tcp,
    "TCP Connection Success Rate (Included RST)(%)": COLUMNS.tcp,

    "downlink_tcp_packet_loss_rate": COLUMNS.dlLoss,
    "Downlink TCP Packet Loss Rate(%)": COLUMNS.dlLoss,

    "uplink_tcp_packet_loss_rate": COLUMNS.ulLoss,
    "Uplink TCP Packet Loss Rate(%)": COLUMNS.ulLoss,

    "e2e_delay_ms": COLUMNS.e2e,
    "E2E Delay(ms)": COLUMNS.e2e,

    "syn_ack_ack_delay_ms": COLUMNS.synAckAck,
    "SYN ACK-ACK Delay(ms)": COLUMNS.synAckAck,

    "syn_syn_ack_delay_ms": COLUMNS.synSynAck,
    "SYN-SYN ACK Delay(ms)": COLUMNS.synSynAck
};

function canonicalHeader(header) {
    const normalized = normalizeHeader(header);

    if (CSV_ALIASES[normalized]) {
        return CSV_ALIASES[normalized];
    }

    const lower = normalized.toLowerCase();

    const match = Object.keys(CSV_ALIASES).find(
        key => key.toLowerCase() === lower
    );

    return match ? CSV_ALIASES[match] : normalized;
}

function normalizeParsedRows(data) {
    return (Array.isArray(data) ? data : []).map(raw => {
        const row = {};

        Object.entries(raw || {}).forEach(([key, value]) => {
            row[canonicalHeader(key)] = value;
        });

        return row;
    });
}

async function fetchCsvText(url) {
    const response = await fetch(url, {
        method: "GET",
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} ${response.statusText}`
        );
    }

    const text = await response.text();

    if (!text || !text.trim()) {
        throw new Error("File CSV kosong.");
    }

    return text;
}

/* =========================================================
   VALIDATE CSV
   ========================================================= */

function validateColumns(data) {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
            "CSV tidak memiliki data."
        );
    }

    const first = data[0];

    if (!first || typeof first !== "object") {
        throw new Error(
            "Format CSV tidak dapat dibaca sebagai tabel."
        );
    }

    const actualColumns = Object.keys(first);
    const requiredColumns = Object.values(COLUMNS);

    const missing = requiredColumns.filter(
        column => !actualColumns.includes(column)
    );

    if (missing.length > 0) {
        console.error("Kolom CSV ditemukan:", actualColumns);
        console.error("Kolom yang dibutuhkan:", requiredColumns);
        console.error("Kolom yang hilang:", missing);

        throw new Error(
            "Kolom CSV tidak sesuai. Kolom hilang: " +
            missing.join(", ")
        );
    }

    return true;
}

/* =========================================================
   CLEAN ROWS
   ========================================================= */

function cleanRows(data) {
    const cleaned = [];

    for (const raw of data) {
        if (!raw || typeof raw !== "object") {
            continue;
        }

        const row = {};

        Object.keys(raw).forEach(key => {
            const cleanKey = normalizeHeader(key);

            let value = raw[key];

            if (typeof value === "string") {
                value = value
                    .replace(/^\uFEFF/, "")
                    .trim();
            }

            row[cleanKey] = value;
        });

        const date = parseDate(row[COLUMNS.date]);

        if (!date) {
            return;
        }

        row.__date = date;

        row.__region = String(row[COLUMNS.region] || "").trim();
        row.__circle = String(row[COLUMNS.circle] || "").trim();
        row.__branch = String(row[COLUMNS.branch] || "").trim();
        row.__kabupaten = String(row[COLUMNS.kabupaten] || "").trim();

        cleaned.push(row);
    }

    cleaned.sort((a, b) => a.__date - b.__date);

    return cleaned;
}

/* =========================================================
   LOAD CSV
   ========================================================= */

async function parseCsvText(text, sourceUrl) {
    if (!text || !text.trim()) {
        throw new Error(
            "Response CSV kosong dari: " + sourceUrl
        );
    }

    const firstText = text.trim().slice(0, 300).toLowerCase();

    if (
        firstText.startsWith("<!doctype html") ||
        firstText.startsWith("<html") ||
        firstText.includes("<html")
    ) {
        throw new Error(
            "Response bukan CSV tetapi HTML dari: " + sourceUrl
        );
    }

    if (typeof Papa === "undefined") {
        throw new Error(
            "PapaParse belum tersedia. Pastikan PapaParse dimuat di index.html."
        );
    }

    return await new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: true,
            skipEmptyLines: "greedy",
            dynamicTyping: false,
            delimiter: ",",

            transformHeader(header) {
                return normalizeHeader(header);
            },

            complete(results) {
                try {
                    console.log("Header CSV asli:", results.meta.fields);
                    console.log("Raw rows:", results.data.length);

                    if (results.errors && results.errors.length) {
                        console.warn(
                            "CSV parsing warnings:",
                            results.errors.slice(0, 10)
                        );
                    }

                    /*
                     * Ubah header raw_data.csv menjadi header COLUMNS.
                     */
                    const normalizedRows =
                        normalizeParsedRows(results.data);

                    validateColumns(normalizedRows);

                    const cleaned = cleanRows(normalizedRows);

                    console.log(
                        "Rows setelah cleaning:",
                        cleaned.length
                    );

                    if (!cleaned.length) {
                        throw new Error(
                            "CSV terbaca tetapi tidak ada tanggal valid pada kolom '" +
                            COLUMNS.date +
                            "'."
                        );
                    }

                    resolve(cleaned);
                } catch (error) {
                    reject(error);
                }
            },

            error(error) {
                reject(error);
            }
        });
    });
}

async function loadCsv() {
    console.log("========================================");
    console.log("SOC-SQM-DASHBOARD");
    console.log("Loading CSV...");
    console.log("CSV PATH:", CSV_PATH);
    console.log("========================================");

    showLoadingState();

    try {
        let text;
        let source = CSV_PATH;

        try {
            text = await fetchCsvText(CSV_PATH);

            /*
             * GitHub Pages pada kasus sebelumnya mengembalikan
             * hanya 2 karakter. Anggap itu sebagai deployment/file
             * yang bermasalah dan coba GitHub Raw.
             */
            if (!text || text.trim().length < 20) {
                console.warn(
                    "CSV Pages terlalu pendek/kosong. Mencoba GitHub Raw..."
                );

                source = CSV_FALLBACK_PATH;
                text = await fetchCsvText(CSV_FALLBACK_PATH);
            }
        } catch (primaryError) {
            console.warn(
                "CSV Pages gagal. Mencoba GitHub Raw...",
                primaryError
            );

            source = CSV_FALLBACK_PATH;
            text = await fetchCsvText(CSV_FALLBACK_PATH);
        }

        rows = await parseCsvText(text, source);
        filteredRows = rows.slice();

        console.log("CSV berhasil di-load.");
        console.log("Sumber CSV:", source);
        console.log("Jumlah rows:", rows.length);
        console.log(
            "Tanggal:",
            formatDateTime(rows[0].__date),
            "sampai",
            formatDateTime(rows[rows.length - 1].__date)
        );

        initializeDashboard();

        hideLoadingState();
        updateAll();

    } catch (error) {
        handleCsvError(error);
    }
}

/* =========================================================
   ERROR HANDLING
   ========================================================= */

function handleCsvError(error) {
    console.error("CSV ERROR:", error);

    rows = [];
    filteredRows = [];

    hideLoadingState();

    const message =
        error?.message ||
        "CSV gagal dimuat.";

    const container =
        $("#kpis") ||
        $(".dashboard-content") ||
        document.body;

    if (container) {
        const existing = document.querySelector(".csv-error-box");

        if (existing) {
            existing.remove();
        }

        const errorBox = document.createElement("div");

        errorBox.className = "csv-error-box";

        errorBox.style.cssText = `
            margin: 20px 0;
            padding: 18px 20px;
            border: 1px solid rgba(255,80,80,.35);
            border-radius: 12px;
            background: rgba(120,20,20,.15);
            color: #ffb4b4;
            font-family: inherit;
        `;

        errorBox.innerHTML = `
            <div style="font-size:16px;font-weight:700;margin-bottom:8px;">
                CSV gagal dimuat
            </div>

            <div style="font-size:13px;line-height:1.6;">
                ${escapeHtml(message)}
            </div>

            <div style="margin-top:10px;font-size:12px;opacity:.75;">
                Path yang dibaca:
                <strong>${escapeHtml(CSV_PATH)}</strong>
            </div>
        `;

        container.prepend(errorBox);
    }
}

/* =========================================================
   LOADING STATE
   ========================================================= */

function showLoadingState() {
    const kpis = $("#kpis");

    if (kpis) {
        kpis.innerHTML = `
            <div class="loading-state">
                Loading SQM data...
            </div>
        `;
    }
}

function hideLoadingState() {
    const loading = document.querySelector(".loading-state");

    if (loading) {
        loading.remove();
    }
}

/* =========================================================
   FILTER ELEMENTS
   ========================================================= */

function getFilterElements() {
    return {
        dateFrom: $("#dateFrom"),
        dateTo: $("#dateTo"),
        period: $("#period"),

        region: $("#region"),
        circle: $("#circle"),
        branch: $("#branch"),
        kabupaten: $("#kabupaten"),

        compare: $("#compare"),
        compareMode: $("#compareMode"),

        reset: $("#reset")
    };
}

/* =========================================================
   UNIQUE VALUES
   ========================================================= */

function uniqueSorted(values) {
    return [...new Set(
        values
            .map(v => String(v ?? "").trim())
            .filter(Boolean)
    )].sort((a, b) =>
        a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base"
        })
    );
}

/* =========================================================
   SELECT OPTIONS
   ========================================================= */

function setSelectOptions(select, values, placeholder = "All") {
    if (!select) {
        return;
    }

    const current = select.value;

    select.innerHTML = "";

    const first = document.createElement("option");

    first.value = "";
    first.textContent = placeholder;

    select.appendChild(first);

    values.forEach(value => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = value;

        select.appendChild(option);
    });

    if (values.includes(current)) {
        select.value = current;
    } else {
        select.value = "";
    }
}

/* =========================================================
   DATE RANGE
   ========================================================= */

function getMinMaxDate(sourceRows = rows) {
    if (!sourceRows.length) {
        return {
            min: null,
            max: null
        };
    }

    let min = sourceRows[0].__date;
    let max = sourceRows[0].__date;

    sourceRows.forEach(row => {
        if (row.__date < min) {
            min = row.__date;
        }

        if (row.__date > max) {
            max = row.__date;
        }
    });

    return {
        min,
        max
    };
}

function isSameOrAfter(date, from) {
    if (!from) {
        return true;
    }

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const f = new Date(from);
    f.setHours(0, 0, 0, 0);

    return d >= f;
}

function isSameOrBefore(date, to) {
    if (!to) {
        return true;
    }

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const t = new Date(to);
    t.setHours(0, 0, 0, 0);

    return d <= t;
}

function getDateRange() {
    const {
        dateFrom,
        dateTo
    } = getFilterElements();

    const from = dateFrom?.value
        ? parseDate(dateFrom.value)
        : null;

    const to = dateTo?.value
        ? parseDate(dateTo.value)
        : null;

    return {
        from,
        to
    };
}

/* =========================================================
   BASE FILTER
   ========================================================= */

function getBaseFilteredRows() {
    const {
        region,
        circle,
        branch,
        kabupaten
    } = getFilterElements();

    const {
        from,
        to
    } = getDateRange();

    return rows.filter(row => {
        if (
            region?.value &&
            row.__region !== region.value
        ) {
            return false;
        }

        if (
            circle?.value &&
            row.__circle !== circle.value
        ) {
            return false;
        }

        if (
            branch?.value &&
            row.__branch !== branch.value
        ) {
            return false;
        }

        if (
            kabupaten?.value &&
            row.__kabupaten !== kabupaten.value
        ) {
            return false;
        }

        if (!isSameOrAfter(row.__date, from)) {
            return false;
        }

        if (!isSameOrBefore(row.__date, to)) {
            return false;
        }

        return true;
    });
}

/* =========================================================
   DEPENDENT FILTERS
   ========================================================= */

function updateDependentFilters() {
    const {
        region,
        circle,
        branch,
        kabupaten
    } = getFilterElements();

    if (!region || !circle || !branch || !kabupaten) {
        return;
    }

    /*
     * REGION
     */

    const regions = uniqueSorted(
        rows.map(row => row.__region)
    );

    setSelectOptions(
        region,
        regions,
        "All Regions"
    );

    /*
     * CIRCLE
     */

    let circleRows = rows;

    if (region.value) {
        circleRows = circleRows.filter(
            row => row.__region === region.value
        );
    }

    const circles = uniqueSorted(
        circleRows.map(row => row.__circle)
    );

    setSelectOptions(
        circle,
        circles,
        "All Circles"
    );

    /*
     * BRANCH
     */

    let branchRows = circleRows;

    if (circle.value) {
        branchRows = branchRows.filter(
            row => row.__circle === circle.value
        );
    }

    const branches = uniqueSorted(
        branchRows.map(row => row.__branch)
    );

    setSelectOptions(
        branch,
        branches,
        "All Branches"
    );

    /*
     * KABUPATEN
     */

    let kabRows = branchRows;

    if (branch.value) {
        kabRows = kabRows.filter(
            row => row.__branch === branch.value
        );
    }

    const kabupatens = uniqueSorted(
        kabRows.map(row => row.__kabupaten)
    );

    setSelectOptions(
        kabupaten,
        kabupatens,
        "All Kabupaten"
    );
}

/* =========================================================
   SET DATE LIMITS
   ========================================================= */

function initializeDateInputs() {
    const {
        dateFrom,
        dateTo
    } = getFilterElements();

    if (!dateFrom || !dateTo || !rows.length) {
        return;
    }

    const {
        min,
        max
    } = getMinMaxDate(rows);

    const minValue = dateInputValue(min);
    const maxValue = dateInputValue(max);

    dateFrom.min = minValue;
    dateFrom.max = maxValue;

    dateTo.min = minValue;
    dateTo.max = maxValue;

    /*
     * Default:
     * seluruh periode data.
     */

    if (!dateFrom.value) {
        dateFrom.value = minValue;
    }

    if (!dateTo.value) {
        dateTo.value = maxValue;
    }
}

/* =========================================================
   GET FILTERED ROWS
   ========================================================= */

function getFilteredRows() {
    return getBaseFilteredRows();
}

/* =========================================================
   PERIOD BUCKET
   ========================================================= */

function bucketDate(date, period) {
    const d = new Date(date);

    if (period === "15min") {
        const minute = d.getMinutes();

        const bucketMinute =
            Math.floor(minute / 15) * 15;

        d.setMinutes(bucketMinute, 0, 0);

        return d;
    }

    if (period === "hourly" || period === "hour") {
        d.setMinutes(0, 0, 0);

        return d;
    }

    if (period === "daily" || period === "day") {
        d.setHours(0, 0, 0, 0);

        return d;
    }

    return d;
}

/* =========================================================
   AGGREGATE ROWS
   ========================================================= */

function average(values) {
    const valid = values.filter(
        value => value !== null
    );

    if (!valid.length) {
        return null;
    }

    return valid.reduce(
        (sum, value) => sum + value,
        0
    ) / valid.length;
}

function aggregateRows(sourceRows, period = currentPeriod) {
    if (!sourceRows.length) {
        return [];
    }

    const groups = new Map();

    sourceRows.forEach(row => {
        const bucket = bucketDate(
            row.__date,
            period
        );

        const key = bucket.getTime();

        if (!groups.has(key)) {
            groups.set(key, {
                date: bucket,
                rows: []
            });
        }

        groups.get(key).rows.push(row);
    });

    const result = [];

    groups.forEach(group => {
        const groupRows = group.rows;

        const item = {
            date: group.date,
            count: groupRows.length
        };

        /*
         * Traffic SUM
         */

        const trafficValues = groupRows
            .map(row =>
                numberValue(row[COLUMNS.traffic])
            )
            .filter(v => v !== null);

        item.traffic =
            trafficValues.length
                ? trafficValues.reduce(
                    (sum, value) => sum + value,
                    0
                ) / TRAFFIC_DIVISOR
                : null;

        /*
         * Average metrics
         */

        item.dlRetx = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.dlRetx])
            )
        );

        item.ulRetx = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.ulRetx])
            )
        );

        item.tcp = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.tcp])
            )
        );

        item.dlLoss = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.dlLoss])
            )
        );

        item.ulLoss = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.ulLoss])
            )
        );

        item.e2e = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.e2e])
            )
        );

        item.synAckAck = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.synAckAck])
            )
        );

        item.synSynAck = average(
            groupRows.map(row =>
                numberValue(row[COLUMNS.synSynAck])
            )
        );

        result.push(item);
    });

    result.sort(
        (a, b) => a.date - b.date
    );

    return result;
}

/* =========================================================
   KPI CALCULATIONS
   ========================================================= */

function calculateKpis(sourceRows) {
    if (!sourceRows.length) {
        return {
            traffic: null,
            dlRetx: null,
            ulRetx: null,
            tcp: null,
            dlLoss: null,
            ulLoss: null,
            e2e: null,
            synAckAck: null,
            synSynAck: null
        };
    }

    const traffic = sourceRows
        .map(row =>
            numberValue(row[COLUMNS.traffic])
        )
        .filter(v => v !== null)
        .reduce(
            (sum, value) => sum + value,
            0
        ) / TRAFFIC_DIVISOR;

    return {
        traffic,

        dlRetx: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.dlRetx])
            )
        ),

        ulRetx: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.ulRetx])
            )
        ),

        tcp: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.tcp])
            )
        ),

        dlLoss: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.dlLoss])
            )
        ),

        ulLoss: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.ulLoss])
            )
        ),

        e2e: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.e2e])
            )
        ),

        synAckAck: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.synAckAck])
            )
        ),

        synSynAck: average(
            sourceRows.map(row =>
                numberValue(row[COLUMNS.synSynAck])
            )
        )
    };
}

/* =========================================================
   RENDER KPI
   ========================================================= */

function renderKpis(sourceRows) {
    const container = $("#kpis");

    if (!container) {
        return;
    }

    if (!sourceRows.length) {
        container.innerHTML = `
            <div class="empty-state">
                No data for selected filters.
            </div>
        `;

        return;
    }

    const kpi = calculateKpis(sourceRows);

    const cards = [
        {
            key: "traffic",
            label: "Total Traffic",
            value: formatNumber(kpi.traffic, 2),
            unit: TRAFFIC_UNIT
        },
        {
            key: "tcp",
            label: "TCP Connection Success",
            value: formatNumber(kpi.tcp, 2),
            unit: "%"
        },
        {
            key: "dlRetx",
            label: "DL TCP Retransmission",
            value: formatNumber(kpi.dlRetx, 2),
            unit: "%"
        },
        {
            key: "ulRetx",
            label: "UL TCP Retransmission",
            value: formatNumber(kpi.ulRetx, 2),
            unit: "%"
        },
        {
            key: "dlLoss",
            label: "DL TCP Packet Loss",
            value: formatNumber(kpi.dlLoss, 2),
            unit: "%"
        },
        {
            key: "ulLoss",
            label: "UL TCP Packet Loss",
            value: formatNumber(kpi.ulLoss, 2),
            unit: "%"
        },
        {
            key: "e2e",
            label: "E2E Delay",
            value: formatNumber(kpi.e2e, 2),
            unit: "ms"
        },
        {
            key: "synAckAck",
            label: "SYN ACK-ACK Delay",
            value: formatNumber(kpi.synAckAck, 2),
            unit: "ms"
        },
        {
            key: "synSynAck",
            label: "SYN-SYN ACK Delay",
            value: formatNumber(kpi.synSynAck, 2),
            unit: "ms"
        }
    ];

    container.innerHTML = cards.map(card => `
        <div class="kpi-card" data-metric="${card.key}">
            <div class="kpi-label">
                ${escapeHtml(card.label)}
            </div>

            <div class="kpi-value">
                ${escapeHtml(card.value)}
            </div>

            <div class="kpi-unit">
                ${escapeHtml(card.unit)}
            </div>
        </div>
    `).join("");
}

/* =========================================================
   CHART HELPERS
   ========================================================= */

function destroyChart(name) {
    if (charts[name]) {
        charts[name].destroy();
        charts[name] = null;
    }
}

function getChartCanvas(name) {
    const possibleIds = [
        name,
        `${name}Chart`,
        `chart-${name}`
    ];

    for (const id of possibleIds) {
        const element = document.getElementById(id);

        if (element) {
            return element;
        }
    }

    return null;
}

function chartLabel(date, period, multipleDays = false) {
    const d = new Date(date);

    if (period === "daily" || period === "day") {
        return d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short"
        });
    }

    const time = d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit"
    });

    if (multipleDays) {
        const datePart = d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short"
        });

        return `${datePart} ${time}`;
    }

    return time;
}

/* =========================================================
   CHART DATA
   ========================================================= */

function buildChartData(data) {
    const multipleDays =
        data.length > 1 &&
        dateKey(data[0].date) !==
        dateKey(data[data.length - 1].date);

    return {
        labels: data.map(item =>
            chartLabel(
                item.date,
                currentPeriod,
                multipleDays
            )
        ),

        traffic: data.map(item =>
            item.traffic
        ),

        tcp: data.map(item =>
            item.tcp
        ),

        dlRetx: data.map(item =>
            item.dlRetx
        ),

        ulRetx: data.map(item =>
            item.ulRetx
        ),

        dlLoss: data.map(item =>
            item.dlLoss
        ),

        ulLoss: data.map(item =>
            item.ulLoss
        ),

        e2e: data.map(item =>
            item.e2e
        ),

        synAckAck: data.map(item =>
            item.synAckAck
        ),

        synSynAck: data.map(item =>
            item.synSynAck
        )
    };
}

/* =========================================================
   CREATE CHART
   ========================================================= */

function createLineChart(
    canvas,
    chartName,
    labels,
    datasets
) {
    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    destroyChart(chartName);

    charts[chartName] = new Chart(
        canvas.getContext("2d"),
        {
            type: "line",

            data: {
                labels,

                datasets
            },

            options: {
                responsive: true,

                maintainAspectRatio: false,

                interaction: {
                    mode: "index",
                    intersect: false
                },

                plugins: {
                    legend: {
                        display: true
                    },

                    tooltip: {
                        mode: "index",
                        intersect: false
                    }
                },

                scales: {
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },

                    y: {
                        beginAtZero: false
                    }
                }
            }
        }
    );
}

/* =========================================================
   RENDER CHARTS
   ========================================================= */

function renderCharts(sourceRows) {
    if (typeof Chart === "undefined") {
        console.warn(
            "Chart.js tidak ditemukan."
        );

        return;
    }

    const data = aggregateRows(
        sourceRows,
        currentPeriod
    );

    const chartData = buildChartData(data);

    /*
     * Traffic
     */

    const trafficCanvas =
        getChartCanvas("traffic");

    if (trafficCanvas) {
        createLineChart(
            trafficCanvas,
            "traffic",
            chartData.labels,
            [
                {
                    label: `Traffic (${TRAFFIC_UNIT})`,
                    data: chartData.traffic,
                    tension: 0.25,
                    spanGaps: true
                }
            ]
        );
    }

    /*
     * TCP
     */

    const tcpCanvas =
        getChartCanvas("tcp");

    if (tcpCanvas) {
        createLineChart(
            tcpCanvas,
            "tcp",
            chartData.labels,
            [
                {
                    label: "TCP Connection Success (%)",
                    data: chartData.tcp,
                    tension: 0.25,
                    spanGaps: true
                }
            ]
        );
    }

    /*
     * Retransmission
     */

    const retxCanvas =
        getChartCanvas("retransmission");

    if (retxCanvas) {
        createLineChart(
            retxCanvas,
            "retransmission",
            chartData.labels,
            [
                {
                    label: "DL Retransmission (%)",
                    data: chartData.dlRetx,
                    tension: 0.25,
                    spanGaps: true
                },
                {
                    label: "UL Retransmission (%)",
                    data: chartData.ulRetx,
                    tension: 0.25,
                    spanGaps: true
                }
            ]
        );
    }

    /*
     * Packet Loss
     */

    const lossCanvas =
        getChartCanvas("loss");

    if (lossCanvas) {
        createLineChart(
            lossCanvas,
            "loss",
            chartData.labels,
            [
                {
                    label: "DL Packet Loss (%)",
                    data: chartData.dlLoss,
                    tension: 0.25,
                    spanGaps: true
                },
                {
                    label: "UL Packet Loss (%)",
                    data: chartData.ulLoss,
                    tension: 0.25,
                    spanGaps: true
                }
            ]
        );
    }

    /*
     * Delay
     */

    const delayCanvas =
        getChartCanvas("delay");

    if (delayCanvas) {
        createLineChart(
            delayCanvas,
            "delay",
            chartData.labels,
            [
                {
                    label: "E2E Delay (ms)",
                    data: chartData.e2e,
                    tension: 0.25,
                    spanGaps: true
                },
                {
                    label: "SYN ACK-ACK (ms)",
                    data: chartData.synAckAck,
                    tension: 0.25,
                    spanGaps: true
                },
                {
                    label: "SYN-SYN ACK (ms)",
                    data: chartData.synSynAck,
                    tension: 0.25,
                    spanGaps: true
                }
            ]
        );
    }
}

/* =========================================================
   COMPARISON
   ========================================================= */

function shiftDate(date, days) {
    const d = new Date(date);

    d.setDate(
        d.getDate() + days
    );

    return d;
}

function getSelectedRange() {
    const {
        from,
        to
    } = getDateRange();

    if (!from || !to) {
        return null;
    }

    return {
        from,
        to
    };
}

function getComparisonRange() {
    const range = getSelectedRange();

    if (!range) {
        return null;
    }

    const from = new Date(range.from);
    const to = new Date(range.to);

    const diff =
        Math.round(
            (
                to.getTime() -
                from.getTime()
            ) /
            86400000
        ) + 1;

    if (compareMode === "lastWeek") {
        return {
            from: shiftDate(from, -7),
            to: shiftDate(to, -7)
        };
    }

    return {
        from: shiftDate(from, -diff),
        to: shiftDate(to, -diff)
    };
}

function getComparisonRows() {
    const comparisonRange =
        getComparisonRange();

    if (!comparisonRange) {
        return [];
    }

    const {
        region,
        circle,
        branch,
        kabupaten
    } = getFilterElements();

    return rows.filter(row => {
        if (
            region?.value &&
            row.__region !== region.value
        ) {
            return false;
        }

        if (
            circle?.value &&
            row.__circle !== circle.value
        ) {
            return false;
        }

        if (
            branch?.value &&
            row.__branch !== branch.value
        ) {
            return false;
        }

        if (
            kabupaten?.value &&
            row.__kabupaten !== kabupaten.value
        ) {
            return false;
        }

        return (
            row.__date >= comparisonRange.from &&
            row.__date <= comparisonRange.to
        );
    });
}

/* =========================================================
   COMPARISON KPI
   ========================================================= */

function renderComparison(sourceRows) {
    if (!compareEnabled) {
        return;
    }

    const comparisonRows =
        getComparisonRows();

    if (!comparisonRows.length) {
        return;
    }

    const current =
        calculateKpis(sourceRows);

    const previous =
        calculateKpis(comparisonRows);

    const cards =
        $$(".kpi-card");

    cards.forEach(card => {
        const metric =
            card.dataset.metric;

        if (!metric) {
            return;
        }

        const currentValue =
            numberValue(current[metric]);

        const previousValue =
            numberValue(previous[metric]);

        if (
            currentValue === null ||
            previousValue === null ||
            previousValue === 0
        ) {
            return;
        }

        const change =
            (
                (
                    currentValue -
                    previousValue
                ) /
                Math.abs(previousValue)
            ) * 100;

        let comparison =
            card.querySelector(".kpi-comparison");

        if (!comparison) {
            comparison =
                document.createElement("div");

            comparison.className =
                "kpi-comparison";

            card.appendChild(comparison);
        }

        comparison.textContent =
            `${change >= 0 ? "+" : ""}${change.toFixed(2)}% vs previous`;
    });
}

/* =========================================================
   TABLE
   ========================================================= */

function renderTable(sourceRows) {
    const head =
        $("#tableHead");

    const body =
        $("#tableBody");

    if (!head || !body) {
        return;
    }

    const data =
        aggregateRows(
            sourceRows,
            currentPeriod
        );

    currentTableRows = data;

    head.innerHTML = `
        <tr>
            <th>Date / Time</th>
            <th>Traffic</th>
            <th>DL Retx</th>
            <th>UL Retx</th>
            <th>TCP Success</th>
            <th>DL Loss</th>
            <th>UL Loss</th>
            <th>E2E</th>
            <th>SYN ACK-ACK</th>
            <th>SYN-SYN ACK</th>
        </tr>
    `;

    if (!data.length) {
        body.innerHTML = `
            <tr>
                <td colspan="10">
                    No data
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML = data.map(item => `
        <tr>
            <td>
                ${escapeHtml(
                    formatDateTime(item.date)
                )}
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.traffic, 2)
                )}
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.dlRetx, 2)
                )}%
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.ulRetx, 2)
                )}%
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.tcp, 2)
                )}%
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.dlLoss, 2)
                )}%
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.ulLoss, 2)
                )}%
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.e2e, 2)
                )} ms
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.synAckAck, 2)
                )} ms
            </td>

            <td>
                ${escapeHtml(
                    formatNumber(item.synSynAck, 2)
                )} ms
            </td>
        </tr>
    `).join("");
}

/* =========================================================
   DATA PAGE
   ========================================================= */

function renderDataPage(sourceRows = rows) {
    const head =
        $("#dataHead");

    const body =
        $("#dataBody");

    const count =
        $("#dataCount");

    if (!head || !body) {
        return;
    }

    currentDataRows =
        sourceRows.slice();

    const columns = [
        COLUMNS.date,
        COLUMNS.region,
        COLUMNS.branch,
        COLUMNS.kabupaten,
        COLUMNS.circle,
        COLUMNS.traffic,
        COLUMNS.dlRetx,
        COLUMNS.ulRetx,
        COLUMNS.tcp,
        COLUMNS.dlLoss,
        COLUMNS.ulLoss,
        COLUMNS.e2e,
        COLUMNS.synAckAck,
        COLUMNS.synSynAck
    ];

    head.innerHTML = `
        <tr>
            ${columns.map(column => `
                <th>${escapeHtml(column)}</th>
            `).join("")}
        </tr>
    `;

    if (!sourceRows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="${columns.length}">
                    No data
                </td>
            </tr>
        `;

        if (count) {
            count.textContent = "0 rows";
        }

        return;
    }

    /*
     * Limit rendering to 5000 rows
     * to keep browser responsive.
     */

    const displayRows =
        sourceRows.slice(0, 5000);

    body.innerHTML =
        displayRows.map(row => `
            <tr>
                ${columns.map(column => `
                    <td>
                        ${escapeHtml(
                            row[column] ?? ""
                        )}
                    </td>
                `).join("")}
            </tr>
        `).join("");

    if (count) {
        count.textContent =
            `${sourceRows.length.toLocaleString()} rows`;
    }
}

/* =========================================================
   DATA SEARCH
   ========================================================= */

function setupDataSearch() {
    const search =
        $("#dataSearch");

    if (!search) {
        return;
    }

    search.addEventListener(
        "input",
        () => {
            const keyword =
                search.value
                    .trim()
                    .toLowerCase();

            if (!keyword) {
                renderDataPage(rows);
                return;
            }

            const result =
                rows.filter(row =>
                    Object.values(row)
                        .some(value =>
                            String(value ?? "")
                                .toLowerCase()
                                .includes(keyword)
                        )
                );

            renderDataPage(result);
        }
    );
}

/* =========================================================
   MAP / REGION PERFORMANCE
   ========================================================= */

function renderRegionPerformance(sourceRows) {
    const container =
        $("#regionPerformance");

    if (!container) {
        return;
    }

    const groups = new Map();

    sourceRows.forEach(row => {
        const region =
            row.__region || "UNKNOWN";

        if (!groups.has(region)) {
            groups.set(region, []);
        }

        groups.get(region).push(row);
    });

    const result = [];

    groups.forEach((regionRows, region) => {
        const kpi =
            calculateKpis(regionRows);

        result.push({
            region,
            rows: regionRows.length,
            traffic: kpi.traffic,
            tcp: kpi.tcp,
            dlLoss: kpi.dlLoss,
            ulLoss: kpi.ulLoss,
            e2e: kpi.e2e
        });
    });

    result.sort(
        (a, b) =>
            (b.traffic || 0) -
            (a.traffic || 0)
    );

    if (!result.length) {
        container.innerHTML = `
            <div class="empty-state">
                No region data
            </div>
        `;

        return;
    }

    container.innerHTML = result.map(item => `
        <div class="region-row">
            <div class="region-name">
                ${escapeHtml(item.region)}
            </div>

            <div class="region-metric">
                <span>Traffic</span>
                <strong>
                    ${escapeHtml(
                        formatNumber(
                            item.traffic,
                            2
                        )
                    )}
                </strong>
            </div>

            <div class="region-metric">
                <span>TCP</span>
                <strong>
                    ${escapeHtml(
                        formatNumber(
                            item.tcp,
                            2
                        )
                    )}%
                </strong>
            </div>

            <div class="region-metric">
                <span>E2E</span>
                <strong>
                    ${escapeHtml(
                        formatNumber(
                            item.e2e,
                            2
                        )
                    )} ms
                </strong>
            </div>
        </div>
    `).join("");
}

function renderMapList(sourceRows) {
    const container =
        $("#mapList");

    if (!container) {
        return;
    }

    const groups = new Map();

    sourceRows.forEach(row => {
        const region =
            row.__region || "UNKNOWN";

        if (!groups.has(region)) {
            groups.set(region, 0);
        }

        groups.set(
            region,
            groups.get(region) + 1
        );
    });

    const result =
        [...groups.entries()]
            .sort((a, b) =>
                b[1] - a[1]
            );

    container.innerHTML =
        result.map(([region, count]) => `
            <div class="map-list-item">
                <span>
                    ${escapeHtml(region)}
                </span>

                <strong>
                    ${count.toLocaleString()}
                </strong>
            </div>
        `).join("");
}

/* =========================================================
   TOPOLOGY
   ========================================================= */

function renderTopology(sourceRows) {
    const canvas =
        $("#topologyCanvas");

    if (!canvas) {
        return;
    }

    const ctx =
        canvas.getContext("2d");

    if (!ctx) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const width =
        Math.max(
            300,
            Math.floor(rect.width || 900)
        );

    const height =
        Math.max(
            300,
            Math.floor(rect.height || 500)
        );

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        width * dpr;

    canvas.height =
        height * dpr;

    ctx.scale(dpr, dpr);

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    const regions =
        uniqueSorted(
            sourceRows.map(
                row => row.__region
            )
        );

    if (!regions.length) {
        return;
    }

    const centerX =
        width / 2;

    const centerY =
        height / 2;

    const radius =
        Math.min(width, height) *
        0.33;

    /*
     * Center
     */

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        40,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        "#162333";

    ctx.fill();

    ctx.strokeStyle =
        "#3c78a8";

    ctx.stroke();

    ctx.fillStyle =
        "#e8eef7";

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "bold 13px Arial";

    ctx.fillText(
        "SQM",
        centerX,
        centerY
    );

    regions.forEach(
        (region, index) => {
            const angle =
                (
                    index /
                    regions.length
                ) *
                Math.PI *
                2 -
                Math.PI / 2;

            const x =
                centerX +
                Math.cos(angle) *
                radius;

            const y =
                centerY +
                Math.sin(angle) *
                radius;

            /*
             * Line
             */

            ctx.beginPath();

            ctx.moveTo(
                centerX,
                centerY
            );

            ctx.lineTo(
                x,
                y
            );

            ctx.strokeStyle =
                "rgba(100,140,180,.35)";

            ctx.stroke();

            /*
             * Node
             */

            ctx.beginPath();

            ctx.arc(
                x,
                y,
                25,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                "#101b28";

            ctx.fill();

            ctx.strokeStyle =
                "#4d7da5";

            ctx.stroke();

            /*
             * Text
             */

            ctx.fillStyle =
                "#dce8f5";

            ctx.font =
                "11px Arial";

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "middle";

            const label =
                region.length > 18
                    ? region.slice(0, 16) + "..."
                    : region;

            ctx.fillText(
                label,
                x,
                y
            );
        }
    );

    topologyInitialized = true;
}

/* =========================================================
   CSV DOWNLOAD
   ========================================================= */

function csvEscape(value) {
    const text =
        String(value ?? "");

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n")
    ) {
        return `"${text.replace(
            /"/g,
            '""'
        )}"`;
    }

    return text;
}

function rowsToCsv(sourceRows) {
    const columns = [
        COLUMNS.date,
        COLUMNS.region,
        COLUMNS.branch,
        COLUMNS.kabupaten,
        COLUMNS.circle,
        COLUMNS.traffic,
        COLUMNS.dlRetx,
        COLUMNS.ulRetx,
        COLUMNS.tcp,
        COLUMNS.dlLoss,
        COLUMNS.ulLoss,
        COLUMNS.e2e,
        COLUMNS.synAckAck,
        COLUMNS.synSynAck
    ];

    const lines = [];

    lines.push(
        columns.map(csvEscape).join(",")
    );

    sourceRows.forEach(row => {
        lines.push(
            columns
                .map(column =>
                    csvEscape(
                        row[column]
                    )
                )
                .join(",")
        );
    });

    return lines.join("\r\n");
}

function downloadCsvFile(
    sourceRows,
    filename = "sqm_filtered_data.csv"
) {
    const csv =
        rowsToCsv(sourceRows);

    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
    const navButtons =
        $$(".nav-btn");

    const views =
        $$(".view");

    navButtons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const target =
                    button.dataset.target ||
                    button.dataset.view;

                if (!target) {
                    return;
                }

                navButtons.forEach(btn =>
                    btn.classList.remove(
                        "active"
                    )
                );

                button.classList.add(
                    "active"
                );

                views.forEach(view => {
                    view.classList.remove(
                        "active"
                    );

                    if (
                        view.id === target ||
                        view.dataset.view === target
                    ) {
                        view.classList.add(
                            "active"
                        );
                    }
                });

                if (
                    target === "mapView" ||
                    target === "map"
                ) {
                    setTimeout(() => {
                        renderTopology(
                            filteredRows
                        );
                    }, 100);
                }

                if (
                    target === "dataView" ||
                    target === "data"
                ) {
                    renderDataPage(
                        filteredRows
                    );
                }
            }
        );
    });

    /*
     * Map tabs
     */

    $$(".map-tab").forEach(tab => {
        tab.addEventListener(
            "click",
            () => {
                $$(".map-tab").forEach(
                    item =>
                        item.classList.remove(
                            "active"
                        )
                );

                tab.classList.add(
                    "active"
                );
            }
        );
    });
}

/* =========================================================
   FILTER EVENTS
   ========================================================= */

function setupFilters() {
    const {
        region,
        circle,
        branch,
        kabupaten,
        dateFrom,
        dateTo,
        period,
        compare,
        compareMode,
        reset
    } = getFilterElements();

    /*
     * Region
     */

    region?.addEventListener(
        "change",
        () => {
            updateDependentFilters();

            /*
             * Preserve region after rebuilding.
             */

            if (region.value) {
                const value =
                    region.value;

                setSelectOptions(
                    region,
                    uniqueSorted(
                        rows.map(
                            row =>
                                row.__region
                        )
                    ),
                    "All Regions"
                );

                region.value = value;
            }

            updateAll();
        }
    );

    /*
     * Circle
     */

    circle?.addEventListener(
        "change",
        () => {
            const selected =
                circle.value;

            updateDependentFilters();

            if (
                [...circle.options]
                    .some(
                        option =>
                            option.value === selected
                    )
            ) {
                circle.value =
                    selected;
            }

            updateAll();
        }
    );

    /*
     * Branch
     */

    branch?.addEventListener(
        "change",
        () => {
            const selected =
                branch.value;

            updateDependentFilters();

            if (
                [...branch.options]
                    .some(
                        option =>
                            option.value === selected
                    )
            ) {
                branch.value =
                    selected;
            }

            updateAll();
        }
    );

    /*
     * Kabupaten
     */

    kabupaten?.addEventListener(
        "change",
        updateAll
    );

    /*
     * Date
     */

    dateFrom?.addEventListener(
        "change",
        () => {
            if (
                dateFrom.value &&
                dateTo?.value &&
                dateFrom.value >
                    dateTo.value
            ) {
                dateTo.value =
                    dateFrom.value;
            }

            updateAll();
        }
    );

    dateTo?.addEventListener(
        "change",
        () => {
            if (
                dateTo.value &&
                dateFrom?.value &&
                dateTo.value <
                    dateFrom.value
            ) {
                dateFrom.value =
                    dateTo.value;
            }

            updateAll();
        }
    );

    /*
     * Period
     */

    period?.addEventListener(
        "change",
        () => {
            currentPeriod =
                normalizePeriod(
                    period.value
                );

            updateAll();
        }
    );

    /*
     * Compare
     */

    compare?.addEventListener(
        "change",
        () => {
            compareEnabled =
                compare.checked;

            if (compareMode) {
                compareMode.disabled =
                    !compareEnabled;
            }

            updateAll();
        }
    );

    compareMode?.addEventListener(
        "change",
        () => {
            compareMode =
                compareMode.value;

            updateAll();
        }
    );

    /*
     * Reset
     */

    reset?.addEventListener(
        "click",
        resetFilters
    );
}

/* =========================================================
   PERIOD NORMALIZATION
   ========================================================= */

function normalizePeriod(value) {
    const text =
        String(value || "")
            .toLowerCase()
            .trim();

    if (
        text === "hour" ||
        text === "hourly" ||
        text === "1h"
    ) {
        return "hourly";
    }

    if (
        text === "day" ||
        text === "daily" ||
        text === "1d"
    ) {
        return "daily";
    }

    return "15min";
}

/* =========================================================
   RESET FILTERS
   ========================================================= */

function resetFilters() {
    const {
        region,
        circle,
        branch,
        kabupaten,
        dateFrom,
        dateTo,
        period,
        compare,
        compareMode
    } = getFilterElements();

    /*
     * Clear hierarchy
     */

    if (region) {
        region.value = "";
    }

    if (circle) {
        circle.value = "";
    }

    if (branch) {
        branch.value = "";
    }

    if (kabupaten) {
        kabupaten.value = "";
    }

    /*
     * Reset date
     */

    const {
        min,
        max
    } = getMinMaxDate(rows);

    if (dateFrom) {
        dateFrom.value =
            dateInputValue(min);
    }

    if (dateTo) {
        dateTo.value =
            dateInputValue(max);
    }

    /*
     * Reset period
     */

    currentPeriod = "15min";

    if (period) {
        period.value = "15min";
    }

    /*
     * Reset compare
     */

    compareEnabled = false;

    if (compare) {
        compare.checked = false;
    }

    if (compareMode) {
        compareMode.disabled = true;
        compareMode.value = "previous";
    }

    updateDependentFilters();

    updateAll();
}

/* =========================================================
   UPDATE ALL
   ========================================================= */

function updateAll() {
    if (!rows.length) {
        return;
    }

    filteredRows =
        getFilteredRows();

    /*
     * KPI
     */

    renderKpis(
        filteredRows
    );

    /*
     * Charts
     */

    renderCharts(
        filteredRows
    );

    /*
     * Comparison
     */

    if (compareEnabled) {
        renderComparison(
            filteredRows
        );
    }

    /*
     * Table
     */

    renderTable(
        filteredRows
    );

    /*
     * Region
     */

    renderRegionPerformance(
        filteredRows
    );

    /*
     * Map
     */

    renderMapList(
        filteredRows
    );

    /*
     * Data page
     */

    renderDataPage(
        filteredRows
    );

    /*
     * Topology if visible
     */

    const mapView =
        $("#mapView");

    if (
        mapView &&
        (
            mapView.classList.contains(
                "active"
            ) ||
            mapView.style.display !== "none"
        )
    ) {
        setTimeout(() => {
            renderTopology(
                filteredRows
            );
        }, 50);
    }

    /*
     * Update status
     */

    updateStatus();
}

/* =========================================================
   STATUS
   ========================================================= */

function updateStatus() {
    const possibleSelectors = [
        ".status-text",
        "#statusText",
        ".data-status"
    ];

    const count =
        filteredRows.length;

    possibleSelectors.forEach(
        selector => {
            const element =
                $(selector);

            if (!element) {
                return;
            }

            element.textContent =
                `${count.toLocaleString()} records`;
        }
    );
}

/* =========================================================
   CLOCK
   ========================================================= */

function setupClock() {
    const clock =
        $(".clock");

    if (!clock) {
        return;
    }

    function updateClock() {
        const now =
            new Date();

        clock.textContent =
            now.toLocaleString(
                "en-GB",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );
    }

    updateClock();

    setInterval(
        updateClock,
        1000
    );
}

/* =========================================================
   SETTINGS
   ========================================================= */

function setupSettings() {
    const settingRows =
        $$("#settingsView .setting-row");

    settingRows.forEach(row => {
        const checkbox =
            row.querySelector(
                'input[type="checkbox"]'
            );

        if (!checkbox) {
            return;
        }

        checkbox.addEventListener(
            "change",
            () => {
                document.body.classList.toggle(
                    row.dataset.class || "",
                    checkbox.checked
                );
            }
        );
    });
}

/* =========================================================
   DOWNLOAD BUTTONS
   ========================================================= */

function setupDownloads() {
    const buttons = [
        $("#downloadCsv"),
        $("#downloadCsv2")
    ].filter(Boolean);

    buttons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                downloadCsvFile(
                    filteredRows
                );
            }
        );
    });
}

/* =========================================================
   MAP SEARCH
   ========================================================= */

function setupMapSearch() {
    const search =
        $("#mapSearch");

    if (!search) {
        return;
    }

    search.addEventListener(
        "input",
        () => {
            const keyword =
                search.value
                    .trim()
                    .toLowerCase();

            const container =
                $("#mapList");

            if (!container) {
                return;
            }

            const regions =
                uniqueSorted(
                    filteredRows.map(
                        row =>
                            row.__region
                    )
                );

            const filtered =
                regions.filter(
                    region =>
                        region
                            .toLowerCase()
                            .includes(keyword)
                );

            const counts =
                new Map();

            filteredRows.forEach(row => {
                const region =
                    row.__region;

                if (
                    filtered.includes(
                        region
                    )
                ) {
                    counts.set(
                        region,
                        (counts.get(region) || 0) + 1
                    );
                }
            });

            container.innerHTML =
                filtered.map(
                    region => `
                        <div class="map-list-item">
                            <span>
                                ${escapeHtml(region)}
                            </span>
                            <strong>
                                ${(
                                    counts.get(
                                        region
                                    ) || 0
                                ).toLocaleString()}
                            </strong>
                        </div>
                    `
                ).join("");
        }
    );
}

/* =========================================================
   INITIALIZE DASHBOARD
   ========================================================= */

function initializeDashboard() {
    initializeDateInputs();

    updateDependentFilters();

    setupFilters();

    setupNavigation();

    setupDataSearch();

    setupDownloads();

    setupMapSearch();

    setupClock();

    setupSettings();

    /*
     * Compare default
     */

    const {
        compare,
        compareMode: compareModeElement,
        period
    } = getFilterElements();

    if (compare) {
        compareEnabled =
            compare.checked;
    }

    if (compareModeElement) {
        compareModeElement.disabled =
            !compareEnabled;

        compareMode =
            compareModeElement.value ||
            "previous";
    }

    if (period) {
        currentPeriod =
            normalizePeriod(
                period.value
            );
    }

    /*
     * Resize topology
     */

    window.addEventListener(
        "resize",
        () => {
            if (topologyInitialized) {
                renderTopology(
                    filteredRows
                );
            }
        }
    );
}

/* =========================================================
   DEBUG INFORMATION
   ========================================================= */

function printDebugInfo() {
    console.log(
        "========== SQM DEBUG =========="
    );

    console.log(
        "CSV_PATH:",
        CSV_PATH
    );

    console.log(
        "Rows:",
        rows.length
    );

    if (rows.length) {
        console.log(
            "First row:",
            rows[0]
        );

        console.log(
            "Last row:",
            rows[rows.length - 1]
        );

        console.log(
            "First date:",
            rows[0].__date
        );

        console.log(
            "Last date:",
            rows[rows.length - 1].__date
        );

        console.log(
            "Regions:",
            uniqueSorted(
                rows.map(
                    row =>
                        row.__region
                )
            )
        );

        console.log(
            "Circles:",
            uniqueSorted(
                rows.map(
                    row =>
                        row.__circle
                )
            )
        );
    }

    console.log(
        "==============================="
    );
}

/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        console.log(
            "SOC-SQM-DASHBOARD starting..."
        );

        loadCsv();
    }
);

/* =========================================================
   GLOBAL DEBUG
   ========================================================= */

window.SQMDashboard = {
    getRows: () => rows,

    getFilteredRows: () =>
        filteredRows,

    reload: () =>
        loadCsv(),

    debug: () =>
        printDebugInfo(),

    update: () =>
        updateAll()
};
