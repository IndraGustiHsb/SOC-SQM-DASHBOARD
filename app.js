/* =========================================================
   SOC - SQM MONITORING
   app.js - compatible with current raw_data.csv

   CSV structure:
   15 Minutes
   REGION
   BRANCH
   KABUPATEN
   CIRCLE
   Total Traffic(Byte)
   Downlink TCP Retransmission Rate(%)
   Uplink TCP Retransmission Rate(%)
   TCP Connection Success Rate (Included RST)(%)
   Downlink TCP Packet Loss Rate(%)
   Uplink TCP Packet Loss Rate(%)
   E2E Delay(ms)
   SYN ACK-ACK Delay(ms)
   SYN-SYN ACK Delay(ms)
========================================================= */

const CSV_PATH = "data/raw_data.csv";

/*
  Source column is named Total Traffic(Byte).
  This constant converts decimal Byte -> GB.
  If your source report is actually already scaled, change only
  this value; the raw CSV does not need to be modified.
*/
const TRAFFIC_DIVISOR = 1e9;
const TRAFFIC_UNIT = "GB";

const $ = (id) => document.getElementById(id);

let rows = [];
let filteredRows = [];
let charts = {};
let activeMap = "region";

const specs = [
  {
    key: "traffic",
    label: "Total Traffic",
    column: "Total Traffic(Byte)",
    unit: "GB",
    color: "#00BFFF",
    decimals: 3,
    aggregate: "sum",
    format: (v) => `${formatNumber(v, 3)} GB`
  },
  {
    key: "dlRetx",
    label: "DL TCP Retransmission",
    column: "Downlink TCP Retransmission Rate(%)",
    unit: "%",
    color: "#20E887",
    decimals: 2,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 2)} %`
  },
  {
    key: "ulRetx",
    label: "UL TCP Retransmission",
    column: "Uplink TCP Retransmission Rate(%)",
    unit: "%",
    color: "#FF9D00",
    decimals: 2,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 2)} %`
  },
  {
    key: "tcp",
    label: "TCP Connection Success",
    column: "TCP Connection Success Rate (Included RST)(%)",
    unit: "%",
    color: "#A84CFF",
    decimals: 2,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 2)} %`
  },
  {
    key: "dlLoss",
    label: "DL TCP Packet Loss",
    column: "Downlink TCP Packet Loss Rate(%)",
    unit: "%",
    color: "#00BFFF",
    decimals: 2,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 2)} %`
  },
  {
    key: "ulLoss",
    label: "UL TCP Packet Loss",
    column: "Uplink TCP Packet Loss Rate(%)",
    unit: "%",
    color: "#FF168C",
    decimals: 2,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 2)} %`
  },
  {
    key: "e2e",
    label: "E2E Delay",
    column: "E2E Delay(ms)",
    unit: "ms",
    color: "#20E887",
    decimals: 1,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 1)} ms`
  },
  {
    key: "synAckAck",
    label: "SYN ACK-ACK Delay",
    column: "SYN ACK-ACK Delay(ms)",
    unit: "ms",
    color: "#A84CFF",
    decimals: 1,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 1)} ms`
  },
  {
    key: "synSynAck",
    label: "SYN-SYN ACK Delay",
    column: "SYN-SYN ACK Delay(ms)",
    unit: "ms",
    color: "#00BFFF",
    decimals: 1,
    aggregate: "avg",
    format: (v) => `${formatNumber(v, 1)} ms`
  }
];

const TABLE_COLUMNS = [
  ["15 Minutes", "TIME"],
  ["REGION", "REGION"],
  ["CIRCLE", "CIRCLE"],
  ["BRANCH", "BRANCH"],
  ["KABUPATEN", "KABUPATEN"],
  ["Total Traffic(Byte)", "TOTAL TRAFFIC (GB)"],
  ["Downlink TCP Retransmission Rate(%)", "DL RETX (%)"],
  ["Uplink TCP Retransmission Rate(%)", "UL RETX (%)"],
  ["TCP Connection Success Rate (Included RST)(%)", "TCP SUCCESS (%)"],
  ["Downlink TCP Packet Loss Rate(%)", "DL LOSS (%)"],
  ["Uplink TCP Packet Loss Rate(%)", "UL LOSS (%)"],
  ["E2E Delay(ms)", "E2E (ms)"],
  ["SYN ACK-ACK Delay(ms)", "SYN ACK-ACK (ms)"],
  ["SYN-SYN ACK Delay(ms)", "SYN-SYN ACK (ms)"]
];

function formatNumber(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* CSV timestamp is one column: 10/1/2026 0:00 */
function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = cleanText(value);
  if (!s) return null;

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] || 0);

    const d = new Date(year, month - 1, day, hour, minute, second);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateInputValue(d) {
  return dateKey(d);
}

function hourKey(d) {
  return `${dateKey(d)} ${pad2(d.getHours())}:00`;
}

function fifteenKey(d) {
  const minute = Math.floor(d.getMinutes() / 15) * 15;
  return `${dateKey(d)} ${pad2(d.getHours())}:${pad2(minute)}`;
}

function periodKey(d, period) {
  if (period === "daily") return dateKey(d);
  if (period === "hourly") return hourKey(d);
  return fifteenKey(d);
}

function displayPeriodKey(key, period) {
  if (period === "daily") return key;
  const parts = key.split(" ");
  return parts.length > 1 ? parts[1] : key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function trafficGB(row) {
  const raw = numberValue(row["Total Traffic(Byte)"]);
  return raw === null ? null : raw / TRAFFIC_DIVISOR;
}

function metricValue(row, spec) {
  if (spec.key === "traffic") return trafficGB(row);
  return numberValue(row[spec.column]);
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0);
}

function aggregateMetric(group, spec) {
  const values = group
    .map((row) => metricValue(row, spec))
    .filter((v) => Number.isFinite(v));

  return spec.aggregate === "sum" ? sum(values) : average(values);
}

function uniqueSorted(data, column) {
  return [...new Set(
    data
      .map((r) => cleanText(r[column]))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function selected(id) {
  const el = $(id);
  return el ? el.value : "ALL";
}

function setSelectOptions(id, values, allLabel) {
  const el = $(id);
  if (!el) return;

  const current = el.value;
  el.innerHTML = `<option value="ALL">${escapeHtml(allLabel)}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

  if (values.includes(current)) el.value = current;
  else el.value = "ALL";
}

function applyDependentFilters(sourceRows = rows) {
  const regionValue = selected("region");
  const circleValue = selected("circle");
  const branchValue = selected("branch");

  const circleRows = sourceRows.filter(
    (r) => regionValue === "ALL" || cleanText(r.REGION) === regionValue
  );

  setSelectOptions("circle", uniqueSorted(circleRows, "CIRCLE"), "All Circle");

  const effectiveCircle = selected("circle");

  const branchRows = circleRows.filter(
    (r) => effectiveCircle === "ALL" || cleanText(r.CIRCLE) === effectiveCircle
  );

  setSelectOptions("branch", uniqueSorted(branchRows, "BRANCH"), "All Branch");

  const effectiveBranch = selected("branch");

  const kabRows = branchRows.filter(
    (r) => effectiveBranch === "ALL" || cleanText(r.BRANCH) === effectiveBranch
  );

  setSelectOptions("kabupaten", uniqueSorted(kabRows, "KABUPATEN"), "All Kabupaten");

  if (branchValue && branchValue !== "ALL" && !uniqueSorted(branchRows, "BRANCH").includes(branchValue)) {
    const branch = $("branch");
    if (branch) branch.value = "ALL";
  }

  if (circleValue && circleValue !== "ALL" && !uniqueSorted(circleRows, "CIRCLE").includes(circleValue)) {
    const circle = $("circle");
    if (circle) circle.value = "ALL";
  }
}

function setupBaseFilters() {
  setSelectOptions("region", uniqueSorted(rows, "REGION"), "All Region");
  setSelectOptions("circle", uniqueSorted(rows, "CIRCLE"), "All Circle");
  setSelectOptions("branch", uniqueSorted(rows, "BRANCH"), "All Branch");
  setSelectOptions("kabupaten", uniqueSorted(rows, "KABUPATEN"), "All Kabupaten");

  const dates = rows
    .map((r) => r.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dates.length) {
    const from = $("dateFrom");
    const to = $("dateTo");

    if (from) {
      from.min = dateInputValue(dates[0]);
      from.max = dateInputValue(dates[dates.length - 1]);
      from.value = dateInputValue(dates[0]);
    }

    if (to) {
      to.min = dateInputValue(dates[0]);
      to.max = dateInputValue(dates[dates.length - 1]);
      to.value = dateInputValue(dates[dates.length - 1]);
    }
  }
}

function getFilteredRows() {
  const fromValue = $("dateFrom")?.value || "";
  const toValue = $("dateTo")?.value || "";
  const regionValue = selected("region");
  const circleValue = selected("circle");
  const branchValue = selected("branch");
  const kabupatenValue = selected("kabupaten");

  let from = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
  let to = toValue ? new Date(`${toValue}T23:59:59.999`) : null;

  if (from && Number.isNaN(from.getTime())) from = null;
  if (to && Number.isNaN(to.getTime())) to = null;

  return rows.filter((r) => {
    const d = r.__date;
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (regionValue !== "ALL" && cleanText(r.REGION) !== regionValue) return false;
    if (circleValue !== "ALL" && cleanText(r.CIRCLE) !== circleValue) return false;
    if (branchValue !== "ALL" && cleanText(r.BRANCH) !== branchValue) return false;
    if (kabupatenValue !== "ALL" && cleanText(r.KABUPATEN) !== kabupatenValue) return false;
    return true;
  });
}

function aggregateRows(data, period) {
  const groups = new Map();

  for (const row of data) {
    if (!row.__date) continue;
    const key = periodKey(row.__date, period);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => ({
      key,
      label: displayPeriodKey(key, period),
      group,
      values: Object.fromEntries(
        specs.map((spec) => [spec.key, aggregateMetric(group, spec)])
      )
    }));
}

function getComparisonRows(current) {
  if (!current.length) return [];

  const mode = $("compareMode")?.value || "lastWeek";

  const min = Math.min(...current.map((r) => r.__date.getTime()));
  const max = Math.max(...current.map((r) => r.__date.getTime()));
  const duration = max - min + 1;

  let from;
  let to;

  if (mode === "lastWeek") {
    from = new Date(min - 7 * 24 * 60 * 60 * 1000);
    to = new Date(max - 7 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(min - duration);
    to = new Date(min - 1);
  }

  const regionValue = selected("region");
  const circleValue = selected("circle");
  const branchValue = selected("branch");
  const kabupatenValue = selected("kabupaten");

  return rows.filter((r) => {
    if (!r.__date || r.__date < from || r.__date > to) return false;
    if (regionValue !== "ALL" && cleanText(r.REGION) !== regionValue) return false;
    if (circleValue !== "ALL" && cleanText(r.CIRCLE) !== circleValue) return false;
    if (branchValue !== "ALL" && cleanText(r.BRANCH) !== branchValue) return false;
    if (kabupatenValue !== "ALL" && cleanText(r.KABUPATEN) !== kabupatenValue) return false;
    return true;
  });
}

function destroyCharts() {
  Object.values(charts).forEach((chart) => {
    try { chart.destroy(); } catch (_) {}
  });
  charts = {};
}

function drawChart(canvas, spec, currentAgg, compareAgg = [], compareEnabled = false) {
  const labels = currentAgg.map((x) => x.label);
  const currentData = currentAgg.map((x) => x.values[spec.key]);

  const datasets = [{
    label: "Current",
    data: currentData,
    borderColor: spec.color,
    backgroundColor: spec.color,
    pointRadius: currentAgg.length > 80 ? 0 : 2,
    borderWidth: 2,
    tension: 0.25,
    spanGaps: true
  }];

  if (compareEnabled && compareAgg.length) {
    const comparisonData = compareAgg.map((x) => x.values[spec.key]);

    datasets.push({
      label: $("compareMode")?.value === "lastWeek" ? "Last Week" : "Previous Period",
      data: comparisonData,
      borderColor: "#64748B",
      backgroundColor: "#64748B",
      borderDash: [6, 5],
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.25,
      spanGaps: true
    });
  }

  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: compareEnabled,
          labels: { color: "#9fb9d2", boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              return `${ctx.dataset.label}: ${spec.format(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#7195b5",
            maxTicksLimit: 8
          },
          grid: { color: "rgba(50,100,140,.12)" }
        },
        y: {
          ticks: {
            color: "#7195b5",
            callback: (value) => {
              if (spec.unit === "%") return `${value}%`;
              if (spec.unit === "ms") return `${value} ms`;
              return `${value} GB`;
            }
          },
          grid: { color: "rgba(50,100,140,.12)" }
        }
      }
    }
  });
}

function renderCharts(currentRows) {
  const container = $("charts");
  if (!container || typeof Chart === "undefined") return;

  destroyCharts();
  container.innerHTML = "";

  const period = $("period")?.value || "15min";
  const compareEnabled = Boolean($("compare")?.checked);
  const currentAgg = aggregateRows(currentRows, period);
  const compareRows = compareEnabled ? getComparisonRows(currentRows) : [];
  const compareAgg = compareEnabled ? aggregateRows(compareRows, period) : [];

  if (!currentAgg.length) {
    container.innerHTML = `
      <div class="chart-card panel" style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;min-height:220px;">
        <span style="color:#79a7ca">Tidak ada data untuk filter yang dipilih.</span>
      </div>`;
    return;
  }

  specs.forEach((spec) => {
    const card = document.createElement("div");
    card.className = "chart-card panel";

    const title = document.createElement("div");
    title.className = "chart-title";
    title.innerHTML = `<strong>${escapeHtml(spec.label)}</strong><span>${escapeHtml(spec.unit)}</span>`;

    const canvasWrap = document.createElement("div");
    canvasWrap.style.position = "relative";
    canvasWrap.style.height = "155px";

    const canvas = document.createElement("canvas");

    canvasWrap.appendChild(canvas);
    card.appendChild(title);
    card.appendChild(canvasWrap);
    container.appendChild(card);

    charts[spec.key] = drawChart(
      canvas,
      spec,
      currentAgg,
      compareAgg,
      compareEnabled
    );
  });
}

function renderKpis(currentRows) {
  const container = $("kpis");
  if (!container) return;

  if (!currentRows.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = specs.map((spec) => {
    const value = aggregateMetric(currentRows, spec);
    return `
      <div class="kpi-card panel">
        <div class="kpi-label">${escapeHtml(spec.label)}</div>
        <div class="kpi-value">${escapeHtml(spec.format(value))}</div>
        <div class="kpi-unit">${escapeHtml(spec.unit)}</div>
      </div>
    `;
  }).join("");
}

function renderTable(data) {
  const head = $("tableHead");
  const body = $("tableBody");

  if (!head || !body) return;

  head.innerHTML = `<tr>${TABLE_COLUMNS.map(([, label]) =>
    `<th>${escapeHtml(label)}</th>`
  ).join("")}</tr>`;

  const latest = [...data]
    .sort((a, b) => b.__date - a.__date)
    .slice(0, 500);

  body.innerHTML = latest.map((row) => `
    <tr>
      <td>${escapeHtml(row["15 Minutes"])}</td>
      <td>${escapeHtml(row.REGION)}</td>
      <td>${escapeHtml(row.CIRCLE)}</td>
      <td>${escapeHtml(row.BRANCH)}</td>
      <td>${escapeHtml(row.KABUPATEN)}</td>
      <td class="num">${formatNumber(trafficGB(row), 6)}</td>
      <td class="num">${formatNumber(numberValue(row["Downlink TCP Retransmission Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Uplink TCP Retransmission Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["TCP Connection Success Rate (Included RST)(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Downlink TCP Packet Loss Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Uplink TCP Packet Loss Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["E2E Delay(ms)"]), 1)}</td>
      <td class="num">${formatNumber(numberValue(row["SYN ACK-ACK Delay(ms)"]), 1)}</td>
      <td class="num">${formatNumber(numberValue(row["SYN-SYN ACK Delay(ms)"]), 1)}</td>
    </tr>
  `).join("");

  if (!latest.length) {
    body.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}" style="text-align:center;color:#79a7ca;padding:30px">Tidak ada data.</td></tr>`;
  }
}

function renderDataPage() {
  const head = $("dataHead");
  const body = $("dataBody");
  if (!head || !body) return;

  head.innerHTML = `<tr>${TABLE_COLUMNS.map(([, label]) =>
    `<th>${escapeHtml(label)}</th>`
  ).join("")}</tr>`;

  const search = cleanText($("dataSearch")?.value).toLowerCase();

  let data = [...rows];

  if (search) {
    data = data.filter((row) =>
      TABLE_COLUMNS.some(([column]) =>
        cleanText(row[column]).toLowerCase().includes(search)
      )
    );
  }

  data.sort((a, b) => b.__date - a.__date);

  const shown = data.slice(0, 1000);

  if ($("dataCount")) {
    $("dataCount").textContent =
      `${formatNumber(data.length, 0)} matching / ${formatNumber(rows.length, 0)} total`;
  }

  body.innerHTML = shown.map((row) => `
    <tr>
      <td>${escapeHtml(row["15 Minutes"])}</td>
      <td>${escapeHtml(row.REGION)}</td>
      <td>${escapeHtml(row.CIRCLE)}</td>
      <td>${escapeHtml(row.BRANCH)}</td>
      <td>${escapeHtml(row.KABUPATEN)}</td>
      <td class="num">${formatNumber(trafficGB(row), 6)}</td>
      <td class="num">${formatNumber(numberValue(row["Downlink TCP Retransmission Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Uplink TCP Retransmission Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["TCP Connection Success Rate (Included RST)(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Downlink TCP Packet Loss Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["Uplink TCP Packet Loss Rate(%)"]), 2)}</td>
      <td class="num">${formatNumber(numberValue(row["E2E Delay(ms)"]), 1)}</td>
      <td class="num">${formatNumber(numberValue(row["SYN ACK-ACK Delay(ms)"]), 1)}</td>
      <td class="num">${formatNumber(numberValue(row["SYN-SYN ACK Delay(ms)"]), 1)}</td>
    </tr>
  `).join("");
}

function updateDashboard() {
  filteredRows = getFilteredRows();

  renderKpis(filteredRows);
  renderCharts(filteredRows);
  renderTable(filteredRows);
}

function resetFilters() {
  const dates = rows
    .map((r) => r.__date)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dates.length) {
    if ($("dateFrom")) $("dateFrom").value = dateInputValue(dates[0]);
    if ($("dateTo")) $("dateTo").value = dateInputValue(dates[dates.length - 1]);
  }

  ["region", "circle", "branch", "kabupaten"].forEach((id) => {
    if ($(id)) $(id).value = "ALL";
  });

  if ($("period")) $("period").value = "15min";
  if ($("compare")) $("compare").checked = false;
  if ($("compareMode")) $("compareMode").value = "lastWeek";

  applyDependentFilters();
  updateDashboard();
}

function setupFilterEvents() {
  ["dateFrom", "dateTo", "period", "compare", "compareMode"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("change", updateDashboard);
    }
  });

  ["region", "circle", "branch", "kabupaten"].forEach((id) => {
    const el = $(id);
    if (!el) return;

    el.addEventListener("change", () => {
      applyDependentFilters();
      updateDashboard();
    });
  });

  const reset = $("reset");
  if (reset) reset.addEventListener("click", resetFilters);
}

function downloadCSV(data, filename) {
  if (!data.length) {
    alert("Tidak ada data untuk di-download.");
    return;
  }

  const columns = TABLE_COLUMNS.map(([column]) => column);

  const lines = [
    columns.map(csvEscape).join(","),
    ...data.map((row) => columns.map((column) => {
      if (column === "Total Traffic(Byte)") {
        return csvEscape(trafficGB(row));
      }
      return csvEscape(row[column]);
    }).join(","))
  ];

  const blob = new Blob(["\ufeff" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replaceAll('"', '""')}"`;
}

function setupDownloads() {
  const downloadMain = $("downloadCsv");
  if (downloadMain) {
    downloadMain.addEventListener("click", () => {
      downloadCSV(
        filteredRows,
        `sqm_filtered_${dateKey(new Date())}.csv`
      );
    });
  }

  const downloadData = $("downloadCsv2");
  if (downloadData) {
    downloadData.addEventListener("click", () => {
      downloadCSV(
        rows,
        `sqm_raw_export_${dateKey(new Date())}.csv`
      );
    });
  }
}

function renderMapList() {
  const list = $("mapList");
  if (!list) return;

  const search = cleanText($("mapSearch")?.value).toLowerCase();
  let column = "REGION";

  if (activeMap === "circle") column = "CIRCLE";
  if (activeMap === "branch") column = "BRANCH";
  if (activeMap === "kabupaten") column = "KABUPATEN";

  let values = uniqueSorted(rows, column);

  if (search) {
    values = values.filter((v) => v.toLowerCase().includes(search));
  }

  values = values.slice(0, 150);

  list.innerHTML = values.map((value) => `
    <button class="map-item" data-map-value="${escapeHtml(value)}">
      <span>${escapeHtml(value)}</span>
      <small>${formatNumber(rows.filter(r => cleanText(r[column]) === value).length, 0)} records</small>
    </button>
  `).join("");

  if (!values.length) {
    list.innerHTML = `<div style="padding:15px;color:#79a7ca">No matching data.</div>`;
  }

  list.querySelectorAll(".map-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.mapValue;
      const idMap = {
        region: "region",
        circle: "circle",
        branch: "branch",
        kabupaten: "kabupaten"
      };

      const select = $(idMap[activeMap]);
      if (select) {
        select.value = value;
        applyDependentFilters();
        updateDashboard();
      }

      renderMapPerformance(value, column);
    });
  });
}

function renderMapPerformance(value, column) {
  const target = $("regionPerformance");
  if (!target) return;

  const selectedRows = rows.filter((r) => cleanText(r[column]) === value);

  const metrics = specs.map((spec) => ({
    spec,
    value: aggregateMetric(selectedRows, spec)
  }));

  target.innerHTML = `
    <div style="margin-bottom:10px;color:#e9f4ff;font-weight:700">${escapeHtml(value)}</div>
    ${metrics.slice(0, 5).map(({spec, value: v}) => `
      <div style="display:flex;justify-content:space-between;gap:10px;margin:7px 0;color:#9fb9d2">
        <span>${escapeHtml(spec.label)}</span>
        <b style="color:${spec.color}">${escapeHtml(spec.format(v))}</b>
      </div>
    `).join("")}
  `;
}

function renderTopology() {
  const canvas = $("topologyCanvas");
  if (!canvas) return;

  const regionCount = uniqueSorted(rows, "REGION").length;
  const circleCount = uniqueSorted(rows, "CIRCLE").length;
  const branchCount = uniqueSorted(rows, "BRANCH").length;
  const kabCount = uniqueSorted(rows, "KABUPATEN").length;

  canvas.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:30px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;max-width:900px">
        ${topologyNode("SQM", "Monitoring", "#00BFFF")}
        <span style="color:#315e80">→</span>
        ${topologyNode(regionCount, "Regions", "#20E887")}
        <span style="color:#315e80">→</span>
        ${topologyNode(circleCount, "Circles", "#A84CFF")}
        <span style="color:#315e80">→</span>
        ${topologyNode(branchCount, "Branches", "#FF9D00")}
        <span style="color:#315e80">→</span>
        ${topologyNode(kabCount, "Kabupaten", "#FF168C")}
      </div>
    </div>
  `;
}

function topologyNode(value, label, color) {
  return `
    <div style="min-width:125px;text-align:center;border:1px solid ${color};border-radius:10px;padding:18px 12px;background:rgba(4,20,36,.8);box-shadow:0 0 20px rgba(0,0,0,.15)">
      <div style="font-size:22px;font-weight:800;color:${color}">${escapeHtml(value)}</div>
      <div style="margin-top:5px;color:#79a7ca;font-size:12px">${escapeHtml(label)}</div>
    </div>
  `;
}

function setupMap() {
  document.querySelectorAll(".map-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".map-tab").forEach((x) => x.classList.remove("active"));
      tab.classList.add("active");
      activeMap = tab.dataset.map || "region";
      renderMapList();
    });
  });

  const search = $("mapSearch");
  if (search) search.addEventListener("input", renderMapList);

  renderMapList();
  renderTopology();
}

function setupNavigation() {
  const views = {
    dashboard: "dashboardView",
    map: "mapView",
    data: "dataView",
    settings: "settingsView"
  };

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view || "dashboard";

      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");

      document.querySelectorAll(".view").forEach((view) => {
        view.classList.remove("active-view");
      });

      const target = $(views[viewName] || "dashboardView");
      if (target) target.classList.add("active-view");

      if (viewName === "data") renderDataPage();
      if (viewName === "map") {
        renderMapList();
        renderTopology();
      }
    });
  });
}

function setupDataSearch() {
  const input = $("dataSearch");
  if (!input) return;

  input.addEventListener("input", renderDataPage);
}

function updateClock() {
  const clock = document.querySelector(".clock");
  if (!clock) return;

  clock.textContent = new Date().toLocaleTimeString("id-ID", {
    hour12: false
  });
}

function updateSettingsText() {
  const settingsRows = document.querySelectorAll("#settingsView .setting-row");

  settingsRows.forEach((row) => {
    const label = row.querySelector("b");
    const value = row.querySelector("span");

    if (label && label.textContent.trim().toLowerCase() === "traffic unit" && value) {
      value.textContent = "GB (decimal, source column Byte)";
    }
  });
}

function showLoadError(message) {
  const kpis = $("kpis");
  const charts = $("charts");

  if (kpis) {
    kpis.innerHTML = `
      <div class="panel" style="grid-column:1/-1;padding:18px;color:#ff476f">
        <strong>Gagal memuat data SQM</strong><br>
        <span style="color:#9fb9d2">${escapeHtml(message)}</span>
      </div>
    `;
  }

  if (charts) charts.innerHTML = "";
}

function loadCSV() {
  if (typeof Papa === "undefined") {
    showLoadError("PapaParse tidak ditemukan. Periksa koneksi CDN PapaParse.");
    return;
  }

  console.log("Memuat CSV:", CSV_PATH);

  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    worker: false,
    complete: (result) => {
      try {
        console.log("CSV berhasil di-load");
        console.log("Rows hasil parse:", result.data.length);
        console.log("Fields:", result.meta.fields);

        if (!result.data.length) {
          throw new Error("CSV terbaca tetapi tidak memiliki baris data.");
        }

        const requiredColumns = [
          "15 Minutes",
          "REGION",
          "BRANCH",
          "KABUPATEN",
          "CIRCLE",
          "Total Traffic(Byte)"
        ];

        const missing = requiredColumns.filter(
          (column) => !result.meta.fields.includes(column)
        );

        if (missing.length) {
          throw new Error(
            `Kolom CSV tidak sesuai. Kolom yang hilang: ${missing.join(", ")}`
          );
        }

        rows = result.data
          .map((row) => {
            const d = parseDate(row["15 Minutes"]);
            row.__date = d;
            return row;
          })
          .filter((row) => row.__date);

        console.log("Rows valid dengan timestamp:", rows.length);

        if (!rows.length) {
          throw new Error(
            'Kolom "15 Minutes" tidak memiliki timestamp yang bisa dibaca.'
          );
        }

        setupBaseFilters();
        applyDependentFilters();
        setupFilterEvents();
        setupDownloads();
        setupMap();
        setupNavigation();
        setupDataSearch();
        updateSettingsText();
        updateDashboard();
        renderDataPage();

        console.log("SQM dashboard siap.");
        console.log("Total rows:", rows.length);
        console.log(
          "Date range:",
          dateInputValue(rows.reduce((a, b) => a.__date < b.__date ? a : b).__date),
          "to",
          dateInputValue(rows.reduce((a, b) => a.__date > b.__date ? a : b).__date)
        );
      } catch (error) {
        console.error(error);
        showLoadError(error.message || "Terjadi kesalahan saat memproses CSV.");
      }
    },
    error: (error) => {
      console.error("CSV load error:", error);
      showLoadError(
        `Tidak dapat memuat ${CSV_PATH}. Pastikan file berada di folder data/ dan GitHub Pages sudah selesai deploy.`
      );
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadCSV();
});
