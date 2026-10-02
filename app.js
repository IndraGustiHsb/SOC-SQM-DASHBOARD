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
const C = {};
let rows = [];
const specs = {

  traffic: [
    "traffic",
    "Total Traffic(Byte)",
    "Byte",
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

const $ = id => document.getElementById(id);
const n = v => { const x=Number(v); return Number.isFinite(x)?x:0; };

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
    out.push(row);
  }

  if (!out.length) {
    return [];
  }

  const headers = out.shift().map(x =>
    x.trim().replace(/^\uFEFF/, "")
  );

  return out.map(values => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = (values[index] ?? "").trim();
    });

    return obj;
  });
}

async function init(){
  try {
    const response = await fetch("./data/raw_data.csv", {
      cache: "no-store"
    });

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
      throw new Error("CSV kosong atau tidak memiliki data");
    }

    console.log("Header:", Object.keys(rows[0]));

    setupFilters();

    const dates = rows
      .map(r => r["15 Minutes"])
      .filter(Boolean)
      .map(v => v.slice(0,10));

    if (dates.length) {
      const sortedDates = dates.slice().sort();

      $("dateFrom").value = sortedDates[0] || "";
      $("dateTo").value = sortedDates[sortedDates.length - 1] || "";
    }

    update();

    setInterval(() => {
      $("clock").textContent =
        new Date().toLocaleString("id-ID");
    }, 1000);

  } catch (e) {
    console.error("ERROR DASHBOARD:", e);

    alert(
      "Dashboard gagal memuat data.\n\n" +
      e.message +
      "\n\nSilakan tekan F12 → Console untuk melihat detail."
    );
  }
}

function unique(key){return [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort()}

function setupFilters(){
  for(const [id,key] of [["branch","BRANCH"],["kabupaten","KABUPATEN"]]){
    unique(key).forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;$(id).appendChild(o)});
  }
  ["dateFrom","dateTo","period","branch","kabupaten"].forEach(id=>$(id).addEventListener("change",update));
  $("reset").onclick=()=>{
    $("dateFrom").value="";$("dateTo").value="";$("period").value="15m";$("branch").value="all";$("kabupaten").value="all";update();
  };
}

function filtered(){
  const from=$("dateFrom").value,to=$("dateTo").value,b=$("branch").value,k=$("kabupaten").value;
  return rows.filter(r=>{
    const d=r["15 Minutes"].slice(0,10);
    return (!from||d>=from)&&(!to||d<=to)&&(b==="all"||r.BRANCH===b)&&(k==="all"||r.KABUPATEN===k);
  });
}

function bucketKey(ts,period){
  const d=new Date(ts.replace(" ","T"));
  if(period==="15m") return ts.slice(0,16);
  if(period==="hourly") return ts.slice(0,13)+":00";
  return ts.slice(0,10);
}

function aggregate(data, key, period) {

    const m = new Map();

    for (const r of data) {

        const k = bucketKey(
            r["15 Minutes"],
            period
        );

        if (!m.has(k)) {
            m.set(k, []);
        }

        m.get(k).push(
            n(r[key])
        );
    }

    const labels = [...m.keys()].sort();

    const vals = labels.map(k => {

        const a = m.get(k);

        // Byte → GB
        if (key === "Total Traffic(Byte)") {

            return (
                a.reduce(
                    (x, y) => x + y,
                    0
                )
                / 1000000000
            );

        }

        // Metric % dan delay = average
        return (
            a.reduce(
                (x, y) => x + y,
                0
            ) / a.length
        );

    });

    return {
        labels,
        vals
    };
}
  }
  const labels=[...m.keys()].sort();
  const vals=labels.map(k=>{
    const a=m.get(k);
    if(key==="Total Traffic(Byte)") return a.reduce((x,y)=>x+y,0)*TRAFFIC_SCALE;
    return a.reduce((x,y)=>x+y,0)/a.length;
  });
  return {labels,vals};
}

function hexToRgba(hex, alpha) {

  const r = parseInt(
    hex.substring(1, 3),
    16
  );

  const g = parseInt(
    hex.substring(3, 5),
    16
  );

  const b = parseInt(
    hex.substring(5, 7),
    16
  );

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function chart(id, data, label, unit, color) {

    if (C[id]) {
        C[id].destroy();
    }

    const ctx = $(id).getContext("2d");

    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        160
    );

    gradient.addColorStop(
        0,
        hexToRgba(color, 0.30)
    );

    gradient.addColorStop(
        1,
        hexToRgba(color, 0.02)
    );

    C[id] = new Chart($(id), {

        type: "line",

        data: {

            labels: data.labels,

            datasets: [{

                label: label,

                data: data.vals,

                borderColor: color,

                backgroundColor: gradient,

                borderWidth: 2,

                pointRadius: 0,

                pointHoverRadius: 4,

                tension: 0.25,

                fill: true

            }]

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
                },

                tooltip: {

                    callbacks: {

                        label: function(c) {

                            return (
                                c.parsed.y.toFixed(2)
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
                        color: "#6fa1bd",
                        maxTicksLimit: 12
                    },

                    grid: {
                        color:
                            "rgba(0,150,220,.12)"
                    }
                },

                y: {

                    ticks: {

                        color: "#75a2bb",

                        callback: function(value) {

                            return value + " " + unit;

                        }

                    },

                    grid: {

                        color:
                            "rgba(0,150,220,.12)"

                    }

                }

            }

        }

    });

}
  }

  const ctx = $(id).getContext("2d");

  // Membuat gradient area di bawah line
  const gradient = ctx.createLinearGradient(
    0,
    0,
    0,
    160
  );

  gradient.addColorStop(
    0,
    hexToRgba(color, 0.30)
  );

  gradient.addColorStop(
    1,
    hexToRgba(color, 0.02)
  );

  C[id] = new Chart($(id), {

    type: "line",

    data: {

      labels: data.labels,

      datasets: [

        {
          label: label,

          data: data.vals,

          borderColor: color,

          backgroundColor: gradient,

          borderWidth: 2,

          pointRadius: 0,

          pointHoverRadius: 4,

          pointBackgroundColor: color,

          pointBorderColor: "#06182a",

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

          backgroundColor: "#06182a",

          borderColor: color,

          borderWidth: 1,

          titleColor: "#ffffff",

          bodyColor: "#d9efff",

          padding: 10,

          displayColors: false,

          callbacks: {

            label: function(c) {

              return `${c.parsed.y.toFixed(2)} ${unit}`;

            }

          }

        }

      },

      scales: {

        x: {

          ticks: {

            color: "#6fa1bd",

            maxTicksLimit: 12,

            font: {
              size: 9
            }

          },

          grid: {

            color: "rgba(0, 150, 220, 0.12)",

            drawBorder: false

          }

        },

        y: {

          beginAtZero: false,

          ticks: {

            color: "#75a2bb",

            font: {
              size: 9
            }

          },

          grid: {

            color: "rgba(0, 150, 220, 0.12)",

            drawBorder: false

          }

        }

      }
      
    }

  });

}

for (
    const [id, [canvas, key, unit, color]]
    of Object.entries(specs)
) {

    chart(
        canvas,
        aggregate(
            data,
            key,
            period
        ),
        key,
        unit,
        color
    );

}

  chart(
    canvas,
    aggregate(data, key, period),
    key,
    unit,
    color
  );

}
  
  renderTable(data);
}

function renderTable(data){
  const body=$("tableBody");body.innerHTML="";
  data.slice().sort((a,b)=>b["15 Minutes"].localeCompare(a["15 Minutes"])).slice(0,500).forEach(r=>{
    const tr=document.createElement("tr");
    const vals=[
      r["15 Minutes"],r.BRANCH,r.KABUPATEN,
      n(r["Total Traffic(Byte)"]).toFixed(4),
      n(r["Downlink TCP Retransmission Rate(%)"]).toFixed(2),
      n(r["Uplink TCP Retransmission Rate(%)"]).toFixed(2),
      n(r["TCP Connection Success Rate (Included RST)(%)"]).toFixed(2),
      n(r["Downlink TCP Packet Loss Rate(%)"]).toFixed(2),
      n(r["Uplink TCP Packet Loss Rate(%)"]).toFixed(2),
      n(r["E2E Delay(ms)"]).toFixed(0),
      n(r["SYN ACK-ACK Delay(ms)"]).toFixed(0),
      n(r["SYN-SYN ACK Delay(ms)"]).toFixed(0)
    ];
    vals.forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});
    body.appendChild(tr);
  });
}
init();
