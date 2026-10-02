const TRAFFIC_UNIT = "TB";
const TRAFFIC_SCALE = 1; // source traffic values are displayed as-is. Change to 1/1000 etc. if required by your source definition.

const C = {};
let rows = [];
const specs = {
  traffic:["traffic","Total Traffic(Byte)","TB"],
  dlRetx:["dlRetx","Downlink TCP Retransmission Rate(%)","%"],
  ulRetx:["ulRetx","Uplink TCP Retransmission Rate(%)","%"],
  tcp:["tcp","TCP Connection Success Rate (Included RST)(%)","%"],
  dlLoss:["dlLoss","Downlink TCP Packet Loss Rate(%)","%"],
  ulLoss:["ulLoss","Uplink TCP Packet Loss Rate(%)","%"],
  e2e:["e2e","E2E Delay(ms)","ms"],
  synAck:["synAck","SYN ACK-ACK Delay(ms)","ms"],
  synSyn:["synSyn","SYN-SYN ACK Delay(ms)","ms"]
};

const $ = id => document.getElementById(id);
const n = v => { const x=Number(v); return Number.isFinite(x)?x:0; };

function parseCSV(text){
  const out=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], next=text[i+1];
    if(ch === '"' && quoted && next === '"'){cell+='"';i++;continue}
    if(ch === '"'){quoted=!quoted;continue}
    if(ch === ',' && !quoted){row.push(cell);cell="";continue}
    if((ch === '\n' || ch === '\r') && !quoted){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell);cell="";
      if(row.some(v=>v!=="")) out.push(row);
      row=[];continue
    }
    cell+=ch;
  }
  if(cell!=="" || row.length){row.push(cell);out.push(row)}
  const headers=out.shift().map(x=>x.trim());
  return out.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}

async function init(){
  const text=await fetch("data/raw_data.csv").then(r=>r.text());
  rows=parseCSV(text);
  setupFilters();
  const dates=rows.map(r=>r["15 Minutes"].slice(0,10)).filter(Boolean);
  $("dateFrom").value=dates.slice().sort()[0]||"";
  $("dateTo").value=dates.slice().sort().at(-1)||"";
  update();
  setInterval(()=>{$("clock").textContent=new Date().toLocaleString("id-ID")},1000);
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

function aggregate(data, key, period){
  const m=new Map();
  for(const r of data){
    const k=bucketKey(r["15 Minutes"],period);
    if(!m.has(k))m.set(k,[]);
    m.get(k).push(n(r[key]));
  }
  const labels=[...m.keys()].sort();
  const vals=labels.map(k=>{
    const a=m.get(k);
    if(key==="Total Traffic(Byte)") return a.reduce((x,y)=>x+y,0)*TRAFFIC_SCALE;
    return a.reduce((x,y)=>x+y,0)/a.length;
  });
  return {labels,vals};
}

function chart(id,data,label,unit){
  if(C[id])C[id].destroy();
  C[id]=new Chart($(id),{
    type:"line",
    data:{labels:data.labels,datasets:[{label,data:data.vals,borderWidth:2,pointRadius:1.5,tension:.25,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.y.toFixed(2)} ${unit}`}}},
      scales:{x:{ticks:{color:"#68819a",maxTicksLimit:14},grid:{color:"rgba(90,120,150,.08)"}},
              y:{ticks:{color:"#68819a"},grid:{color:"rgba(90,120,150,.09)"}}}}
  });
}

function update(){
  const data=filtered(), period=$("period").value;
  $("dataCount").textContent=data.length.toLocaleString("id-ID");
  $("branchCount").textContent=new Set(data.map(r=>r.BRANCH)).size;
  $("periodInfo").textContent=period==="15m"?"15 Minutes":period==="hourly"?"Hourly":"Daily";
  $("lastData").textContent=data.length?data.map(r=>r["15 Minutes"]).sort().at(-1):"-";

  for(const [id,[canvas,key,unit]] of Object.entries(specs)){
    chart(canvas,aggregate(data,key,period),key,unit);
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
init().catch(e=>{console.error(e);alert("Gagal membaca data/raw_data.csv");});