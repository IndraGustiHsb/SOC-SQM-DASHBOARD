/* =========================================================
   SOC - SQM MONITORING
   Final app.js
   Data source : data/raw_data.csv
   Timestamp   : 15 Minutes
   Traffic     : Byte -> GB
   ========================================================= */

const CSV_PATH = "data/raw_data.csv";

// Source column says Byte.
// Decimal conversion: 1 GB = 1,000,000,000 Byte.
const TRAFFIC_DIVISOR = 1e9;
const TRAFFIC_UNIT = "GB";

let rows = [];
let charts = {};
let activeMap = "region";

const $ = (id) => document.getElementById(id);

const specs = [
  {
    key: "traffic",
    label: "Total Traffic",
    field: "Total Traffic(Byte)",
    unit: TRAFFIC_UNIT,
    agg: "sum",
    color: "#00bfff",
    decimals: 2
  },
  {
    key: "dlRetx",
    label: "DL TCP Retransmission",
    field: "Downlink TCP Retransmission Rate(%)",
    unit: "%",
    agg: "avg",
    color: "#ff9d00",
    decimals: 2
  },
  {
    key: "ulRetx",
    label: "UL TCP Retransmission",
    field: "Uplink TCP Retransmission Rate(%)",
    unit: "%",
    agg: "avg",
    color: "#a84cff",
    decimals: 2
  },
  {
    key: "tcp",
    label: "TCP Connection Success",
    field: "TCP Connection Success Rate (Included RST)(%)",
    unit: "%",
    agg: "avg",
    color: "#20e887",
    decimals: 2
  },
  {
    key: "dlLoss",
    label: "DL TCP Packet Loss",
    field: "Downlink TCP Packet Loss Rate(%)",
    unit: "%",
    agg: "avg",
    color: "#ff476f",
    decimals: 2
  },
  {
    key: "ulLoss",
    label: "UL TCP Packet Loss",
    field: "Uplink TCP Packet Loss Rate(%)",
    unit: "%",
    agg: "avg",
    color: "#ff168c",
    decimals: 2
  },
  {
    key: "e2e",
    label: "E2E Delay",
    field: "E2E Delay(ms)",
    unit: "ms",
    agg: "avg",
    color: "#00d9ff",
    decimals: 2
  },
  {
    key: "synAckAck",
    label: "SYN ACK-ACK Delay",
    field: "SYN ACK-ACK Delay(ms)",
    unit: "ms",
    agg: "avg",
    color: "#64e291",
    decimals: 2
  },
  {
    key: "synSynAck",
    label: "SYN-SYN ACK Delay",
    field: "SYN-SYN ACK Delay(ms)",
    unit: "ms",
    agg: "avg",
    color: "#e0aaff",
    decimals: 2
  }
];

/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  if (!cleaned) return null;

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, decimals = 2) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "-";
  }

  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDateDisplay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

function dateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();

  if (!raw) return null;

  /*
    Expected:
    10/1/2026 0:00
    10/1/2026 00:15
    10/1/2026 13:45:00
  */

  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] || 0);

    const d = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      0
    );

    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO fallback
  const fallback = new Date(raw);

  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function trafficGB(row) {
  const value = numberValue(row["Total Traffic(Byte)"]);

  if (value === null) return null;

  return value / TRAFFIC_DIVISOR;
}

function metricValue(row, spec) {
  if (spec.key === "traffic") {
    return trafficGB(row);
  }

  return numberValue(row[spec.field]);
}

function getDateRange() {
  const fromValue = $("dateFrom")?.value;
  const toValue = $("dateTo")?.value;

  let from = null;
  let to = null;

  if (fromValue) {
    from = new Date(fromValue + "T00:00:00");
  }

  if (toValue) {
    to = new Date(toValue + "T23:59:59.999");
  }

  return { from, to };
}

function isDateInRange(date, from, to) {
  if (!date) return false;

  if (from && date < from) return false;

  if (to && date > to) return false;

  return true;
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim())
  )].sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

function setSelectOptions(select, values, allLabel) {
  if (!select) return;

  const current = select.value || "ALL";

  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "ALL";
  allOption.textContent = allLabel;

  select.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  } else {
    select.value = "ALL";
  }
}

/* =========================================================
   FILTERS
   ========================================================= */

function getBaseFilteredRows() {
  const region = $("region")?.value || "ALL";
  const circle = $("circle")?.value || "ALL";
  const branch = $("branch")?.value || "ALL";
  const kabupaten = $("kabupaten")?.value || "ALL";

  return rows.filter((row) => {
    if (region !== "ALL" && String(row.REGION).trim() !== region) {
      return false;
    }

    if (circle !== "ALL" && String(row.CIRCLE).trim() !== circle) {
      return false;
    }

    if (branch !== "ALL" && String(row.BRANCH).trim() !== branch) {
      return false;
    }

    if (
      kabupaten !== "ALL" &&
      String(row.KABUPATEN).trim() !== kabupaten
    ) {
      return false;
    }

    return true;
  });
}

function setupFilters() {
  if (!rows.length) return;

  const dateValues = rows
    .map((row) => row.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dateValues.length) {
    const firstDate = dateValues[0];
    const lastDate = dateValues[dateValues.length - 1];

    const dateFrom = $("dateFrom");
    const dateTo = $("dateTo");

    if (dateFrom && !dateFrom.value) {
      dateFrom.value = dateInputValue(firstDate);
    }

    if (dateTo && !dateTo.value) {
      dateTo.value = dateInputValue(lastDate);
    }
  }

  updateDependentFilters();

  $("region")?.addEventListener("change", () => {
    updateDependentFilters("region");
    update();
  });

  $("circle")?.addEventListener("change", () => {
    updateDependentFilters("circle");
    update();
  });

  $("branch")?.addEventListener("change", () => {
    updateDependentFilters("branch");
    update();
  });

  $("kabupaten")?.addEventListener("change", () => {
    update();
  });

  $("dateFrom")?.addEventListener("change", update);
  $("dateTo")?.addEventListener("change", update);
  $("period")?.addEventListener("change", update);

  $("compare")?.addEventListener("change", () => {
    const mode = $("compareMode");

    if (mode) {
      mode.disabled = !$("compare").checked;
    }

    update();
  });

  $("compareMode")?.addEventListener("change", update);

  $("reset")?.addEventListener("click", resetFilters);

  const compareMode = $("compareMode");

  if (compareMode) {
    compareMode.disabled = !$("compare")?.checked;
  }
}

function updateDependentFilters(changed = "") {
  const selectedRegion = $("region")?.value || "ALL";
  const selectedCircle = $("circle")?.value || "ALL";
  const selectedBranch = $("branch")?.value || "ALL";
  const selectedKabupaten = $("kabupaten")?.value || "ALL";

  let filtered = [...rows];

  if (selectedRegion !== "ALL") {
    filtered = filtered.filter(
      (row) => String(row.REGION).trim() === selectedRegion
    );
  }

  setSelectOptions(
    $("circle"),
    uniqueSorted(filtered.map((row) => row.CIRCLE)),
    "All Circle"
  );

  const circleValue =
    selectedCircle !== "ALL" &&
    [...($("circle")?.options || [])].some(
      (option) => option.value === selectedCircle
    )
      ? selectedCircle
      : "ALL";

  if ($("circle")) {
    $("circle").value = circleValue;
  }

  if (circleValue !== "ALL") {
    filtered = filtered.filter(
      (row) => String(row.CIRCLE).trim() === circleValue
    );
  }

  setSelectOptions(
    $("branch"),
    uniqueSorted(filtered.map((row) => row.BRANCH)),
    "All Branch"
  );

  const branchValue =
    selectedBranch !== "ALL" &&
    [...($("branch")?.options || [])].some(
      (option) => option.value === selectedBranch
    )
      ? selectedBranch
      : "ALL";

  if ($("branch")) {
    $("branch").value = branchValue;
  }

  if (branchValue !== "ALL") {
    filtered = filtered.filter(
      (row) => String(row.BRANCH).trim() === branchValue
    );
  }

  setSelectOptions(
    $("kabupaten"),
    uniqueSorted(filtered.map((row) => row.KABUPATEN)),
    "All Kabupaten"
  );

  const kabupatenValue =
    selectedKabupaten !== "ALL" &&
    [...($("kabupaten")?.options || [])].some(
      (option) => option.value === selectedKabupaten
    )
      ? selectedKabupaten
      : "ALL";

  if ($("kabupaten")) {
    $("kabupaten").value = kabupatenValue;
  }

  // Region is independent root filter.
  setSelectOptions(
    $("region"),
    uniqueSorted(rows.map((row) => row.REGION)),
    "All Region"
  );

  if (
    selectedRegion !== "ALL" &&
    [...($("region")?.options || [])].some(
      (option) => option.value === selectedRegion
    )
  ) {
    $("region").value = selectedRegion;
  }
}

function getFilteredRows() {
  const { from, to } = getDateRange();

  const region = $("region")?.value || "ALL";
  const circle = $("circle")?.value || "ALL";
  const branch = $("branch")?.value || "ALL";
  const kabupaten = $("kabupaten")?.value || "ALL";

  return rows.filter((row) => {
    if (!isDateInRange(row.__date, from, to)) {
      return false;
    }

    if (
      region !== "ALL" &&
      String(row.REGION).trim() !== region
    ) {
      return false;
    }

    if (
      circle !== "ALL" &&
      String(row.CIRCLE).trim() !== circle
    ) {
      return false;
    }

    if (
      branch !== "ALL" &&
      String(row.BRANCH).trim() !== branch
    ) {
      return false;
    }

    if (
      kabupaten !== "ALL" &&
      String(row.KABUPATEN).trim() !== kabupaten
    ) {
      return false;
    }

    return true;
  });
}

function resetFilters() {
  const dateValues = rows
    .map((row) => row.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dateValues.length) {
    $("dateFrom").value = dateInputValue(dateValues[0]);
    $("dateTo").value = dateInputValue(dateValues[dateValues.length - 1]);
  }

  $("period").value = "15min";
  $("region").value = "ALL";

  updateDependentFilters();

  $("circle").value = "ALL";
  $("branch").value = "ALL";
  $("kabupaten").value = "ALL";

  $("compare").checked = false;
  $("compareMode").value = "lastWeek";
  $("compareMode").disabled = true;

  update();
}

/* =========================================================
   PERIOD / AGGREGATION
   ========================================================= */

function bucketDate(date, period) {
  const d = new Date(date);

  if (period === "hourly") {
    d.setMinutes(0, 0, 0);
    return d;
  }

  if (period === "daily") {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 15-minute
  const minutes = d.getMinutes();
  const bucket = Math.floor(minutes / 15) * 15;

  d.setMinutes(bucket, 0, 0);

  return d;
}

function aggregateRows(inputRows, period) {
  const buckets = new Map();

  inputRows.forEach((row) => {
    if (!row.__date) return;

    const bucket = bucketDate(row.__date, period);
    const key = bucket.getTime();

    if (!buckets.has(key)) {
      buckets.set(key, {
        date: bucket,
        count: 0,
        values: {}
      });

      specs.forEach((spec) => {
        buckets.get(key).values[spec.key] = [];
      });
    }

    const bucketData = buckets.get(key);

    bucketData.count += 1;

    specs.forEach((spec) => {
      const value = metricValue(row, spec);

      if (value !== null && Number.isFinite(value)) {
        bucketData.values[spec.key].push(value);
      }
    });
  });

  return [...buckets.values()]
    .sort((a, b) => a.date - b.date)
    .map((bucket) => {
      const result = {
        date: bucket.date,
        count: bucket.count
      };

      specs.forEach((spec) => {
        const values = bucket.values[spec.key];

        if (!values.length) {
          result[spec.key] = null;
          return;
        }

        if (spec.agg === "sum") {
          result[spec.key] = values.reduce(
            (sum, value) => sum + value,
            0
          );
        } else {
          result[spec.key] =
            values.reduce((sum, value) => sum + value, 0) /
            values.length;
        }
      });

      return result;
    });
}

/* =========================================================
   COMPARE
   ========================================================= */

function shiftRowsForComparison(inputRows, mode) {
  if (!inputRows.length) return [];

  const dates = inputRows
    .map((row) => row.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) return [];

  const from = dates[0];
  const to = dates[dates.length - 1];

  let shiftMs;

  if (mode === "lastWeek") {
    shiftMs = 7 * 24 * 60 * 60 * 1000;
  } else {
    shiftMs = to.getTime() - from.getTime() + 24 * 60 * 60 * 1000;
  }

  const comparison = inputRows
    .map((row) => {
      const clone = { ...row };

      if (row.__date) {
        clone.__date = new Date(
          row.__date.getTime() - shiftMs
        );
      }

      return clone;
    });

  return comparison;
}

function getComparisonRows() {
  if (!$("compare")?.checked) {
    return [];
  }

  const mode = $("compareMode")?.value || "lastWeek";

  const baseRows = getFilteredRows();

  if (!baseRows.length) return [];

  const dates = baseRows
    .map((row) => row.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) return [];

  const from = dates[0];
  const to = dates[dates.length - 1];

  let comparisonFrom;
  let comparisonTo;

  if (mode === "lastWeek") {
    comparisonFrom = new Date(
      from.getTime() - 7 * 24 * 60 * 60 * 1000
    );

    comparisonTo = new Date(
      to.getTime() - 7 * 24 * 60 * 60 * 1000
    );
  } else {
    const duration =
      to.getTime() -
      from.getTime();

    comparisonTo = new Date(
      from.getTime() - 1
    );

    comparisonFrom = new Date(
      comparisonTo.getTime() - duration
    );
  }

  const region = $("region")?.value || "ALL";
  const circle = $("circle")?.value || "ALL";
  const branch = $("branch")?.value || "ALL";
  const kabupaten = $("kabupaten")?.value || "ALL";

  return rows.filter((row) => {
    if (!row.__date) return false;

    if (
      row.__date < comparisonFrom ||
      row.__date > comparisonTo
    ) {
      return false;
    }

    if (
      region !== "ALL" &&
      String(row.REGION).trim() !== region
    ) {
      return false;
    }

    if (
      circle !== "ALL" &&
      String(row.CIRCLE).trim() !== circle
    ) {
      return false;
    }

    if (
      branch !== "ALL" &&
      String(row.BRANCH).trim() !== branch
    ) {
      return false;
    }

    if (
      kabupaten !== "ALL" &&
      String(row.KABUPATEN).trim() !== kabupaten
    ) {
      return false;
    }

    return true;
  });
}

/* =========================================================
   KPI
   ========================================================= */

function calculateAverage(inputRows, spec) {
  const values = inputRows
    .map((row) => metricValue(row, spec))
    .filter(
      (value) =>
        value !== null &&
        Number.isFinite(value)
    );

  if (!values.length) return null;

  if (spec.agg === "sum") {
    return values.reduce(
      (sum, value) => sum + value,
      0
    );
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length
  );
}

function getKpiComparisonValue(inputRows, spec) {
  if (!inputRows.length) return null;

  return calculateAverage(inputRows, spec);
}

function renderKpis() {
  const container = $("kpis");

  if (!container) return;

  const filtered = getFilteredRows();
  const comparison = getComparisonRows();

  container.innerHTML = "";

  specs.forEach((spec) => {
    const value = calculateAverage(filtered, spec);
    const compareValue = getKpiComparisonValue(
      comparison,
      spec
    );

    let deltaHtml = "";

    if (
      $("compare")?.checked &&
      value !== null &&
      compareValue !== null &&
      compareValue !== 0
    ) {
      const delta =
        ((value - compareValue) /
          Math.abs(compareValue)) *
        100;

      const arrow =
        delta > 0
          ? "▲"
          : delta < 0
          ? "▼"
          : "—";

      deltaHtml = `
        <div class="kpi-delta">
          ${arrow} ${Math.abs(delta).toFixed(1)}%
          <span>vs compare</span>
        </div>
      `;
    }

    const card = document.createElement("div");

    card.className = "kpi-card";
    card.style.setProperty("--accent", spec.color);

    card.innerHTML = `
      <div class="kpi-top">
        <span class="kpi-dot"></span>
        <span>${escapeHtml(spec.label)}</span>
      </div>

      <div class="kpi-value">
        ${
          value === null
            ? "-"
            : formatNumber(value, spec.decimals)
        }
        <small>${escapeHtml(spec.unit)}</small>
      </div>

      ${deltaHtml}
    `;

    container.appendChild(card);
  });
}

/* =========================================================
   CHARTS
   ========================================================= */

function destroyCharts() {
  Object.values(charts).forEach((chart) => {
    try {
      chart.destroy();
    } catch (error) {}
  });

  charts = {};
}

function chartTitle(spec) {
  return `${spec.label} (${spec.unit})`;
}

function renderCharts() {
  const container = $("charts");

  if (!container) return;

  destroyCharts();

  container.innerHTML = "";

  const filtered = getFilteredRows();
  const comparison = getComparisonRows();

  const period = $("period")?.value || "15min";

  const aggregated = aggregateRows(
    filtered,
    period
  );

  const comparisonAggregated =
    aggregateRows(
      comparison,
      period
    );

  if (!aggregated.length) {
    container.innerHTML = `
      <div class="chart-card empty-chart">
        <div class="empty-title">No data</div>
        <div class="empty-text">
          Tidak ada data sesuai filter yang dipilih.
        </div>
      </div>
    `;

    return;
  }

  specs.forEach((spec) => {
    const card = document.createElement("div");

    card.className = "chart-card";

    card.innerHTML = `
      <div class="chart-head">
        <div>
          <h3>${escapeHtml(spec.label)}</h3>
          <span>${escapeHtml(spec.unit)}</span>
        </div>
      </div>

      <div class="chart-body">
        <canvas></canvas>
      </div>
    `;

    container.appendChild(card);

    const canvas = card.querySelector("canvas");

    const labels = aggregated.map(
      (item) =>
        spec.key === "traffic" &&
        period === "daily"
          ? item.date.toLocaleDateString(
              "id-ID",
              {
                day: "2-digit",
                month: "2-digit"
              }
            )
          : period === "daily"
          ? item.date.toLocaleDateString(
              "id-ID",
              {
                day: "2-digit",
                month: "2-digit"
              }
            )
          : item.date.toLocaleTimeString(
              "id-ID",
              {
                hour: "2-digit",
                minute: "2-digit"
              }
            )
    );

    const datasets = [
      {
        label: "Current",
        data: aggregated.map(
          (item) => item[spec.key]
        ),
        borderColor: spec.color,
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25,
        spanGaps: true
      }
    ];

    if (
      $("compare")?.checked &&
      comparisonAggregated.length
    ) {
      datasets.push({
        label:
          $("compareMode")?.value ===
          "lastWeek"
            ? "Last Week"
            : "Previous Period",
        data: comparisonAggregated.map(
          (item) => item[spec.key]
        ),
        borderColor: "#65788b",
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.25,
        spanGaps: true
      });
    }

    charts[spec.key] = new Chart(
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
              display:
                $("compare")?.checked || false,
              labels: {
                color: "#79a7ca",
                boxWidth: 10,
                usePointStyle: true
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value =
                    context.parsed.y;

                  return `${context.dataset.label}: ${
                    value === null
                      ? "-"
                      : formatNumber(
                          value,
                          spec.decimals
                        )
                  } ${spec.unit}`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#79a7ca",
                maxTicksLimit: 8
              },
              grid: {
                color: "rgba(7,61,102,.35)"
              }
            },
            y: {
              beginAtZero: false,
              ticks: {
                color: "#79a7ca",
                callback: (value) =>
                  formatNumber(
                    value,
                    spec.decimals
                  )
              },
              grid: {
                color: "rgba(7,61,102,.35)"
              }
            }
          }
        }
      }
    );
  });
}

/* =========================================================
   TABLE
   ========================================================= */

function renderTable() {
  const head = $("tableHead");
  const body = $("tableBody");

  if (!head || !body) return;

  const filtered = getFilteredRows()
    .sort(
      (a, b) =>
        (b.__date || 0) -
        (a.__date || 0)
    )
    .slice(0, 500);

  const columns = [
    "15 Minutes",
    "REGION",
    "CIRCLE",
    "BRANCH",
    "KABUPATEN",
    "Total Traffic(Byte)",
    "Downlink TCP Retransmission Rate(%)",
    "Uplink TCP Retransmission Rate(%)",
    "TCP Connection Success Rate (Included RST)(%)",
    "Downlink TCP Packet Loss Rate(%)",
    "Uplink TCP Packet Loss Rate(%)",
    "E2E Delay(ms)",
    "SYN ACK-ACK Delay(ms)",
    "SYN-SYN ACK Delay(ms)"
  ];

  head.innerHTML = `
    <tr>
      ${columns
        .map(
          (column) =>
            `<th>${escapeHtml(
              column
            )}</th>`
        )
        .join("")}
    </tr>
  `;

  body.innerHTML = "";

  if (!filtered.length) {
    body.innerHTML = `
      <tr>
        <td colspan="${columns.length}" class="empty-cell">
          No data found.
        </td>
      </tr>
    `;

    return;
  }

  filtered.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = columns
      .map((column) => {
        let value = row[column];

        if (column === "15 Minutes") {
          value = formatDateDisplay(
            row.__date
          );
        }

        if (
          column === "Total Traffic(Byte)"
        ) {
          value =
            trafficGB(row) === null
              ? "-"
              : formatNumber(
                  trafficGB(row),
                  6
                );
        }

        return `<td>${escapeHtml(
          value ?? "-"
        )}</td>`;
      })
      .join("");

    body.appendChild(tr);
  });
}

/* =========================================================
   DATA PAGE
   ========================================================= */

function renderDataPage() {
  const head = $("dataHead");
  const body = $("dataBody");
  const search = $("dataSearch");
  const count = $("dataCount");

  if (!head || !body) return;

  const columns = [
    "15 Minutes",
    "REGION",
    "CIRCLE",
    "BRANCH",
    "KABUPATEN",
    "Total Traffic(Byte)",
    "Downlink TCP Retransmission Rate(%)",
    "Uplink TCP Retransmission Rate(%)",
    "TCP Connection Success Rate (Included RST)(%)",
    "Downlink TCP Packet Loss Rate(%)",
    "Uplink TCP Packet Loss Rate(%)",
    "E2E Delay(ms)",
    "SYN ACK-ACK Delay(ms)",
    "SYN-SYN ACK Delay(ms)"
  ];

  head.innerHTML = `
    <tr>
      ${columns
        .map(
          (column) =>
            `<th>${escapeHtml(
              column
            )}</th>`
        )
        .join("")}
    </tr>
  `;

  let dataRows = [...rows];

  const searchValue =
    String(search?.value || "")
      .trim()
      .toLowerCase();

  if (searchValue) {
    dataRows = dataRows.filter(
      (row) =>
        columns.some((column) =>
          String(
            row[column] ?? ""
          )
            .toLowerCase()
            .includes(searchValue)
        )
    );
  }

  dataRows.sort(
    (a, b) =>
      (b.__date || 0) -
      (a.__date || 0)
  );

  const displayRows =
    dataRows.slice(0, 1000);

  body.innerHTML = "";

  displayRows.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = columns
      .map((column) => {
        let value = row[column];

        if (column === "15 Minutes") {
          value = formatDateDisplay(
            row.__date
          );
        }

        if (
          column === "Total Traffic(Byte)"
        ) {
          value =
            trafficGB(row) === null
              ? "-"
              : formatNumber(
                  trafficGB(row),
                  6
                );
        }

        return `<td>${escapeHtml(
          value ?? "-"
        )}</td>`;
      })
      .join("");

    body.appendChild(tr);
  });

  if (count) {
    count.textContent =
      `${dataRows.length.toLocaleString(
        "id-ID"
      )} records`;
  }
}

/* =========================================================
   MAP / TOPOLOGY
   ========================================================= */

function getMapFilteredRows() {
  const search =
    String(
      $("mapSearch")?.value || ""
    )
      .trim()
      .toLowerCase();

  return rows.filter((row) => {
    if (!search) return true;

    return [
      row.REGION,
      row.CIRCLE,
      row.BRANCH,
      row.KABUPATEN
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(search)
    );
  });
}

function getMapField() {
  if (activeMap === "circle") {
    return "CIRCLE";
  }

  if (activeMap === "branch") {
    return "BRANCH";
  }

  if (activeMap === "kabupaten") {
    return "KABUPATEN";
  }

  return "REGION";
}

function renderMap() {
  const list = $("mapList");
  const topology = $("topologyCanvas");
  const performance =
    $("regionPerformance");

  if (!list) return;

  const filtered =
    getMapFilteredRows();

  const field = getMapField();

  const groups = new Map();

  filtered.forEach((row) => {
    const name =
      String(
        row[field] || "Unknown"
      ).trim();

    if (!groups.has(name)) {
      groups.set(name, []);
    }

    groups.get(name).push(row);
  });

  const sortedGroups =
    [...groups.entries()]
      .sort(
        (a, b) =>
          b[1].length -
          a[1].length
      )
      .slice(0, 100);

  list.innerHTML = "";

  if (!sortedGroups.length) {
    list.innerHTML =
      `<div class="empty-cell">No data.</div>`;
  }

  sortedGroups.forEach(
    ([name, groupRows]) => {
      const item =
        document.createElement("div");

      item.className = "map-item";

      const latest =
        groupRows
          .filter((row) => row.__date)
          .sort(
            (a, b) =>
              b.__date - a.__date
          )[0];

      const tcpSpec =
        specs.find(
          (spec) =>
            spec.key === "tcp"
        );

      const tcpValue = latest
        ? metricValue(
            latest,
            tcpSpec
          )
        : null;

      item.innerHTML = `
        <div class="map-item-name">
          ${escapeHtml(name)}
        </div>
        <div class="map-item-meta">
          ${groupRows.length.toLocaleString(
            "id-ID"
          )} records
          ${
            tcpValue !== null
              ? ` · TCP ${formatNumber(
                  tcpValue,
                  2
                )}%`
              : ""
          }
        </div>
      `;

      list.appendChild(item);
    }
  );

  if (performance) {
    const regions =
      new Map();

    rows.forEach((row) => {
      const region =
        String(
          row.REGION ||
            "Unknown"
        ).trim();

      if (!regions.has(region)) {
        regions.set(region, []);
      }

      regions.get(region).push(row);
    });

    performance.innerHTML =
      [...regions.entries()]
        .sort((a, b) =>
          a[0].localeCompare(b[0])
        )
        .map(
          ([region, regionRows]) => {
            const tcpSpec =
              specs.find(
                (spec) =>
                  spec.key ===
                  "tcp"
              );

            const tcp =
              calculateAverage(
                regionRows,
                tcpSpec
              );

            return `
              <div class="performance-row">
                <span>${escapeHtml(
                  region
                )}</span>
                <b>${
                  tcp === null
                    ? "-"
                    : formatNumber(
                        tcp,
                        2
                      ) + "%"
                }</b>
              </div>
            `;
          }
        )
        .join("");
  }

  if (topology) {
    renderTopology(
      topology,
      sortedGroups
    );
  }
}

function renderTopology(
  container,
  groups
) {
  container.innerHTML = "";

  const maxNodes = Math.min(
    groups.length,
    20
  );

  if (!maxNodes) {
    container.innerHTML =
      `<div class="empty-cell">No topology data.</div>`;
    return;
  }

  const fragment =
    document.createDocumentFragment();

  groups
    .slice(0, maxNodes)
    .forEach(
      ([name, groupRows], index) => {
        const node =
          document.createElement(
            "div"
          );

        node.className =
          "topology-node";

        const angle =
          (index / maxNodes) *
          Math.PI *
          2;

        const radius =
          Math.min(
            240,
            Math.max(
              130,
              maxNodes * 10
            )
          );

        const centerX = 50;
        const centerY = 50;

        const x =
          centerX +
          Math.cos(angle) *
            (radius / 6);

        const y =
          centerY +
          Math.sin(angle) *
            (radius / 8);

        node.style.left =
          `${x}%`;

        node.style.top =
          `${y}%`;

        node.innerHTML = `
          <span class="node-dot"></span>
          <b>${escapeHtml(
            name
          )}</b>
          <small>${groupRows.length.toLocaleString(
            "id-ID"
          )} records</small>
        `;

        fragment.appendChild(
          node
        );
      }
    );

  container.appendChild(
    fragment
  );

  const core =
    document.createElement("div");

  core.className =
    "topology-core";

  core.innerHTML = `
    <span class="core-dot"></span>
    <b>SQM</b>
    <small>MONITORING</small>
  `;

  container.appendChild(core);
}

/* =========================================================
   DOWNLOAD
   ========================================================= */

function csvEscape(value) {
  const text = String(
    value ?? ""
  );

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return (
      '"' +
      text.replace(
        /"/g,
        '""'
      ) +
      '"'
    );
  }

  return text;
}

function rowsToCsv(inputRows) {
  const columns = [
    "15 Minutes",
    "REGION",
    "BRANCH",
    "KABUPATEN",
    "CIRCLE",
    "Total Traffic(Byte)",
    "Downlink TCP Retransmission Rate(%)",
    "Uplink TCP Retransmission Rate(%)",
    "TCP Connection Success Rate (Included RST)(%)",
    "Downlink TCP Packet Loss Rate(%)",
    "Uplink TCP Packet Loss Rate(%)",
    "E2E Delay(ms)",
    "SYN ACK-ACK Delay(ms)",
    "SYN-SYN ACK Delay(ms)"
  ];

  const lines = [];

  lines.push(
    columns
      .map(csvEscape)
      .join(",")
  );

  inputRows.forEach((row) => {
    lines.push(
      columns
        .map((column) =>
          csvEscape(
            row[column]
          )
        )
        .join(",")
    );
  });

  return lines.join("\n");
}

function downloadRows(
  inputRows,
  filename
) {
  if (!inputRows.length) {
    alert(
      "Tidak ada data untuk di-download."
    );
    return;
  }

  const csv =
    rowsToCsv(inputRows);

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
    document.createElement(
      "a"
    );

  link.href = url;
  link.download =
    filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );
}

function setupDownloads() {
  $("downloadCsv")?.addEventListener(
    "click",
    () => {
      const filtered =
        getFilteredRows();

      downloadRows(
        filtered,
        "sqm_filtered_data.csv"
      );
    }
  );

  $("downloadCsv2")?.addEventListener(
    "click",
    () => {
      downloadRows(
        rows,
        "sqm_raw_data.csv"
      );
    }
  );
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  const buttons =
    document.querySelectorAll(
      ".nav-btn"
    );

  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const view =
          button.dataset.view;

        buttons.forEach(
          (item) =>
            item.classList.remove(
              "active"
            )
        );

        button.classList.add(
          "active"
        );

        document
          .querySelectorAll(
            ".view"
          )
          .forEach((section) => {
            section.classList.remove(
              "active-view"
            );
          });

        if (view === "dashboard") {
          $("dashboardView")?.classList.add(
            "active-view"
          );
        }

        if (view === "map") {
          $("mapView")?.classList.add(
            "active-view"
          );

          renderMap();
        }

        if (view === "data") {
          $("dataView")?.classList.add(
            "active-view"
          );

          renderDataPage();
        }

        if (view === "settings") {
          $("settingsView")?.classList.add(
            "active-view"
          );
        }
      }
    );
  });

  document
    .querySelectorAll(
      ".map-tab"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".map-tab"
            )
            .forEach(
              (item) =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          activeMap =
            button.dataset.map ||
            "region";

          renderMap();
        }
      );
    });

  $("mapSearch")?.addEventListener(
    "input",
    renderMap
  );

  $("dataSearch")?.addEventListener(
    "input",
    renderDataPage
  );
}

/* =========================================================
   CLOCK
   ========================================================= */

function updateClock() {
  const clock =
    document.querySelector(
      ".clock"
    );

  if (!clock) return;

  const now =
    new Date();

  clock.textContent =
    now.toLocaleTimeString(
      "id-ID",
      {
        hour12: false
      }
    );
}

function startClock() {
  updateClock();

  setInterval(
    updateClock,
    1000
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */

function updateSettingsText() {
  const settingRows =
    document.querySelectorAll(
      "#settingsView .setting-row"
    );

  settingRows.forEach(
    (row) => {
      const label =
        row.querySelector(
          "b"
        );

      const value =
        row.querySelector(
          "span"
        );

      if (
        label &&
        value &&
        label.textContent
          .trim()
          .toLowerCase() ===
          "traffic unit"
      ) {
        value.textContent =
          `${TRAFFIC_UNIT} (decimal, source column Byte)`;
      }
    }
  );
}

/* =========================================================
   MAIN UPDATE
   ========================================================= */

function update() {
  renderKpis();
  renderCharts();
  renderTable();
}

/* =========================================================
   CSV LOAD
   ========================================================= */

function validateColumns(data) {
  if (!data || !data.length) {
    throw new Error(
      "CSV kosong atau tidak memiliki data."
    );
  }

  const requiredColumns = [
    "15 Minutes",
    "REGION",
    "BRANCH",
    "KABUPATEN",
    "CIRCLE",
    "Total Traffic(Byte)",
    "Downlink TCP Retransmission Rate(%)",
    "Uplink TCP Retransmission Rate(%)",
    "TCP Connection Success Rate (Included RST)(%)",
    "Downlink TCP Packet Loss Rate(%)",
    "Uplink TCP Packet Loss Rate(%)",
    "E2E Delay(ms)",
    "SYN ACK-ACK Delay(ms)",
    "SYN-SYN ACK Delay(ms)"
  ];

  const columns =
    Object.keys(
      data[0]
    );

  const missing =
    requiredColumns.filter(
      (column) =>
        !columns.includes(
          column
        )
    );

  if (missing.length) {
    throw new Error(
      "Kolom CSV tidak sesuai. Missing: " +
        missing.join(", ")
    );
  }
}

function cleanRows(data) {
  return data
    .map((row) => {
      const clean = {};

      Object.keys(row).forEach(
        (key) => {
          clean[key] =
            typeof row[key] ===
            "string"
              ? row[key].trim()
              : row[key];
        }
      );

      clean.__date =
        parseDate(
          clean["15 Minutes"]
        );

      return clean;
    })
    .filter(
      (row) => row.__date
    );
}

function showLoading() {
  const kpis = $("kpis");
  const charts = $("charts");

  if (kpis) {
    kpis.innerHTML = `
      <div class="loading-state">
        Loading SQM data...
      </div>
    `;
  }

  if (charts) {
    charts.innerHTML = "";
  }
}

function showError(error) {
  console.error(
    "SQM Dashboard Error:",
    error
  );

  const message =
    error?.message ||
    String(error);

  const kpis = $("kpis");
  const charts = $("charts");

  if (kpis) {
    kpis.innerHTML = `
      <div class="error-state">
        <strong>Data Error</strong>
        <span>${escapeHtml(
          message
        )}</span>
      </div>
    `;
  }

  if (charts) {
    charts.innerHTML = `
      <div class="chart-card empty-chart">
        <div class="empty-title">
          CSV tidak dapat diproses
        </div>
        <div class="empty-text">
          Pastikan file berada di:
          <code>data/raw_data.csv</code>
        </div>
      </div>
    `;
  }
}

function loadCsv() {
  showLoading();

  if (
    typeof Papa ===
    "undefined"
  ) {
    showError(
      new Error(
        "PapaParse tidak ditemukan. Pastikan CDN PapaParse aktif di index.html."
      )
    );

    return;
  }

  console.log(
    "Loading CSV:",
    CSV_PATH
  );

  Papa.parse(
    CSV_PATH,
    {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,

      complete: function (
        results
      ) {
        try {
          console.log(
            "CSV berhasil di-load"
          );

          console.log(
            "Jumlah rows:",
            results.data.length
          );

          if (
            results.errors &&
            results.errors.length
          ) {
            console.warn(
              "CSV parse warnings:",
              results.errors
            );
          }

          validateColumns(
            results.data
          );

          rows =
            cleanRows(
              results.data
            );

          if (!rows.length) {
            throw new Error(
              "CSV berhasil dibaca tetapi tidak ada timestamp yang valid pada kolom '15 Minutes'."
            );
          }

          rows.sort(
            (a, b) =>
              a.__date -
              b.__date
          );

          console.log(
            "Rows valid:",
            rows.length
          );

          console.log(
            "First row:",
            rows[0]
          );

          console.log(
            "Last row:",
            rows[
              rows.length - 1
            ]
          );

          setupFilters();
          setupDownloads();
          setupNavigation();
          updateSettingsText();

          $("dataSearch")?.addEventListener(
            "input",
            renderDataPage
          );

          update();
          startClock();

          console.log(
            "SOC-SQM-DASHBOARD ready."
          );
        } catch (error) {
          showError(error);
        }
      },

      error: function (
        error
      ) {
        showError(
          new Error(
            "Gagal membaca CSV. Pastikan path '" +
              CSV_PATH +
              "' benar dan file dapat diakses."
          )
        );

        console.error(
          "PapaParse error:",
          error
        );
      }
    }
  );
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadCsv();
  }
);
