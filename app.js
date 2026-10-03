const CSV_PATH = "data/raw_data.csv";

const TRAFFIC_DIVISOR = 1e9;
const TRAFFIC_UNIT = "GB";

let rows = [];
let charts = {};
let activeMap = "region";

const $ = (id) => document.getElementById(id);

const specs = [
 {
  key: "traffic",
  title: "Total Traffic",
  unit: "GB",
  color: "#00BFFF",
  icon: "◉",
  source: "Total Traffic(Byte)",
  format: (v) => `${v.toFixed(3)} GB`
},
  {
    key: "dlRetx",
    title: "DL TCP Retransmission",
    unit: "%",
    color: "#20E887",
    icon: "⟳",
    source: "Downlink TCP Retransmission Rate(%)",
    format: (v) => `${v.toFixed(2)}%`
  },
  {
    key: "ulRetx",
    title: "UL TCP Retransmission",
    unit: "%",
    color: "#FF9D00",
    icon: "◉",
    source: "Uplink TCP Retransmission Rate(%)",
    format: (v) => `${v.toFixed(2)}%`
  },
  {
    key: "tcp",
    title: "TCP Success Rate",
    unit: "%",
    color: "#A84CFF",
    icon: "⬡",
    source: "TCP Connection Success Rate (Included RST)(%)",
    format: (v) => `${v.toFixed(2)}%`
  },
  {
    key: "dlLoss",
    title: "DL Packet Loss",
    unit: "%",
    color: "#00BFFF",
    icon: "✥",
    source: "Downlink TCP Packet Loss Rate(%)",
    format: (v) => `${v.toFixed(2)}%`
  },
  {
    key: "ulLoss",
    title: "UL Packet Loss",
    unit: "%",
    color: "#FF168C",
    icon: "✥",
    source: "Uplink TCP Packet Loss Rate(%)",
    format: (v) => `${v.toFixed(2)}%`
  },
  {
    key: "e2e",
    title: "E2E Delay",
    unit: "ms",
    color: "#20E887",
    icon: "◷",
    source: "E2E Delay(ms)",
    format: (v) => `${v.toFixed(0)} ms`
  },
  {
    key: "synAck",
    title: "SYN ACK-ACK Delay",
    unit: "ms",
    color: "#A84CFF",
    icon: "✥",
    source: "SYN ACK-ACK Delay(ms)",
    format: (v) => `${v.toFixed(0)} ms`
  },
  {
    key: "synSyn",
    title: "SYN-SYN ACK Delay",
    unit: "ms",
    color: "#00BFFF",
    icon: "✥",
    source: "SYN-SYN ACK Delay(ms)",
    format: (v) => `${v.toFixed(0)} ms`
  }
];

const metricKeys = specs.map((s) => s.source);

function avg(arr) {
  return arr.length
    ? arr.reduce((a, b) => a + b, 0) / arr.length
    : 0;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

/* =========================================================
   DATE
========================================================= */

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  // Format CSV: 10/1/2026 0:00
  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] || 0);

    return new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    );
  }

  const fallback = new Date(text);

  return Number.isNaN(fallback.getTime())
    ? null
    : fallback;
}

function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* =========================================================
   METRIC
========================================================= */

function metricValue(row, key) {
  const value = Number(row[key]);

  if (!Number.isFinite(value)) return 0;

  if (key === "Total Traffic(Byte)") {
    return value / TRAFFIC_DIVISOR;
  }

  return value;
}

/* =========================================================
   FILTER
========================================================= */

function unique(field) {
  return [
    ...new Set(
      rows
        .map((r) => r[field])
        .filter((v) => v !== undefined && v !== null && v !== "")
    )
  ].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function uniqueFrom(data, field) {
  return [
    ...new Set(
      data
        .map((r) => r[field])
        .filter((v) => v !== undefined && v !== null && v !== "")
    )
  ].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function fillSelect(id, values, label) {
  const element = $(id);
  if (!element) return;

  const oldValue = element.value;

  element.innerHTML =
    `<option value="ALL">All ${label}</option>` +
    values
      .map(
        (v) =>
          `<option value="${esc(v)}">${esc(v)}</option>`
      )
      .join("");

  if (values.includes(oldValue)) {
    element.value = oldValue;
  }
}

function setupFilters() {
  if (!rows.length) return;

  const dateFrom = $("dateFrom");
  const dateTo = $("dateTo");
  const period = $("period");
  const region = $("region");
  const circle = $("circle");
  const branch = $("branch");
  const kabupaten = $("kabupaten");
  const compare = $("compare");
  const compareMode = $("compareMode");
  const reset = $("reset");

  const minDate = rows[0].dt;
  const maxDate = rows[rows.length - 1].dt;

  dateFrom.value = localISODate(minDate);
  dateTo.value = localISODate(maxDate);

  fillSelect("region", unique("REGION"), "Region");

  refreshDependentFilters();

  [
    dateFrom,
    dateTo,
    period,
    region,
    circle,
    branch,
    kabupaten,
    compare,
    compareMode
  ].forEach((element) => {
    if (!element) return;

    element.addEventListener("change", () => {
      if (
        ["region", "circle", "branch"].includes(element.id)
      ) {
        refreshDependentFilters();
      }

      updateDashboard();
    });
  });

  reset.addEventListener("click", () => {
    dateFrom.value = localISODate(minDate);
    dateTo.value = localISODate(maxDate);

    period.value = "15min";

    region.value = "ALL";
    circle.value = "ALL";
    branch.value = "ALL";
    kabupaten.value = "ALL";

    compare.checked = false;
    compareMode.value = "lastWeek";

    refreshDependentFilters();
    updateDashboard();
  });
}

function refreshDependentFilters() {
  const region = $("region");
  const circle = $("circle");
  const branch = $("branch");
  const kabupaten = $("kabupaten");

  if (!region || !circle || !branch || !kabupaten) return;

  const selectedRegion = region.value;
  const selectedCircle = circle.value;
  const selectedBranch = branch.value;

  let filtered = rows.filter(
    (r) =>
      selectedRegion === "ALL" ||
      r.REGION === selectedRegion
  );

  fillSelect(
    "circle",
    uniqueFrom(filtered, "CIRCLE"),
    "Circle"
  );

  filtered = filtered.filter(
    (r) =>
      selectedCircle === "ALL" ||
      r.CIRCLE === selectedCircle
  );

  fillSelect(
    "branch",
    uniqueFrom(filtered, "BRANCH"),
    "Branch"
  );

  filtered = filtered.filter(
    (r) =>
      selectedBranch === "ALL" ||
      r.BRANCH === selectedBranch
  );

  fillSelect(
    "kabupaten",
    uniqueFrom(filtered, "KABUPATEN"),
    "Kabupaten"
  );

  if (
    ![
      "ALL",
      ...uniqueFrom(filtered, "KABUPATEN")
    ].includes(kabupaten.value)
  ) {
    kabupaten.value = "ALL";
  }
}

/* =========================================================
   FILTER DATA
========================================================= */

function getDateRange(shiftDays = 0) {
  const fromInput = $("dateFrom");
  const toInput = $("dateTo");

  const from = new Date(
    `${fromInput.value}T00:00:00`
  );

  const to = new Date(
    `${toInput.value}T23:59:59`
  );

  from.setDate(from.getDate() + shiftDays);
  to.setDate(to.getDate() + shiftDays);

  return { from, to };
}

function filteredData(shiftDays = 0) {
  const range = getDateRange(shiftDays);

  const region = $("region").value;
  const circle = $("circle").value;
  const branch = $("branch").value;
  const kabupaten = $("kabupaten").value;

  return rows.filter((r) => {
    return (
      r.dt >= range.from &&
      r.dt <= range.to &&
      (region === "ALL" || r.REGION === region) &&
      (circle === "ALL" || r.CIRCLE === circle) &&
      (branch === "ALL" || r.BRANCH === branch) &&
      (kabupaten === "ALL" || r.KABUPATEN === kabupaten)
    );
  });
}

/* =========================================================
   AGGREGATION
========================================================= */

function bucketKey(row) {
  const period = $("period").value;

  const date = new Date(row.dt);

  if (period === "daily") {
    date.setHours(0, 0, 0, 0);
  }

  if (period === "hourly") {
    date.setMinutes(0, 0, 0);
  }

  return date.getTime();
}

function aggregate(data) {
  const map = new Map();

  data.forEach((row) => {
    const key = bucketKey(row);

    if (!map.has(key)) {
      map.set(key, {
        k: key,
        n: 0
      });

      metricKeys.forEach((metric) => {
        map.get(key)[metric] = 0;
      });
    }

    const item = map.get(key);

    item.n++;

    metricKeys.forEach((metric) => {
      item[metric] += metricValue(
        row,
        metric
      );
    });
  });

  return [...map.values()]
    .sort((a, b) => a.k - b.k)
    .map((item) => {
      metricKeys.forEach((metric) => {
        item[metric] =
          item[metric] / item.n;
      });

      return item;
    });
}

/* =========================================================
   CHART
========================================================= */

function rgba(hex, alpha) {
  const value = parseInt(
    hex.substring(1),
    16
  );

  const r = value >> 16;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r},${g},${b},${alpha})`;
}

function chartLabels(data) {
  const period = $("period").value;

  return data.map((item) => {
    const date = new Date(item.k);

    if (period === "daily") {
      return date.toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short"
        }
      );
    }

    if (period === "hourly") {
      return (
        date.toLocaleDateString(
          "en-GB",
          {
            day: "2-digit",
            month: "short"
          }
        ) +
        " " +
        date.toLocaleTimeString(
          "en-GB",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      );
    }

    return (
      date.toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short"
        }
      ) +
      " " +
      date.toLocaleTimeString(
        "en-GB",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    );
  });
}

function drawChart(spec, current, comparison) {
  const canvas = $(`ch_${spec.key}`);

  if (!canvas) return;

  if (charts[spec.key]) {
    charts[spec.key].destroy();
  }

  const datasets = [
    {
      label: "Current",
      data: current.map(
        (x) => x[spec.source]
      ),
      borderColor: spec.color,
      backgroundColor: rgba(
        spec.color,
        0.12
      ),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: true
    }
  ];

  const compare =
    $("compare").checked;

  if (
    compare &&
    comparison.length
  ) {
    datasets.push({
      label:
        $("compareMode").value ===
        "lastWeek"
          ? "Compare (Last Week)"
          : "Compare (Previous Period)",
      data: comparison.map(
        (x) => x[spec.source]
      ),
      borderColor: spec.color,
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0.3,
      fill: false
    });
  }

  charts[spec.key] =
    new Chart(canvas, {
      type: "line",

      data: {
        labels: chartLabels(current),
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
            display: false
          }
        },

        scales: {
          x: {
            ticks: {
              color: "#74a6ca",
              maxTicksLimit: 8
            },
            grid: {
              color:
                "rgba(24,85,122,.25)"
            }
          },

          y: {
            ticks: {
              color: "#74a6ca",
              maxTicksLimit: 5
            },
            grid: {
              color:
                "rgba(24,85,122,.25)"
            }
          }
        }
      }
    });
}

function renderCharts(current, comparison) {
  const chartsBox = $("charts");

  if (!chartsBox) return;

  chartsBox.innerHTML = specs
    .map(
      (spec) => `
        <div class="chart-card">

          <div class="chart-head">

            <h3>
              ${esc(spec.title)}
              (${esc(spec.unit)})
            </h3>

            <div class="legend">

              <b style="color:${spec.color}">
                ━━ Current
              </b>

              ${
                $("compare").checked &&
                comparison.length
                  ? `
                    <b style="color:${spec.color}">
                      ┄┄ Compare
                    </b>
                  `
                  : ""
              }

            </div>

          </div>

          <canvas id="ch_${spec.key}"></canvas>

        </div>
      `
    )
    .join("");

  specs.forEach((spec) => {
    drawChart(
      spec,
      current,
      comparison
    );
  });
}

/* =========================================================
   KPI
========================================================= */

function renderKpis(current, comparison) {
  const box = $("kpis");

  if (!box) return;

  const currentLast =
    current.length
      ? current[current.length - 1]
      : null;

  const comparisonLast =
    comparison.length
      ? comparison[comparison.length - 1]
      : null;

  box.innerHTML = specs
    .map((spec, index) => {
      const value = currentLast
        ? currentLast[spec.source]
        : 0;

      const oldValue =
        comparisonLast
          ? comparisonLast[
              spec.source
            ]
          : null;

      let deltaHtml = `
        <div class="delta">
          ● Live
        </div>

        <div class="vs">
          Current filtered period
        </div>
      `;

      if (
        oldValue !== null &&
        oldValue !== undefined &&
        oldValue !== 0
      ) {
        const difference =
          value - oldValue;

        const percentage =
          (difference /
            Math.abs(oldValue)) *
          100;

        deltaHtml = `
          <div class="delta">
            ${
              difference >= 0
                ? "▲"
                : "▼"
            }
            ${Math.abs(
              percentage
            ).toFixed(2)}%
          </div>

          <div class="vs">
            vs ${spec.format(
              oldValue
            )}
            ${
              $("compareMode").value ===
              "lastWeek"
                ? "(Last Week)"
                : "(Previous Period)"
            }
          </div>
        `;
      }

      const colors = [
        "green",
        "orange",
        "purple",
        "pink"
      ];

      return `
        <div class="kpi ${colors[index % 4]}">

          <div class="icon">
            ${spec.icon}
          </div>

          <h3>
            ${esc(spec.title)}
          </h3>

          <span class="unit">
            ${esc(spec.unit)}
          </span>

          <div class="value">
            ${spec.format(value)}
          </div>

          ${deltaHtml}

        </div>
      `;
    })
    .join("");
}

/* =========================================================
   TABLE
========================================================= */

const tableColumns = [
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

const tableHeaders = [
  "DATE / TIME",
  "REGION",
  "CIRCLE",
  "BRANCH",
  "KABUPATEN",
  "TOTAL TRAFFIC (GB)",
  "DL RETX (%)",
  "UL RETX (%)",
  "TCP SUCCESS (%)",
  "DL LOSS (%)",
  "UL LOSS (%)",
  "E2E (ms)",
  "SYN ACK-ACK (ms)",
  "SYN-SYN ACK (ms)"
];

function renderTable(
  data,
  bodyId = "tableBody",
  headId = "tableHead",
  limit = 500
) {
  const head = $(headId);
  const body = $(bodyId);

  if (!head || !body) return;

  head.innerHTML =
    "<tr>" +
    tableHeaders
      .map(
        (header) =>
          `<th>${header}</th>`
      )
      .join("") +
    "</tr>";

  const output = [...data]
    .sort(
      (a, b) => b.dt - a.dt
    )
    .slice(0, limit);

  body.innerHTML = output
    .map(
      (row) => `
        <tr>

          <td>
            ${esc(row["15 Minutes"])}
          </td>

          <td>
            ${esc(row.REGION)}
          </td>

          <td>
            ${esc(row.CIRCLE)}
          </td>

          <td>
            ${esc(row.BRANCH)}
          </td>

          <td>
            ${esc(row.KABUPATEN)}
          </td>

          <td class="num">
            ${
              Number(
                row["Total Traffic(Byte)"]
              ) /
              TRAFFIC_DIVISOR
            .toFixed(6)}
          </td>

          <td class="num">
            ${Number(
              row[
                "Downlink TCP Retransmission Rate(%)"
              ] || 0
            ).toFixed(2)}
          </td>

          <td class="num">
            ${Number(
              row[
                "Uplink TCP Retransmission Rate(%)"
              ] || 0
            ).toFixed(2)}
          </td>

          <td class="num">
            ${Number(
              row[
                "TCP Connection Success Rate (Included RST)(%)"
              ] || 0
            ).toFixed(2)}
          </td>

          <td class="num">
            ${Number(
              row[
                "Downlink TCP Packet Loss Rate(%)"
              ] || 0
            ).toFixed(2)}
          </td>

          <td class="num">
            ${Number(
              row[
                "Uplink TCP Packet Loss Rate(%)"
              ] || 0
            ).toFixed(2)}
          </td>

          <td class="num">
            ${Number(
              row["E2E Delay(ms)"] || 0
            ).toFixed(0)}
          </td>

          <td class="num">
            ${Number(
              row["SYN ACK-ACK Delay(ms)"] || 0
            ).toFixed(0)}
          </td>

          <td class="num">
            ${Number(
              row["SYN-SYN ACK Delay(ms)"] || 0
            ).toFixed(0)}
          </td>

        </tr>
      `
    )
    .join("");

  return output;
}

/* =========================================================
   MAIN UPDATE
========================================================= */

function updateDashboard() {
  if (!rows.length) return;

  const currentData =
    filteredData();

  const current =
    aggregate(currentData);

  let comparison = [];

  if ($("compare").checked) {
    let shift = -7;

    if (
      $("compareMode").value ===
      "previous"
    ) {
      const from = new Date(
        $("dateFrom").value
      );

      const to = new Date(
        $("dateTo").value
      );

      const days =
        Math.max(
          1,
          Math.round(
            (to - from) /
              86400000
          ) + 1
        );

      shift = -days;
    }

    comparison =
      aggregate(
        filteredData(shift)
      );
  }

  renderKpis(
    current,
    comparison
  );

  renderCharts(
    current,
    comparison
  );

  renderTable(
    currentData,
    "tableBody",
    "tableHead",
    500
  );
}

/* =========================================================
   MAP
========================================================= */

function renderMap() {
  const mapList = $("mapList");
  const regionPerformance =
    $("regionPerformance");
  const topology =
    $("topologyCanvas");

  if (!mapList) return;

  const search =
    (
      $("mapSearch")?.value ||
      ""
    ).toLowerCase();

  const field =
    activeMap === "region"
      ? "REGION"
      : activeMap === "circle"
      ? "CIRCLE"
      : activeMap === "branch"
      ? "BRANCH"
      : "KABUPATEN";

  const values =
    unique(field)
      .filter((v) =>
        String(v)
          .toLowerCase()
          .includes(search)
      )
      .slice(0, 40);

  mapList.innerHTML =
    values
      .map((value) => {
        const count =
          rows.filter(
            (r) =>
              r[field] === value
          ).length;

        return `
          <div class="map-item">

            <b>
              ${esc(value)}
            </b>

            <span>
              ${count.toLocaleString()}
            </span>

          </div>
        `;
      })
      .join("");

  const regions =
    unique("REGION")
      .slice(0, 12);

  if (regionPerformance) {
    regionPerformance.innerHTML =
      regions
        .map((region) => {
          const data =
            rows.filter(
              (r) =>
                r.REGION ===
                region
            );

          const performance =
            avg(
              data.map(
                (r) =>
                  Number(
                    r[
                      "TCP Connection Success Rate (Included RST)(%)"
                    ]
                  ) || 0
              )
            );

          return `
            <div class="perf">

              <span>
                ${esc(region)}
              </span>

              <b>
                ${performance.toFixed(
                  1
                )}%
              </b>

              <div class="bar">
                <i style="width:${Math.min(
                  100,
                  performance
                )}%"></i>
              </div>

            </div>
          `;
        })
        .join("");
  }

  if (topology) {
    topology.innerHTML =
      regions
        .slice(0, 8)
        .map(
          (region, index) => `
            <div
              class="node"
              style="
                left:${8 +
                  (index % 4) *
                    24}%;
                top:${18 +
                  Math.floor(
                    index / 4
                  ) *
                    42}%;
              "
            >

              <span class="dot"></span>

              <strong>
                ${esc(region)}
              </strong>

              <small>
                ${
                  rows.filter(
                    (r) =>
                      r.REGION ===
                      region
                  ).length
                } records
              </small>

            </div>
          `
        )
        .join("");
  }
}

/* =========================================================
   DOWNLOAD
========================================================= */

function downloadCSV() {
  const data =
    filteredData();

  const csv =
    Papa.unparse(data);

  const blob =
    new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    "sqm_filtered_data.csv";

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}

/* =========================================================
   NAVIGATION
========================================================= */

function initNavigation() {
  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".nav-btn"
            )
            .forEach((item) =>
              item.classList.remove(
                "active"
              )
            );

          button.classList.add(
            "active"
          );

          const viewName =
            button.dataset.view;

          document
            .querySelectorAll(
              ".view"
            )
            .forEach((view) =>
              view.classList.remove(
                "active-view"
              )
            );

          const target =
            $(
              `${viewName}View`
            );

          if (target) {
            target.classList.add(
              "active-view"
            );
          }

          if (
            viewName === "map"
          ) {
            renderMap();
          }

          if (
            viewName === "data"
          ) {
            renderTable(
              rows,
              "dataBody",
              "dataHead",
              1000
            );

            if ($("dataCount")) {
              $("dataCount").textContent =
                `${rows.length.toLocaleString()} records`;
            }
          }

          if (
            viewName ===
            "dashboard"
          ) {
            updateDashboard();
          }
        }
      );
    });
}

/* =========================================================
   CLOCK
========================================================= */

function initClock() {
  const clock =
    $("clock");

  if (!clock) return;

  const updateClock = () => {
    clock.textContent =
      new Date().toLocaleTimeString(
        "en-GB",
        {
          hour12: false
        }
      );
  };

  updateClock();

  setInterval(
    updateClock,
    1000
  );
}

/* =========================================================
   ERROR DISPLAY
========================================================= */

function showError(message) {
  const charts =
    $("charts");

  const kpis =
    $("kpis");

  if (kpis) {
    kpis.innerHTML = `
      <div
        class="panel"
        style="
          grid-column:1/-1;
          padding:25px;
          color:#ff476f;
        "
      >
        <strong>
          ⚠ DATA SOURCE ERROR
        </strong>

        <div style="
          margin-top:8px;
          color:#9fc9e5;
        ">
          ${esc(message)}
        </div>
      </div>
    `;
  }

  if (charts) {
    charts.innerHTML = "";
  }
}

/* =========================================================
   INIT
========================================================= */

function init() {
  initClock();
  initNavigation();

  if (
    typeof Papa ===
    "undefined"
  ) {
    showError(
      "PapaParse tidak berhasil dimuat."
    );
    return;
  }

  if (
    typeof Chart ===
    "undefined"
  ) {
    showError(
      "Chart.js tidak berhasil dimuat."
    );
    return;
  }

  Papa.parse(
    CSV_PATH,
    {
      download: true,
      header: true,
      skipEmptyLines: true,

      complete: function (result) {
        try {
          if (
            !result.data ||
            !result.data.length
          ) {
            throw new Error(
              "CSV kosong atau tidak memiliki data."
            );
          }

          rows =
            result.data
              .filter(
                (row) =>
                  row["15 Minutes"]
              )
              .map((row) => {
                const dt =
                  parseDate(
                    row["15 Minutes"]
                  );

                return {
                  ...row,
                  dt
                };
              })
              .filter(
                (row) =>
                  row.dt &&
                  !Number.isNaN(
                    row.dt.getTime()
                  )
              )
              .sort(
                (a, b) =>
                  a.dt - b.dt
              );

          if (!rows.length) {
            throw new Error(
              "Tidak ada tanggal valid pada kolom 15 Minutes."
            );
          }

          console.log(
            "CSV berhasil di-load"
          );

          console.log(
            "Jumlah rows:",
            rows.length
          );

          setupFilters();

          updateDashboard();

          renderTable(
            rows,
            "dataBody",
            "dataHead",
            1000
          );

          const mapSearch =
            $("mapSearch");

          if (mapSearch) {
            mapSearch.addEventListener(
              "input",
              renderMap
            );
          }

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
                    button.dataset.map;

                  renderMap();
                }
              );
            });

          if ($("downloadCsv")) {
            $("downloadCsv")
              .addEventListener(
                "click",
                downloadCSV
              );
          }

          if ($("downloadCsv2")) {
            $("downloadCsv2")
              .addEventListener(
                "click",
                downloadCSV
              );
          }

          if ($("dataSearch")) {
            $("dataSearch")
              .addEventListener(
                "input",
                () => {
                  const query =
                    $("dataSearch")
                      .value
                      .toLowerCase();

                  const filtered =
                    rows.filter(
                      (row) =>
                        Object.values(
                          row
                        ).some(
                          (value) =>
                            String(
                              value
                            )
                              .toLowerCase()
                              .includes(
                                query
                              )
                        )
                    );

                  renderTable(
                    filtered,
                    "dataBody",
                    "dataHead",
                    1000
                  );
                }
              );
          }

          console.log(
            "Dashboard berhasil diinisialisasi."
          );
        } catch (error) {
          console.error(
            "ERROR DASHBOARD:",
            error
          );

          showError(
            error.message
          );
        }
      },

      error: function (error) {
        console.error(
          "CSV LOAD ERROR:",
          error
        );

        showError(
          `Tidak dapat membaca ${CSV_PATH}. Periksa bahwa file berada di folder data/.`
        );
      }
    }
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
