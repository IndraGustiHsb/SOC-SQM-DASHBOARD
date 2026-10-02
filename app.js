const C = {};
let rows = [];

const TRAFFIC_UNIT = "GB";
const TRAFFIC_DIVISOR = 1000000000;

const specs = {

  traffic: [
    "traffic",
    "Total Traffic(Byte)",
    "GB",
    "#00BFFF"
  ],

  dlRetx: [
    "dlRetx",
    "Downlink TCP Retransmission Rate(%)",
    "%",
    "#20E887"
  ],

  ulRetx: [
    "ulRetx",
    "Uplink TCP Retransmission Rate(%)",
    "%",
    "#FF9D00"
  ],

  tcp: [
    "tcp",
    "TCP Connection Success Rate (Included RST)(%)",
    "%",
    "#A84CFF"
  ],

  dlLoss: [
    "dlLoss",
    "Downlink TCP Packet Loss Rate(%)",
    "%",
    "#00BFFF"
  ],

  ulLoss: [
    "ulLoss",
    "Uplink TCP Packet Loss Rate(%)",
    "%",
    "#FF168C"
  ],

  e2e: [
    "e2e",
    "E2E Delay(ms)",
    "ms",
    "#20E887"
  ],

  synAck: [
    "synAck",
    "SYN ACK-ACK Delay(ms)",
    "ms",
    "#A84CFF"
  ],

  synSyn: [
    "synSyn",
    "SYN-SYN ACK Delay(ms)",
    "ms",
    "#00BFFF"
  ]

};


// ======================================================
// HELPER
// ======================================================

const $ = id => document.getElementById(id);

const n = value => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};


// ======================================================
// CSV PARSER
// ======================================================

function parseCSV(text) {

  const out = [];

  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {

    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = !quoted;
      continue;
    }

    if (ch === "," && !quoted) {

      row.push(cell);
      cell = "";

      continue;
    }

    if ((ch === "\n" || ch === "\r") && !quoted) {

      if (ch === "\r" && next === "\n") {
        i++;
      }

      row.push(cell);
      cell = "";

      if (row.some(v => v !== "")) {
        out.push(row);
      }

      row = [];

      continue;
    }

    cell += ch;
  }

  if (cell !== "" || row.length) {

    row.push(cell);

    if (row.some(v => v !== "")) {
      out.push(row);
    }
  }

  if (!out.length) {
    return [];
  }

  const headers = out.shift().map(header =>
    header
      .trim()
      .replace(/^\uFEFF/, "")
  );

  return out.map(values => {

    const obj = {};

    headers.forEach((header, index) => {

      obj[header] =
        (values[index] ?? "").trim();

    });

    return obj;
  });
}


// ======================================================
// INIT
// ======================================================

async function init() {

  try {

    const response = await fetch(
      "./data/raw_data.csv",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {

      throw new Error(
        `CSV tidak ditemukan. HTTP Status: ${response.status}`
      );

    }

    const text = await response.text();

    console.log("CSV berhasil di-load");
    console.log("Ukuran CSV:", text.length);

    rows = parseCSV(text);

    console.log("Jumlah rows:", rows.length);

    if (!rows.length) {

      throw new Error(
        "CSV kosong atau tidak memiliki data"
      );

    }

    console.log(
      "Header:",
      Object.keys(rows[0])
    );

    setupFilters();

    const dates = rows
      .map(r => r["15 Minutes"])
      .filter(Boolean)
      .map(v => v.slice(0, 10));

    if (dates.length) {

      const sortedDates =
        dates.slice().sort();

      $("dateFrom").value =
        sortedDates[0];

      $("dateTo").value =
        sortedDates[sortedDates.length - 1];

    }

    update();

    setInterval(() => {

      if ($("clock")) {

        $("clock").textContent =
          new Date().toLocaleString("id-ID");

      }

    }, 1000);

  }

  catch (e) {

    console.error(
      "ERROR DASHBOARD:",
      e
    );

    alert(
      "Dashboard gagal memuat data.\n\n" +
      e.message +
      "\n\nSilakan tekan F12 → Console."
    );

  }

}


// ======================================================
// UNIQUE FILTER
// ======================================================

function unique(key) {

  return [
    ...new Set(
      rows
        .map(r => r[key])
        .filter(Boolean)
    )
  ].sort();

}


// ======================================================
// FILTER SETUP
// ======================================================

function setupFilters() {

  for (
    const [id, key] of [
      ["branch", "BRANCH"],
      ["kabupaten", "KABUPATEN"]
    ]
  ) {

    unique(key).forEach(value => {

      const option =
        document.createElement("option");

      option.value = value;
      option.textContent = value;

      $(id).appendChild(option);

    });

  }


  [
    "dateFrom",
    "dateTo",
    "period",
    "branch",
    "kabupaten"
  ].forEach(id => {

    $(id).addEventListener(
      "change",
      update
    );

  });


  $("reset").onclick = () => {

    $("dateFrom").value = "";

    $("dateTo").value = "";

    $("period").value = "15m";

    $("branch").value = "all";

    $("kabupaten").value = "all";

    update();

  };

}


// ======================================================
// FILTER DATA
// ======================================================

function filtered() {

  const from =
    $("dateFrom").value;

  const to =
    $("dateTo").value;

  const branch =
    $("branch").value;

  const kabupaten =
    $("kabupaten").value;


  return rows.filter(r => {

    const date =
      r["15 Minutes"].slice(0, 10);

    return (

      (!from || date >= from) &&

      (!to || date <= to) &&

      (branch === "all" ||
        r.BRANCH === branch) &&

      (kabupaten === "all" ||
        r.KABUPATEN === kabupaten)

    );

  });

}


// ======================================================
// TIME BUCKET
// ======================================================

function bucketKey(ts, period) {

  if (period === "15m") {

    return ts.slice(0, 16);

  }

  if (period === "hourly") {

    return ts.slice(0, 13) + ":00";

  }

  return ts.slice(0, 10);

}


// ======================================================
// AGGREGATION
// ======================================================

function aggregate(data, key, period) {

  const buckets = new Map();

  for (const r of data) {

    const bucket =
      bucketKey(
        r["15 Minutes"],
        period
      );

    if (!buckets.has(bucket)) {

      buckets.set(
        bucket,
        []
      );

    }

    buckets
      .get(bucket)
      .push(
        n(r[key])
      );

  }


  const labels =
    [...buckets.keys()].sort();


  const values =
    labels.map(label => {

      const values =
        buckets.get(label);


      // ==========================================
      // TOTAL TRAFFIC
      // BYTE → GB
      // ==========================================

      if (
        key === "Total Traffic(Byte)"
      ) {

        const totalByte =
          values.reduce(
            (sum, value) =>
              sum + value,
            0
          );

        return (
          totalByte /
          TRAFFIC_DIVISOR
        );

      }


      // ==========================================
      // OTHER METRICS
      // AVERAGE
      // ==========================================

      return (
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      );

    });


  return {
    labels,
    vals: values
  };

}


// ======================================================
// HEX → RGBA
// ======================================================

function hexToRgba(hex, alpha) {

  const r =
    parseInt(
      hex.substring(1, 3),
      16
    );

  const g =
    parseInt(
      hex.substring(3, 5),
      16
    );

  const b =
    parseInt(
      hex.substring(5, 7),
      16
    );

  return `
    rgba(
      ${r},
      ${g},
      ${b},
      ${alpha}
    )
  `;

}


// ======================================================
// CHART
// ======================================================

function chart(
  id,
  data,
  label,
  unit,
  color
) {

  if (C[id]) {

    C[id].destroy();

  }


  const canvas =
    $(id);

  if (!canvas) {

    console.warn(
      `Canvas #${id} tidak ditemukan`
    );

    return;

  }


  const ctx =
    canvas.getContext("2d");


  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      160
    );


  gradient.addColorStop(
    0,
    hexToRgba(
      color,
      0.30
    )
  );


  gradient.addColorStop(
    1,
    hexToRgba(
      color,
      0.02
    )
  );


  C[id] = new Chart(
    canvas,
    {

      type: "line",

      data: {

        labels:
          data.labels,

        datasets: [

          {

            label,

            data:
              data.vals,

            borderColor:
              color,

            backgroundColor:
              gradient,

            borderWidth: 2,

            pointRadius: 0,

            pointHoverRadius: 4,

            pointBackgroundColor:
              color,

            pointBorderColor:
              "#06182a",

            pointBorderWidth: 2,

            tension: 0.25,

            fill: true

          }

        ]

      },


      options: {

        responsive: true,

        maintainAspectRatio: false,

        animation: {
          duration: 500
        },

        interaction: {

          mode: "index",

          intersect: false

        },


        plugins: {

          legend: {
            display: false
          },


          tooltip: {

            backgroundColor:
              "#06182a",

            borderColor:
              color,

            borderWidth: 1,

            titleColor:
              "#ffffff",

            bodyColor:
              "#d9efff",

            padding: 10,

            displayColors: false,


            callbacks: {

              label: function(context) {

                return (
                  context.parsed.y
                    .toFixed(2)
                  + " "
                  + unit
                );

              }

            }

          }

        },


        scales: {

          x: {

            ticks: {

              color:
                "#6fa1bd",

              maxTicksLimit:
                12,

              font: {
                size: 9
              }

            },

            grid: {

              color:
                "rgba(0,150,220,0.12)",

              drawBorder:
                false

            }

          },


          y: {

            beginAtZero: false,

            ticks: {

              color:
                "#75a2bb",

              font: {
                size: 9
              },

              callback:
                function(value) {

                  return (
                    value +
                    " " +
                    unit
                  );

                }

            },

            grid: {

              color:
                "rgba(0,150,220,0.12)",

              drawBorder:
                false

            }

          }

        }

      }

    }
  );

}


// ======================================================
// AVERAGE
// ======================================================

function average(data, key) {

  if (!data.length) {
    return 0;
  }

  return (
    data.reduce(
      (sum, row) =>
        sum + n(row[key]),
      0
    ) / data.length
  );

}


// ======================================================
// KPI
// ======================================================

function updateKpis(data) {

  if (!data.length) {

    if ($("kpiTraffic"))
      $("kpiTraffic").textContent = "-";

    if ($("kpiTcp"))
      $("kpiTcp").textContent = "-";

    if ($("kpiDlRetx"))
      $("kpiDlRetx").textContent = "-";

    if ($("kpiUlRetx"))
      $("kpiUlRetx").textContent = "-";

    if ($("kpiE2e"))
      $("kpiE2e").textContent = "-";

    return;

  }


  // Total Byte → GB
  const totalTrafficGB =
    data.reduce(
      (sum, row) =>
        sum +
        n(row["Total Traffic(Byte)"]),
      0
    ) / TRAFFIC_DIVISOR;


  if ($("kpiTraffic")) {

    $("kpiTraffic").textContent =
      totalTrafficGB.toLocaleString(
        "id-ID",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      ) + " GB";

  }


  if ($("kpiTcp")) {

    $("kpiTcp").textContent =
      average(
        data,
        "TCP Connection Success Rate (Included RST)(%)"
      ).toFixed(2) + " %";

  }


  if ($("kpiDlRetx")) {

    $("kpiDlRetx").textContent =
      average(
        data,
        "Downlink TCP Retransmission Rate(%)"
      ).toFixed(2) + " %";

  }


  if ($("kpiUlRetx")) {

    $("kpiUlRetx").textContent =
      average(
        data,
        "Uplink TCP Retransmission Rate(%)"
      ).toFixed(2) + " %";

  }


  if ($("kpiE2e")) {

    $("kpiE2e").textContent =
      average(
        data,
        "E2E Delay(ms)"
      ).toFixed(2) + " ms";

  }

}


// ======================================================
// UPDATE DASHBOARD
// ======================================================

function update() {

  const data =
    filtered();

  const period =
    $("period").value;


  // ====================================================
  // INFO
  // ====================================================

  $("dataCount").textContent =
    data.length.toLocaleString(
      "id-ID"
    );


  $("branchCount").textContent =
    new Set(
      data.map(
        r => r.BRANCH
      )
    ).size;


  $("periodInfo").textContent =
    period === "15m"
      ? "15 Minutes"
      : period === "hourly"
        ? "Hourly"
        : "Daily";


  $("lastData").textContent =
    data.length
      ? data
          .map(
            r => r["15 Minutes"]
          )
          .sort()
          .at(-1)
      : "-";


  // ====================================================
  // KPI
  // ====================================================

  updateKpis(data);


  // ====================================================
  // CHARTS
  // ====================================================

  for (
    const [
      id,
      [canvas, key, unit, color]
    ]
    of Object.entries(specs)
  ) {

    const aggregated =
      aggregate(
        data,
        key,
        period
      );


    chart(
      canvas,
      aggregated,
      key,
      unit,
      color
    );

  }


  // ====================================================
  // TABLE
  // ====================================================

  renderTable(data);

}


// ======================================================
// TABLE
// ======================================================

function renderTable(data) {

  const body =
    $("tableBody");

  body.innerHTML = "";


  data
    .slice()
    .sort(
      (a, b) =>
        b["15 Minutes"]
          .localeCompare(
            a["15 Minutes"]
          )
    )
    .slice(0, 500)
    .forEach(r => {

      const tr =
        document.createElement("tr");


      const trafficGB =
        n(
          r["Total Traffic(Byte)"]
        ) / TRAFFIC_DIVISOR;


      const vals = [

        r["15 Minutes"],

        r.BRANCH,

        r.KABUPATEN,

        trafficGB.toFixed(4) + " GB",

        n(
          r[
            "Downlink TCP Retransmission Rate(%)"
          ]
        ).toFixed(2) + " %",

        n(
          r[
            "Uplink TCP Retransmission Rate(%)"
          ]
        ).toFixed(2) + " %",

        n(
          r[
            "TCP Connection Success Rate (Included RST)(%)"
          ]
        ).toFixed(2) + " %",

        n(
          r[
            "Downlink TCP Packet Loss Rate(%)"
          ]
        ).toFixed(2) + " %",

        n(
          r[
            "Uplink TCP Packet Loss Rate(%)"
          ]
        ).toFixed(2) + " %",

        n(
          r["E2E Delay(ms)"]
        ).toFixed(0) + " ms",

        n(
          r["SYN ACK-ACK Delay(ms)"]
        ).toFixed(0) + " ms",

        n(
          r["SYN-SYN ACK Delay(ms)"]
        ).toFixed(0) + " ms"

      ];


      vals.forEach(value => {

        const td =
          document.createElement("td");

        td.textContent =
          value;

        tr.appendChild(td);

      });


      body.appendChild(tr);

    });

}


// ======================================================
// START
// ======================================================

init();
