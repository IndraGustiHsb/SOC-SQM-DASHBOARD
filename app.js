const TRAFFIC_DIVISOR=1, TRAFFIC_UNIT='TB';
let rows=[], charts={}, activeMap='region';
const specs=[
 {key:'traffic',title:'Total Traffic',unit:'TB',color:'#00BFFF',icon:'◉',source:'Total Traffic(Byte)',format:v=>v.toFixed(3)},
 {key:'dlRetx',title:'DL TCP Retransmission',unit:'%',color:'#20E887',icon:'⟳',source:'Downlink TCP Retransmission Rate(%)',format:v=>v.toFixed(2)+'%'},
 {key:'ulRetx',title:'UL TCP Retransmission',unit:'%',color:'#FF9D00',icon:'◉',source:'Uplink TCP Retransmission Rate(%)',format:v=>v.toFixed(2)+'%'},
 {key:'tcp',title:'TCP Success Rate',unit:'%',color:'#A84CFF',icon:'⬡',source:'TCP Connection Success Rate (Included RST)(%)',format:v=>v.toFixed(2)+'%'},
 {key:'dlLoss',title:'DL Packet Loss',unit:'%',color:'#00BFFF',icon:'✥',source:'Downlink TCP Packet Loss Rate(%)',format:v=>v.toFixed(2)+'%'},
 {key:'ulLoss',title:'UL Packet Loss',unit:'%',color:'#FF168C',icon:'✥',source:'Uplink TCP Packet Loss Rate(%)',format:v=>v.toFixed(2)+'%'},
 {key:'e2e',title:'E2E Delay',unit:'ms',color:'#20E887',icon:'◷',source:'E2E Delay(ms)',format:v=>v.toFixed(0)+' ms'},
 {key:'synAck',title:'SYN ACK-ACK Delay',unit:'ms',color:'#A84CFF',icon:'✥',source:'SYN ACK-ACK Delay(ms)',format:v=>v.toFixed(0)+' ms'},
 {key:'synSyn',title:'SYN-SYN ACK Delay',unit:'ms',color:'#00BFFF',icon:'✥',source:'SYN-SYN ACK Delay(ms)',format:v=>v.toFixed(0)+' ms'}
];
const metricKeys=specs.map(s=>s.source);
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function parseDate(s){const [d,t]=s.split(' '),[m,day,y]=d.split('/').map(Number);return new Date(y,m-1,day,...t.split(':').map(Number));}
function isoDate(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtDate(d){return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
function metricValue(r,key){const v=Number(r[key]||0);return key==='Total Traffic(Byte)'?v/TRAFFIC_DIVISOR:v}
function unique(field){return [...new Set(rows.map(r=>r[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function fillSelect(id,vals){const el=document.getElementById(id), old=el.value;el.innerHTML='<option value="ALL">All '+(id==='region'?'Region':id==='circle'?'Circle':id==='branch'?'Branch':'Kabupaten')+'</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(vals.includes(old))el.value=old}
function setupFilters(){
 const min=rows[0].dt,max=rows[rows.length-1].dt; dateFrom.value=isoDate(min);dateTo.value=isoDate(max); region.innerHTML='<option value="ALL">All Region</option>'+unique('REGION').map(v=>`<option>${esc(v)}</option>`).join(''); refreshDependent();
 ['dateFrom','dateTo','period','region','circle','branch','kabupaten','compare','compareMode'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{if(['region','circle','branch'].includes(id))refreshDependent();update()})); reset.onclick=()=>{dateFrom.value=isoDate(min);dateTo.value=isoDate(max);period.value='15min';region.value=circle.value=branch.value=kabupaten.value='ALL';compare.checked=false;compareMode.value='lastWeek';refreshDependent();update()};
}
function refreshDependent(){
 const r=region.value,c=circle.value,b=branch.value;
 let f=rows.filter(x=>r==='ALL'||x.REGION===r);fillSelect('circle',uniqueFrom(f,'CIRCLE'));f=f.filter(x=>c==='ALL'||x.CIRCLE===c);fillSelect('branch',uniqueFrom(f,'BRANCH'));f=f.filter(x=>b==='ALL'||x.BRANCH===b);fillSelect('kabupaten',uniqueFrom(f,'KABUPATEN'));if(!['ALL',...uniqueFrom(f,'KABUPATEN')].includes(kabupaten.value))kabupaten.value='ALL';
}
function uniqueFrom(arr,field){return [...new Set(arr.map(x=>x[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function filtered(extraShiftDays=0){
 const from=new Date(dateFrom.value+'T00:00:00'),to=new Date(dateTo.value+'T23:59:59');from.setDate(from.getDate()+extraShiftDays);to.setDate(to.getDate()+extraShiftDays);
 return rows.filter(r=>r.dt>=from&&r.dt<=to&&(region.value==='ALL'||r.REGION===region.value)&&(circle.value==='ALL'||r.CIRCLE===circle.value)&&(branch.value==='ALL'||r.BRANCH===branch.value)&&(kabupaten.value==='ALL'||r.KABUPATEN===kabupaten.value));
}
function bucket(r){const p=period.value;if(p==='daily')return isoDate(r.dt);if(p==='hourly'){const d=new Date(r.dt);d.setMinutes(0,0,0);return d.toISOString()}return r.dt.toISOString()}
function aggregate(data){const m=new Map();data.forEach(r=>{const k=bucket(r);if(!m.has(k))m.set(k,{k,n:0});const x=m.get(k);x.n++;metricKeys.forEach(key=>x[key]=(x[key]||0)+metricValue(r,key))});return [...m.values()].sort((a,b)=>a.k.localeCompare(b.k)).map(x=>{metricKeys.forEach(key=>x[key]/=x.n);return x})}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
function drawChart(spec,cur,cmp){const ctx=document.getElementById('ch_'+spec.key).getContext('2d');if(charts[spec.key])charts[spec.key].destroy();const labels=cur.map(x=>new Date(x.k).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+(period.value==='15min'?' '+new Date(x.k).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''));const datasets=[{label:'Current',data:cur.map(x=>x[spec.source]),borderColor:spec.color,backgroundColor:rgba(spec.color,.12),borderWidth:2,pointRadius:cur.length<=1?4:1.5,pointHoverRadius:5,tension:.3,fill:true,spanGaps:true}];if(compare.checked&&cmp.length){datasets.push({label:compareMode.value==='lastWeek'?'Compare (Last Week)':'Compare (Previous Period)',data:cmp.map(x=>x[spec.source]),borderColor:spec.color,borderWidth:1.5,borderDash:[6,4],pointRadius:0,tension:.3,fill:false})}charts[spec.key]=new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#74a6ca',maxTicksLimit:8},grid:{color:'rgba(24,85,122,.25)'}},y:{ticks:{color:'#74a6ca',maxTicksLimit:5},grid:{color:'rgba(24,85,122,.25)'}}}}});}
function renderCharts(cur,cmp){const box=document.getElementById('charts');box.innerHTML=specs.map(s=>`<div class="chart-card"><div class="chart-head"><h3>${s.title} (${s.unit})</h3><div class="legend"><b style="color:${s.color}">━━ Current</b>${compare.checked&&cmp.length?` <b style="color:${s.color}">┄┄ Compare</b>`:''}</div></div><canvas id="ch_${s.key}"></canvas></div>`).join('');specs.forEach(s=>drawChart(s,cur,cmp))}
function updateKpis(cur,cmp){const c=cur.length?cur[cur.length-1]:null,prev=cmp.length?cmp[cmp.length-1]:null;document.getElementById('kpis').innerHTML=specs.slice(0,8).map((s,i)=>{const val=c?c[s.source]:0,old=prev?prev[s.source]:null;let delta='';if(old!==null&&old!==0){const d=val-old,p=(d/Math.abs(old))*100;delta=`<div class="delta">${d>=0?'▲':'▼'} ${Math.abs(p).toFixed(2)}%</div><div class="vs">vs ${s.format(old)} (Compare)</div>`}else delta='<div class="delta">● Live</div><div class="vs">Current filtered period</div>';return `<div class="kpi ${['green','orange','purple','pink'][i%4]}"><div class="icon">${s.icon}</div><h3>${s.title}</h3><span class="unit">${s.unit}</span><div class="value">${s.format(val)}</div>${delta}</div>`}).join('')}
function renderTable(data,bodyId='tableBody',headId='tableHead',limit=500){const cols=['15 Minutes','REGION','CIRCLE','BRANCH','KABUPATEN','Total Traffic(Byte)','Downlink TCP Retransmission Rate(%)','Uplink TCP Retransmission Rate(%)','TCP Connection Success Rate (Included RST)(%)','Downlink TCP Packet Loss Rate(%)','Uplink TCP Packet Loss Rate(%)','E2E Delay(ms)','SYN ACK-ACK Delay(ms)','SYN-SYN ACK Delay(ms)'];document.getElementById(headId).innerHTML='<tr>'+cols.map((c,i)=>`<th>${i===0?'DATE / TIME':c.replace('Total Traffic(Byte)','TOTAL TRAFFIC (TB)').replace('Downlink TCP Retransmission Rate(%)','DL RETX (%)').replace('Uplink TCP Retransmission Rate(%)','UL RETX (%)').replace('TCP Connection Success Rate (Included RST)(%)','TCP SUCCESS (%)').replace('Downlink TCP Packet Loss Rate(%)','DL LOSS (%)').replace('Uplink TCP Packet Loss Rate(%)','UL LOSS (%)').replace('SYN ACK-ACK Delay(ms)','SYN ACK-ACK (ms)').replace('SYN-SYN ACK Delay(ms)','SYN-SYN ACK (ms)')}</th>`).join('')+'</tr>';const out=[...data].sort((a,b)=>b.dt-a.dt).slice(0,limit);document.getElementById(bodyId).innerHTML=out.map((r,i)=>`<tr><td>${esc(r['15 Minutes'])}</td><td>${esc(r.REGION)}</td><td>${esc(r.CIRCLE)}</td><td>${esc(r.BRANCH)}</td><td>${esc(r.KABUPATEN)}</td><td class="num">${(Number(r['Total Traffic(Byte)'])/TRAFFIC_DIVISOR).toFixed(6)}</td><td class="num">${Number(r['Downlink TCP Retransmission Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['Uplink TCP Retransmission Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['TCP Connection Success Rate (Included RST)(%)']).toFixed(2)}</td><td class="num">${Number(r['Downlink TCP Packet Loss Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['Uplink TCP Packet Loss Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['E2E Delay(ms)']).toFixed(0)}</td><td class="num">${Number(r['SYN ACK-ACK Delay(ms)']).toFixed(0)}</td><td class="num">${Number(r['SYN-SYN ACK Delay(ms)']).toFixed(0)}</td></tr>`).join('');return out}
function update(){const cur=aggregate(filtered()),cmp=compare.checked?aggregate(filtered(compareMode.value==='lastWeek'?-7:-Math.max(1,Math.ceil((new Date(dateTo.value)-new Date(dateFrom.value))/86400000+1)))):[];updateKpis(cur,cmp);renderCharts(cur,cmp);renderTable(filtered());}
const indonesiaOutlinePaths=["M997.8 263.2L998.6 472.4L979.2 446.1L957.0 439.6L951.7 448.8L924.1 449.8L933.3 423.6L947.0 414.7L941.3 379.8L930.9 352.9L888.7 325.7L870.7 323.0L838.0 293.3L831.5 308.9L823.2 311.8L818.2 300.0L818.2 286.1L801.5 270.3L825.0 258.7L840.5 259.4L838.7 250.8L806.8 250.8L798.2 231.7L778.7 225.7L769.5 209.9L798.9 202.1L810.0 191.6L845.0 204.8L848.4 216.7L854.5 268.6L877.1 287.9L895.3 253.8L920.3 234.4L939.6 234.4L958.3 245.6L974.4 257.1L997.8 263.2Z","M648.6 465.2L650.8 471.5L651.2 481.3L636.9 505.2L618.3 512.3L615.7 508.4L617.6 497.5L627.0 478.0L648.6 465.2Z","M849.9 401.1L847.8 376.9L856.2 354.5L861.2 363.9L861.1 379.2L849.9 401.1Z","M494.2 46.9L481.8 75.9L497.8 106.3L494.0 121.1L518.4 150.8L492.6 154.6L485.4 176.5L486.3 205.6L465.4 227.5L464.8 259.5L456.4 308.6L453.2 297.1L428.4 311.6L419.8 292.0L404.3 290.1L393.4 279.9L367.5 291.4L359.5 275.9L345.3 277.6L327.3 273.9L324.0 230.9L313.1 222.0L302.7 194.5L299.6 166.4L302.2 136.7L315.1 115.3L318.7 136.8L333.6 154.9L347.7 148.4L361.6 150.7L374.3 134.5L384.7 131.7L405.4 140.7L423.1 133.8L434.3 89.2L442.7 78.0L450.2 41.5L475.3 41.5L494.2 46.9Z","M744.5 269.7L768.4 279.1L776.4 303.6L758.0 290.4L739.8 287.7L727.5 289.8L712.4 288.7L717.6 271.0L744.5 269.7Z","M690.1 301.4L675.0 295.5L670.8 281.7L692.8 280.2L698.2 290.8L690.1 301.4Z","M713.1 110.0L714.7 127.5L727.6 130.3L729.6 143.4L728.5 171.5L717.2 168.3L713.9 187.8L722.9 204.8L716.8 208.6L708.0 188.3L701.5 147.3L705.9 121.6L713.1 110.0Z","M604.1 151.7L629.1 150.3L650.7 127.0L654.5 134.2L637.0 166.0L620.6 172.2L599.6 165.9L563.3 167.5L544.3 172.1L541.2 196.4L560.7 225.0L572.5 210.4L613.1 199.5L611.3 214.3L601.8 209.6L592.3 228.4L573.2 240.9L593.8 282.0L589.8 293.0L609.4 330.1L609.2 351.2L597.6 360.6L589.0 349.3L599.6 323.0L578.2 335.5L572.8 326.6L575.6 314.2L559.9 295.4L561.5 264.1L547.0 273.9L548.8 311.3L549.7 357.2L535.9 361.9L526.5 352.4L532.8 322.9L529.4 291.9L520.2 291.7L513.5 269.7L522.5 248.7L525.6 223.2L536.5 174.8L541.1 161.6L559.6 137.7L576.6 147.2L604.1 151.7Z","M546.7 509.0L517.8 486.6L538.1 480.2L549.6 490.0L557.2 499.8L555.9 508.4L546.7 509.0Z","M569.5 453.8L584.0 451.3L603.6 439.6L600.4 457.4L567.6 466.5L538.7 462.6L538.6 450.8L555.9 444.1L569.5 453.8Z","M502.4 448.2L515.9 445.6L521.3 459.2L481.0 470.0L469.3 469.7L476.8 451.2L488.7 451.0L494.6 439.6L502.4 448.2Z","M289.5 385.9L292.5 397.3L334.2 400.5L339.0 387.3L379.4 402.7L387.3 423.5L420.0 429.4L446.7 448.4L421.9 460.7L397.9 447.7L378.2 448.6L355.6 446.2L335.2 440.5L310.0 428.2L294.0 425.0L284.9 429.1L245.2 415.8L241.4 402.0L221.5 399.7L236.4 369.0L262.9 370.9L280.4 383.4L289.5 385.9Z","M199.8 214.6L203.5 237.0L211.1 254.9L227.1 257.7L237.7 278.0L232.2 318.0L231.3 367.6L207.2 368.3L188.8 341.4L160.9 315.2L151.6 295.8L135.1 269.6L124.2 245.6L107.7 200.6L88.5 173.9L82.1 146.3L74.1 121.2L54.5 101.0L43.1 73.5L26.7 55.6L3.9 20.2L2.0 3.9L16.1 5.2L49.8 11.4L69.0 42.7L85.9 64.5L97.9 77.9L118.5 112.4L140.7 112.9L159.0 134.9L171.6 161.7L188.2 176.4L179.5 202.6L192.0 213.8L199.8 214.6Z"];
const mapRegionPoints={
 'NORTHERN SUMATERA':[70,112],'CENTRAL SUMATERA':[125,202],'SOUTHERN SUMATERA':[172,315],'SUMATERA':[128,220],
 'INNER JAKARTA':[248,385],'OUTER JAKARTA':[258,390],'JAKARTA RAYA':[266,393],'WEST JAVA':[292,407],
 'CENTRAL JAVA':[340,414],'JAVA':[365,424],'EAST JAVA':[400,430],'BALI NUSRA':[490,454],
 'KALIMANTAN':[423,180],'SULAWESI':[565,246],'MAPA':[890,325],'KALISUMAPA':[600,295]
};
const mapCirclePoints={'SUMATERA':[128,220],'JAKARTA RAYA':[266,393],'JAVA':[365,424],'KALISUMAPA':[600,295]};
function regionForMapValue(field,value,regionCounts){
 if(field==='REGION')return value;
 if(field==='CIRCLE')return ({'SUMATERA':'SUMATERA','JAKARTA RAYA':'JAKARTA RAYA','JAVA':'JAVA','KALISUMAPA':'KALISUMAPA'})[value]||'';
 const choices=regionCounts[value]||{};return Object.keys(choices).sort((a,b)=>choices[b]-choices[a])[0]||'';
}
function indonesiaMapSvg(vals,field,counts,regionCounts){
 const landMarkup=indonesiaOutlinePaths.map(d=>`<path class="id-land" d="${d}"/>`).join('');
 const offsets={};
 const dots=vals.slice(0,field==='KABUPATEN'?80:field==='BRANCH'?50:vals.length).map((v,i)=>{
  const reg=regionForMapValue(field,v,regionCounts),base=field==='CIRCLE'?mapCirclePoints[v]:mapRegionPoints[reg];
  if(!base)return '';
  const n=offsets[reg]||0;offsets[reg]=n+1;
  const angle=n*2.399963,rad=n===0?0:Math.min(28,5+Math.sqrt(n)*5);
  const x=base[0]+Math.cos(angle)*rad,y=base[1]+Math.sin(angle)*rad;
  const count=counts[v]||1, color=/SULAWESI/i.test(reg)?'#ffb329':/JAVA|JAKARTA|BALI/i.test(reg)?'#13c8ed':'#14d6aa';
  const sparkCount=Math.max(3,Math.min(9,Math.round(Math.log10(count+1)*2)));
  const sparks=Array.from({length:sparkCount},(_,j)=>{const a=j*2.399963,rr=8+(j%3)*5;return `<circle class="map-spark" cx="${(x+Math.cos(a)*rr).toFixed(1)}" cy="${(y+Math.sin(a)*rr).toFixed(1)}" r="1.4" fill="${color}" opacity=".7"/>`}).join('');
  const radius=Math.max(3.5,Math.min(6.5,3+Math.log10(count+1)*.65));
  return `<g class="id-marker" tabindex="0" role="img" aria-label="${esc(v)}: ${count.toLocaleString()} records"><title>${esc(v)} · ${count.toLocaleString()} records</title>${sparks}<circle class="id-marker-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius+5).toFixed(1)}" style="--marker-color:${color}"/><circle class="id-marker-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" style="--marker-color:${color}"/></g>`;
 }).join('');
 const groups=[
  {name:'KALIMANTAN',match:r=>/KALIMANTAN/i.test(r.REGION),x:363,y:68,color:'#16d6a4'},
  {name:'SULAWESI',match:r=>/SULAWESI/i.test(r.REGION),x:615,y:225,color:'#ffb329'},
  {name:'SUMATERA',match:r=>/SUMATERA/i.test(r.REGION),x:48,y:332,color:'#00c6f4'},
  {name:'JAWA & BALI',match:r=>/JAVA|JAKARTA|BALI NUSRA/i.test(r.REGION),x:330,y:505,color:'#168fe5'}
 ];
 const cards=groups.map(g=>{
  const subset=rows.filter(g.match),branches=new Set(subset.map(r=>String(r.BRANCH||'').trim()).filter(Boolean)).size;
  const rate=avg(subset.map(r=>Number(r['TCP Connection Success Rate (Included RST)(%)'])).filter(Number.isFinite));
  const width=g.name==='JAWA & BALI'?166:148;
  return `<g class="map-region-card"><rect x="${g.x}" y="${g.y}" width="${width}" height="62" rx="10"/><circle cx="${g.x+13}" cy="${g.y+15}" r="4" fill="${g.color}"/><text class="map-card-title" x="${g.x+24}" y="${g.y+18}">${g.name}</text><text class="map-card-detail" x="${g.x+12}" y="${g.y+36}">${branches.toLocaleString()} Branch</text><text class="map-card-rate" x="${g.x+12}" y="${g.y+51}">● ${Number.isFinite(rate)?rate.toFixed(1):'—'}%</text></g>`;
 }).join('');
 const routes=[[70,112,390,378],[239,248,447,238],[390,378,594,284],[447,238,594,284],[594,284,735,300],[390,378,592,398]];
 const routeMarkup=routes.map(([x1,y1,x2,y2])=>`<path d="M${x1} ${y1} Q${(x1+x2)/2} ${(y1+y2)/2-35} ${x2} ${y2}"/>`).join('');
 return `<div class="map-stage"><svg class="indonesia-map-svg" viewBox="0 0 1000 620" role="img" aria-label="Peta jaringan Indonesia">
 <defs><linearGradient id="landGradient" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#114968"/><stop offset=".55" stop-color="#0a3450"/><stop offset="1" stop-color="#071f35"/></linearGradient><radialGradient id="hubGlow"><stop stop-color="#fff5a0" stop-opacity=".95"/><stop offset=".28" stop-color="#18ddb3" stop-opacity=".85"/><stop offset="1" stop-color="#00c6f4" stop-opacity="0"/></radialGradient><filter id="landGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
 <g class="map-graticule"><path d="M70 130H940M55 250H950M70 370H940M180 90V440M400 80V450M620 80V450M840 100V440"/></g>
 <g class="map-geography" transform="translate(75 54) scale(.82 .82)"><g class="map-islands" filter="url(#landGlow)">${landMarkup}</g><g class="map-routes">${routeMarkup}</g>${dots}<circle class="map-hotspot" cx="624" cy="272" r="33" fill="url(#hubGlow)"/><circle class="map-hotspot" cx="403" cy="392" r="24" fill="url(#hubGlow)"/></g>
 ${cards}
 </svg><div class="map-zoom-controls"><button type="button" data-zoom="in" aria-label="Perbesar peta">+</button><button type="button" data-zoom="out" aria-label="Perkecil peta">−</button></div></div>`;
}function regionGroup(value){
 const v=String(value||'').toUpperCase();
 if(/SUMATERA/.test(v))return 'Sumatera';
 if(/JAVA|JAKARTA/.test(v))return 'Jawa';
 if(/KALIMANTAN/.test(v))return 'Kalimantan';
 if(/SULAWESI/.test(v))return 'Sulawesi';
 if(/BALI NUSRA/.test(v))return 'Bali & Nusa Tenggara';
 if(/MAPA|PAPUA/.test(v))return 'Papua';
 return '';
}
const regionMeta=[
 {name:'Sumatera',color:'#168fff',x:135,y:235,labelX:48,labelY:64},
 {name:'Jawa',color:'#168fff',x:392,y:405,labelX:78,labelY:387},
 {name:'Kalimantan',color:'#13c8b0',x:435,y:200,labelX:246,labelY:67},
 {name:'Sulawesi',color:'#168fff',x:592,y:267,labelX:516,labelY:74},
 {name:'Bali & Nusa Tenggara',color:'#8de7bb',x:550,y:410,labelX:374,labelY:397},
 {name:'Papua',color:'#13c8b0',x:880,y:292,labelX:804,labelY:110}
];
const regionMetricTitles={'Total Traffic(Byte)':'Total Traffic','Downlink TCP Retransmission Rate(%)':'DL TCP Retransmission','Uplink TCP Retransmission Rate(%)':'UL TCP Retransmission','TCP Connection Success Rate (Included RST)(%)':'TCP Success Rate','Downlink TCP Packet Loss Rate(%)':'DL Packet Loss','Uplink TCP Packet Loss Rate(%)':'UL Packet Loss','E2E Delay(ms)':'E2E Delay','SYN ACK-ACK Delay(ms)':'SYN ACK-ACK Delay','SYN-SYN ACK Delay(ms)':'SYN-SYN ACK Delay'};
function dateShift(day,amount){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10)}
function regionDateStats(from,to,key){
 const result=Object.fromEntries(regionMeta.map(x=>[x.name,{value:0,count:0}]));
 rows.forEach(r=>{const day=isoDate(r.dt);if(day<from||day>to)return;const g=regionGroup(r.REGION);if(!g||!result[g])return;const val=metricValue(r,key);if(Number.isFinite(val)){result[g].value+=val;result[g].count++}});
 Object.values(result).forEach(x=>{if(key!=='Total Traffic(Byte)'&&x.count)x.value/=x.count});return result;
}
function renderMap(){
 const dates=[...new Set(rows.map(r=>isoDate(r.dt)))].sort();if(!dates.length)return;
 const fromEl=document.getElementById('regionFrom'),toEl=document.getElementById('regionTo'),metric=document.getElementById('regionMetric').value;
 if(!fromEl.value)fromEl.value=dates.at(-1);if(!toEl.value)toEl.value=dates.at(-1);
 if(fromEl.value>toEl.value){const swap=fromEl.value;fromEl.value=toEl.value;toEl.value=swap}
 const from=fromEl.value,to=toEl.value,days=Math.max(1,Math.round((new Date(`${to}T00:00:00Z`)-new Date(`${from}T00:00:00Z`))/86400000)+1),previousTo=dateShift(from,-1),previousFrom=dateShift(previousTo,-days);
 const current=regionDateStats(from,to,metric),prior=regionDateStats(previousFrom,previousTo,metric),metricTitle=regionMetricTitles[metric]||metric,unit=metric==='Total Traffic(Byte)'?'TB':metric.includes('(%)')?'%':'ms';
 const pretty=d=>fmtDate(new Date(`${d}T00:00:00`));
 document.getElementById('regionDateCaption').textContent=`${pretty(from)} — ${pretty(to)} · Compare ${pretty(previousFrom)} — ${pretty(previousTo)}`;
 document.getElementById('regionValueHeader').textContent=`${metricTitle} (${unit})`;
 document.getElementById('comparisonCaption').textContent=`${pretty(from)} — ${pretty(to)} vs ${pretty(previousFrom)} — ${pretty(previousTo)}`;
 const fmtValue=v=>metric==='Total Traffic(Byte)'?v.toLocaleString('en-US',{maximumFractionDigits:2}):v.toLocaleString('en-US',{maximumFractionDigits:metric.includes('(%)')?2:1});
 const periodRows=rows.filter(r=>{const day=isoDate(r.dt);return day>=from&&day<=to}),branches=new Set(periodRows.map(r=>String(r.BRANCH||'').trim()).filter(Boolean)),districts=new Set(periodRows.map(r=>String(r.KABUPATEN||'').trim()).filter(Boolean)),activeRegions=new Set(periodRows.map(r=>regionGroup(r.REGION)).filter(Boolean)),overall=metric==='Total Traffic(Byte)'?periodRows.reduce((sum,r)=>sum+metricValue(r,metric),0):avg(periodRows.map(r=>metricValue(r,metric)).filter(Number.isFinite));
 document.getElementById('regionMapKpis').innerHTML=`<div class="network-map-kpi"><span>Selected KQI · ${metricTitle}</span><strong>${fmtValue(overall)} ${unit}</strong><small>${periodRows.length.toLocaleString()} records</small></div><div class="network-map-kpi"><span>Active Branches</span><strong>${branches.size.toLocaleString()}</strong><small>in selected period</small></div><div class="network-map-kpi"><span>Kabupaten</span><strong>${districts.size.toLocaleString()}</strong><small>with source records</small></div><div class="network-map-kpi"><span>Regions Reporting</span><strong>${activeRegions.size} / ${regionMeta.length}</strong><small>of 6 macro regions</small></div>`;
 document.getElementById('regionSummaryBody').innerHTML=regionMeta.map(g=>{const value=current[g.name].value,old=prior[g.name].value,has=current[g.name].count>0,pct=old?((value-old)/Math.abs(old))*100:0,up=pct>=0;return `<tr><td><i class="region-dot" style="--region-color:${g.color}"></i>${g.name}</td><td>${has?fmtValue(value):'—'}</td><td class="trend ${up?'up':'down'}">${has&&prior[g.name].count?`${up?'▲':'▼'} ${Math.abs(pct).toFixed(1)}%`:'—'}</td></tr>`}).join('');
 document.getElementById('networkSiteBody').innerHTML=regionMeta.map(g=>{const part=periodRows.filter(r=>regionGroup(r.REGION)===g.name),b=new Set(part.map(r=>String(r.BRANCH||'').trim()).filter(Boolean)),k=new Set(part.map(r=>String(r.KABUPATEN||'').trim()).filter(Boolean));return `<tr><td><i class="region-dot" style="--region-color:${g.color}"></i>${g.name}</td><td>${b.size.toLocaleString()}</td><td>${k.size.toLocaleString()}</td></tr>`}).join('');
 const land=indonesiaOutlinePaths.map(d=>`<path class="id-land" d="${d}"/>`).join('');
 const currentMax=Math.max(0,...regionMeta.map(g=>current[g.name].value));
 const bubbles=regionMeta.map(g=>{const v=current[g.name].value,has=current[g.name].count>0,label=g.name,w=label.length>15?178:label.length>10?148:112,scale=has&&currentMax?Math.sqrt(Math.max(v,0)/currentMax):0,pct=prior[g.name].value?((v-prior[g.name].value)/Math.abs(prior[g.name].value))*100:0;return `<g class="traffic-pin"><circle class="traffic-pulse" cx="${g.x}" cy="${g.y}" r="${has?11+13*scale:8}" style="--region-color:${g.color}"/><circle cx="${g.x}" cy="${g.y}" r="${has?4+3*scale:3}" fill="${g.color}"/><path class="pin-stem" d="M${g.x} ${g.y-15} L${g.labelX+12} ${g.labelY+44}"/><rect x="${g.labelX}" y="${g.labelY}" width="${w}" height="47" rx="8"/><text class="pin-title" x="${g.labelX+10}" y="${g.labelY+17}">${label}</text><text class="pin-value" x="${g.labelX+10}" y="${g.labelY+34}">${has?`${fmtValue(v)} ${unit} · ${prior[g.name].count?(pct>=0?'▲':'▼')+Math.abs(pct).toFixed(1)+'%':'—'}`:'Tidak ada data'}</text></g>`}).join('');
 document.getElementById('topologyCanvas').innerHTML=`<svg class="region-map-svg" viewBox="0 0 1000 520" role="img" aria-label="Peta KQI ${metricTitle} Indonesia"><defs><linearGradient id="regionLand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12648a"/><stop offset="1" stop-color="#073351"/></linearGradient><filter id="regionGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g class="region-grid"><path d="M30 130H970M30 260H970M30 390H970M200 35V490M400 35V490M600 35V490M800 35V490"/></g><g class="region-map-land" transform="translate(16 0) scale(.96 1)">${land}</g><g class="region-map-routes"><path d="M135 235 Q265 350 392 405 T550 410 M435 200 Q520 205 592 267 T880 292"/></g>${bubbles}</svg>`;
 const labels=regionMeta.map(x=>x.name),valuesA=labels.map(x=>prior[x].count?prior[x].value:null),valuesB=labels.map(x=>current[x].count?current[x].value:null);
 document.getElementById('regionChartLegend').innerHTML=`<span><i class="legend-swatch old"></i>${pretty(previousFrom)} — ${pretty(previousTo)}</span><span><i class="legend-swatch new"></i>${pretty(from)} — ${pretty(to)}</span>`;
 if(charts.regionComparison)charts.regionComparison.destroy();
 charts.regionComparison=new Chart(document.getElementById('regionComparisonChart'),{type:'bar',data:{labels,datasets:[{label:`${pretty(previousFrom)} — ${pretty(previousTo)}`,data:valuesA,backgroundColor:'#718ba8',borderRadius:3,barPercentage:.78,categoryPercentage:.68},{label:`${pretty(from)} — ${pretty(to)}`,data:valuesB,backgroundColor:'#168fff',borderRadius:3,barPercentage:.78,categoryPercentage:.68}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw===null?'Tidak ada data':fmtValue(c.raw)+' '+unit}`}}},scales:{x:{ticks:{color:'#91b6d3',maxRotation:0,minRotation:0,font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#7299ba',maxTicksLimit:5},grid:{color:'rgba(41,94,130,.22)'}}}}});
}function download(){const blob=new Blob([Papa.unparse(filtered())],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sqm_filtered_data.csv';a.click();URL.revokeObjectURL(a.href)}
function loadCsvFiles(){
 return fetch(`data/manifest.json?v=${Date.now()}`,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`Manifest CSV tidak dapat dimuat: HTTP ${response.status}`);return response.json()}).then(manifest=>{
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('Daftar files di data/manifest.json kosong.');
  return Promise.all(manifest.files.map(file=>new Promise((resolve,reject)=>{
   const safeName=String(file||'').trim();if(!safeName||safeName.includes('..')||safeName.includes('/')||safeName.includes('\\')){reject(new Error(`Nama file CSV tidak valid: ${safeName}`));return}
   Papa.parse(`data/${encodeURIComponent(safeName)}?v=${Date.now()}`,{download:true,header:true,skipEmptyLines:true,dynamicTyping:true,complete:result=>{
    if(result.errors.length){reject(new Error(`Gagal membaca ${safeName}: ${result.errors[0].message}`));return}
    if(!result.meta.fields?.includes('15 Minutes')){reject(new Error(`Header 15 Minutes tidak ditemukan pada ${safeName}.`));return}
    resolve({file:safeName,headers:result.meta.fields,data:result.data.filter(row=>row['15 Minutes'])});
   },error:error=>reject(new Error(`Gagal mengunduh ${safeName}: ${error.message||error}`))});
  }))).then(parts=>{
   const expected=parts[0].headers.join('\u001f');const mismatch=parts.find(part=>part.headers.join('\u001f')!==expected);
   if(mismatch)throw new Error(`Header ${mismatch.file} berbeda dari file CSV pertama.`);
   return parts.flatMap(part=>part.data);
  });
 });
}
function initializeDashboard(data){
 rows=data.map(r=>({...r,dt:parseDate(String(r['15 Minutes']))})).filter(r=>Number.isFinite(r.dt.getTime())).sort((a,b)=>a.dt-b.dt);
 if(!rows.length)throw new Error('Semua file CSV kosong atau tidak berisi tanggal yang valid.');
 setupFilters();update();initNav();renderTable(rows,'dataBody','dataHead',1000);
 const regionDates=[...new Set(rows.map(r=>isoDate(r.dt)))].sort(),regionFrom=document.getElementById('regionFrom'),regionTo=document.getElementById('regionTo');
 regionFrom.min=regionTo.min=regionDates[0];regionFrom.max=regionTo.max=regionDates.at(-1);regionFrom.value=regionTo.value=regionDates.at(-1);
 ['regionFrom','regionTo','regionMetric'].forEach(id=>document.getElementById(id).addEventListener('change',renderMap));
 downloadCsv.onclick=download;downloadCsv2.onclick=download;
 dataSearch.oninput=()=>{const q=dataSearch.value.toLowerCase();renderTable(rows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))),'dataBody','dataHead',1000)};
 setInterval(()=>{clock.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})},1000);
}
loadCsvFiles().then(initializeDashboard).catch(error=>{console.error('CSV ERROR:',error);document.getElementById('regionDateCaption').textContent=`Gagal memuat data: ${error.message}`;});









