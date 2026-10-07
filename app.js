const CSV_PATH='data/raw_data.csv';
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
const mapRegionPoints={
 'NORTHERN SUMATERA':[205,177],'CENTRAL SUMATERA':[239,248],'SOUTHERN SUMATERA':[270,308],'SUMATERA':[238,275],
 'INNER JAKARTA':[350,365],'OUTER JAKARTA':[372,365],'JAKARTA RAYA':[393,378],'WEST JAVA':[419,385],
 'CENTRAL JAVA':[462,379],'JAVA':[488,397],'EAST JAVA':[523,389],'BALI NUSRA':[592,398],
 'KALIMANTAN':[447,238],'SULAWESI':[594,284],'MAPA':[735,300],'KALISUMAPA':[640,290]
};
const mapCirclePoints={'SUMATERA':[238,263],'JAKARTA RAYA':[390,378],'JAVA':[485,391],'KALISUMAPA':[628,284]};
function regionForMapValue(field,value,regionCounts){
 if(field==='REGION')return value;
 if(field==='CIRCLE')return ({'SUMATERA':'SUMATERA','JAKARTA RAYA':'JAKARTA RAYA','JAVA':'JAVA','KALISUMAPA':'KALISUMAPA'})[value]||'';
 const choices=regionCounts[value]||{};return Object.keys(choices).sort((a,b)=>choices[b]-choices[a])[0]||'';
}
function indonesiaMapSvg(vals,field,counts,regionCounts){
 const positions={},offsets={};
 const dots=vals.slice(0,field==='KABUPATEN'?80:field==='BRANCH'?50:vals.length).map((v,i)=>{
  const reg=regionForMapValue(field,v,regionCounts),base=field==='CIRCLE'?mapCirclePoints[v]:mapRegionPoints[reg];
  if(!base)return '';
  const n=offsets[reg]||0;offsets[reg]=n+1;
  const angle=n*2.399963,rad=n===0?0:Math.min(25,5+Math.sqrt(n)*5);
  const x=base[0]+Math.cos(angle)*rad,y=base[1]+Math.sin(angle)*rad;
  positions[v]=[x,y];
  const label=field==='REGION'||field==='CIRCLE';
  const short=v.replace('NORTHERN ','N. ').replace('SOUTHERN ','S. ').replace('CENTRAL ','C. ').replace('EAST ','E. ').replace('WEST ','W. ').replace('JAKARTA','JKT');
  const anchor=x>690?'end':'start',dx=x>690?-9:9,dy=(i%2?13:-9);
  const radius=Math.max(4,Math.min(8,4+Math.log10((counts[v]||1)+1)));
  return `<g class="id-marker" tabindex="0" role="img" aria-label="${esc(v)}: ${(counts[v]||0).toLocaleString()} records"><title>${esc(v)} · ${(counts[v]||0).toLocaleString()} records</title><circle class="id-marker-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius+5).toFixed(1)}"/><circle class="id-marker-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}"/>${label?`<text class="id-marker-label" x="${(x+dx).toFixed(1)}" y="${(y+dy).toFixed(1)}" text-anchor="${anchor}">${esc(short)}</text>`:''}</g>`;
 }).join('');
 const routes=[[205,177,390,378],[239,248,447,238],[390,378,594,284],[447,238,594,284],[594,284,735,300],[390,378,592,398]];
 return `<svg class="indonesia-map-svg" viewBox="0 0 1000 520" role="img" aria-label="Peta jaringan Indonesia">
 <defs><linearGradient id="landGradient" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#145275"/><stop offset="1" stop-color="#09283f"/></linearGradient><filter id="landGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
 <g class="map-graticule"><path d="M70 130H940M55 250H950M70 370H940M180 90V440M400 80V450M620 80V450M840 100V440"/></g>
 <g class="map-islands" filter="url(#landGlow)">
 <path class="id-land" d="M194 113 211 117 221 135 216 153 205 171 202 191 192 210 195 229 207 247 210 266 222 286 228 307 241 329 250 351 247 372 236 391 222 386 212 369 201 349 190 331 180 310 171 289 162 269 151 251 143 233 150 214 146 197 157 181 161 162 170 144 179 126Z"/>
 <path class="id-land" d="M398 176 418 158 443 153 465 160 483 176 486 195 501 211 493 228 480 243 477 263 462 283 445 292 428 282 416 264 407 245 398 226 404 207 390 192Z"/>
 <path class="id-land" d="M280 382 306 377 333 382 359 379 384 385 411 381 437 386 461 387 477 395 462 403 434 402 407 408 379 404 351 410 324 403 298 405 278 397Z"/>
 <path class="id-land" d="M535 216 550 204 564 210 571 226 588 225 601 211 616 208 624 218 613 232 599 242 610 252 632 252 646 263 642 275 624 276 607 265 591 271 582 288 574 307 561 316 552 310 556 292 567 276 566 262 551 258 535 264 523 255 531 242 550 237 557 228Z"/>
 <path class="id-land" d="M741 246 760 232 782 229 803 233 820 226 843 229 866 222 889 230 911 240 924 255 918 272 928 286 917 302 900 310 887 324 864 320 845 328 824 320 803 326 784 316 764 319 750 304 744 285 735 271Z"/>
 <path class="id-land small-island" d="M480 396 488 393 494 397 491 402 484 402Z"/><path class="id-land small-island" d="M505 400 514 398 519 402 513 405 506 404Z"/><path class="id-land small-island" d="M530 405 538 402 544 405 539 409 532 409Z"/><path class="id-land small-island" d="M552 409 560 406 567 410 561 414 554 413Z"/><path class="id-land small-island" d="M579 412 586 409 593 413 588 417 581 416Z"/><path class="id-land small-island" d="M666 291 671 287 676 291 673 297 668 296Z"/><path class="id-land small-island" d="M686 310 691 306 696 310 693 316 688 315Z"/><path class="id-land small-island" d="M707 282 712 278 717 282 713 287 708 287Z"/>
 </g>
 <g class="map-routes">${routes.map(([x1,y1,x2,y2])=>`<path d="M${x1} ${y1} Q${(x1+x2)/2} ${(y1+y2)/2-35} ${x2} ${y2}"/>`).join('')}</g>
 <text class="map-sea-label" x="480" y="130">INDONESIA NETWORK</text>${dots}
 <g class="map-compass" transform="translate(930 85)"><path d="M0 18 7 0 14 18 7 14Z"/><text x="7" y="31" text-anchor="middle">N</text></g>
 </svg><div class="map-key"><span><i></i> Active data location</span><span>Hover titik untuk melihat jumlah rekaman</span></div>`;
}
function renderMap(){
 const term=(mapSearch.value||'').toLowerCase(),field=activeMap==='region'?'REGION':activeMap==='circle'?'CIRCLE':activeMap==='branch'?'BRANCH':'KABUPATEN';
 const vals=unique(field).filter(v=>String(v).toLowerCase().includes(term)).slice(0,40),counts={},regionCounts={};
 rows.forEach(r=>{const value=r[field];if(!value)return;counts[value]=(counts[value]||0)+1;if(!regionCounts[value])regionCounts[value]={};regionCounts[value][r.REGION]=(regionCounts[value][r.REGION]||0)+1});
 mapList.innerHTML=vals.map(v=>`<div class="map-item"><b>${esc(v)}</b><span>${(counts[v]||0).toLocaleString()}</span></div>`).join('');
 const regs=unique('REGION');regionPerformance.innerHTML=regs.map(v=>{const a=rows.filter(r=>r.REGION===v),perf=avg(a.map(r=>Number(r['TCP Connection Success Rate (Included RST)(%)'])));return `<div class="perf"><span>${esc(v)}</span><b>${perf.toFixed(1)}%</b><div class="bar"><i style="width:${Math.min(100,perf)}%"></i></div></div>`}).join('');
 topologyCanvas.innerHTML=indonesiaMapSvg(vals,field,counts,regionCounts);
}function download(){const blob=new Blob([Papa.unparse(filtered())],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sqm_filtered_data.csv';a.click();URL.revokeObjectURL(a.href)}
function initNav(){document.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const view=btn.dataset.view;document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));document.getElementById(view+'View').classList.add('active-view');if(view==='map')renderMap();if(view==='data'){renderTable(rows,'dataBody','dataHead',1000);dataCount.textContent=rows.length.toLocaleString()+' records'}})}
Papa.parse(CSV_PATH+"?v="+Date.now(),{download:true,header:true,skipEmptyLines:true,dynamicTyping:true,complete:res=>{rows=res.data.filter(r=>r['15 Minutes']).map(r=>({...r,dt:parseDate(String(r['15 Minutes']))})).sort((a,b)=>a.dt-b.dt);setupFilters();update();initNav();renderTable(rows,'dataBody','dataHead',1000);mapSearch.oninput=renderMap;document.querySelectorAll('.map-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.map-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeMap=b.dataset.map;renderMap()});downloadCsv.onclick=download;downloadCsv2.onclick=download;dataSearch.oninput=()=>{const q=dataSearch.value.toLowerCase();renderTable(rows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))),'dataBody','dataHead',1000)};setInterval(()=>{clock.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})},1000);}});





