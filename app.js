let rows=[], datasets={wilayah:[],sgw:[]}, dataMode='wilayah', charts={}, activeMap='region';
let sourceInitialized=false, pendingUpload=null;
let datasetInfo={wilayah:null,sgw:null};
let activeCurrentWindow=null, activeCompareWindow=null;
const specs=[
 {key:'traffic',title:'Total Traffic',unit:'AUTO',color:'#00BFFF',icon:'◉',source:'Total Traffic(Byte)',format:v=>formatTrafficValue(v)},
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
function parseDate(value,mode=dataMode){
 const s=String(value??'').trim();if(!s)return new Date(NaN);
 // Supabase returns ISO timestamps with a timezone; preserve the actual instant.
 if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(?:Z|[+-][0-9]{2}:?[0-9]{2})$/i.test(s))return new Date(s);
 const iso=s.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:[ T]([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?)?/);
 if(iso)return new Date(+iso[1],+iso[2]-1,+iso[3],+(iso[4]||0),+(iso[5]||0),+(iso[6]||0));
 // CSV date convention: MM/DD/YY HH:mm. Two-digit years 00-99 map to 2000-2099.
 // Four-digit MM/D/YYYY is also accepted for compatibility with existing source files.
 const m=s.match(/^([0-9]{1,2})[\\/.-]([0-9]{1,2})[\\/.-]([0-9]{2}|[0-9]{4})(?:[ T]([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?)?$/);
 if(!m)return new Date(NaN);
 const month=+m[1],day=+m[2],yearText=m[3],year=yearText.length===2?2000+Number(yearText):Number(yearText),hour=+(m[4]||0),minute=+(m[5]||0),second=+(m[6]||0);
 const parsed=new Date(year,month-1,day,hour,minute,second);
 if(month<1||month>12||day<1||day>31||parsed.getFullYear()!==year||parsed.getMonth()!==month-1||parsed.getDate()!==day||hour>23||minute>59||second>59)return new Date(NaN);
 return parsed;
}
function isoDate(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtDate(d){return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
function metricValue(r,key){const raw=r?.[key];if(raw===null||raw===undefined||String(raw).trim()==='')return null;const v=Number(raw);return Number.isFinite(v)?v:null}
function formatTrafficValue(value){const n=Math.max(0,Number(value)||0);return n.toLocaleString('en-US',{maximumFractionDigits:5})+' TB';}
function setTrafficPresentation(){const s=specs[0];s.unit='TB';s.format=formatTrafficValue;const opt=document.querySelector('#regionMetric option[value="Total Traffic(Byte)"]');if(opt)opt.textContent='Total Traffic (TB)';}
const circleNames=new Set(['JAKARTA RAYA','JAVA','KALISUMAPA','SUMATERA']);
function normalizeLocationHierarchy(data){
 const distinct=field=>new Set(data.map(row=>String(row[field]||'').trim()).filter(Boolean)).size;
 const circleShare=data.length?data.filter(row=>circleNames.has(String(row.CIRCLE||'').trim().toUpperCase())).length/data.length:0;
 const regionCount=distinct('REGION'),branchCount=distinct('BRANCH'),kabupatenCount=distinct('KABUPATEN');
 // raw_data_1 uses the right Circle but stores Region/Branch/Kabupaten values under different headers.
 if(circleShare>.98&&kabupatenCount<=20&&regionCount>kabupatenCount&&branchCount>regionCount){
  return data.map(row=>({...row,REGION:row.KABUPATEN,BRANCH:row.REGION,KABUPATEN:row.BRANCH}));
 }
 // Some rows in raw_data.csv rotate the four location values by one column.
 return data.map(row=>{
  const currentCircle=String(row.CIRCLE||'').trim().toUpperCase();
  const shiftedCircle=String(row.REGION||'').trim().toUpperCase();
  return !circleNames.has(currentCircle)&&circleNames.has(shiftedCircle)
   ?{...row,CIRCLE:row.REGION,REGION:row.BRANCH,BRANCH:row.KABUPATEN,KABUPATEN:row.CIRCLE}
   :row;
 });
}
function unique(field){return [...new Set(rows.map(r=>String(r[field]??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function fillSelect(id,vals){const el=document.getElementById(id),old=el.value;el.innerHTML='<option value="ALL">All '+(id==='region'?'Region':id==='circle'?'Circle':id==='branch'?'Branch':'Kabupaten')+'</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');el.value=vals.includes(old)?old:'ALL';}
function refreshFilterPickers(){document.querySelectorAll('.filter-picker').forEach(picker=>picker._syncOptions?.())}
function enhanceLocationFilters(){
 ['circle','region','branch','kabupaten'].forEach(id=>{
  const select=document.getElementById(id),label=select.closest('label'),picker=document.createElement('div');
  picker.className='filter-picker';picker.innerHTML='<input type="text" autocomplete="off" aria-haspopup="listbox"><button type="button" class="filter-picker-toggle" aria-label="Buka pilihan">⌄</button><div class="filter-picker-menu" role="listbox"></div>';
  const input=picker.querySelector('input'),toggle=picker.querySelector('button'),menu=picker.querySelector('.filter-picker-menu');
  select.classList.add('filter-native-hidden');select.insertAdjacentElement('afterend',picker);
  const close=()=>{picker.classList.remove('open');input.setAttribute('aria-expanded','false')};
  const sync=()=>{input.value=select.options[select.selectedIndex]?.text||'';menu.replaceChildren();[...select.options].forEach(option=>{const item=document.createElement('button');item.type='button';item.className='filter-picker-option';item.setAttribute('role','option');item.textContent=option.text;item.dataset.value=option.value;item.addEventListener('click',()=>{select.value=option.value;input.value=option.text;close();select.dispatchEvent(new Event('change',{bubbles:true}))});menu.append(item)});filterMenu()};
  const filterMenu=()=>{const query=input.value.trim().toLocaleLowerCase();let visible=0;menu.querySelectorAll('.filter-picker-option').forEach(item=>{const match=!query||item.textContent.toLocaleLowerCase().includes(query);item.hidden=!match;if(match)visible++});menu.dataset.empty=visible?'':'true'};
  const open=()=>{picker.classList.add('open');input.setAttribute('aria-expanded','true');filterMenu()};
  input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-autocomplete','list');
  input.addEventListener('focus',()=>{input.select();open()});input.addEventListener('input',()=>{open();filterMenu()});
  input.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='Enter'){event.preventDefault();menu.querySelector('.filter-picker-option:not([hidden])')?.click()}});
  toggle.addEventListener('click',()=>picker.classList.contains('open')?close():(input.focus(),open()));
  document.addEventListener('click',event=>{if(!picker.contains(event.target))close()});
  picker._syncOptions=sync;sync();
 });
}
function setupFilters(){
 const min=rows[0].dt,max=rows[rows.length-1].dt,minDate=isoDate(min),maxDate=isoDate(max);dateFrom.value=minDate;dateTo.value=maxDate;document.getElementById('compareDateGroup').hidden=!compare.checked;document.getElementById('compareDays').value='1';circle.innerHTML='<option value="ALL">All Circle</option>'+unique('CIRCLE').map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');refreshDependent();
 ['dateFrom','dateTo','period','circle','region','branch','kabupaten','sgwFilter','compare','compareDays'].forEach(id=>{const el=document.getElementById(id);el.onchange=()=>{if(['circle','region','branch'].includes(id))refreshDependent();if(id==='compare')document.getElementById('compareDateGroup').hidden=!compare.checked;update()}});reset.onclick=()=>{dateFrom.value=minDate;dateTo.value=maxDate;period.value='15min';circle.value=region.value=branch.value=kabupaten.value='ALL';compare.checked=false;document.getElementById('compareDays').value='1';document.getElementById('compareDateGroup').hidden=true;sgwFilter.value='ALL';refreshDependent();update()};
}
function filterValue(id){return document.getElementById(id)?.value??'ALL'}
function matchesLocationFilters(row){return ['circle','region','branch','kabupaten'].every(id=>{const selected=filterValue(id);return selected==='ALL'||String(row[id.toUpperCase()]??'').trim()===selected})}
function matchesActiveFilters(row){return dataMode==='sgw'?(filterValue('sgwFilter')==='ALL'||String(row.SGW??'').trim()===filterValue('sgwFilter')):matchesLocationFilters(row)}
function refreshDependent(){
 let subset=rows.filter(x=>filterValue('circle')==='ALL'||String(x.CIRCLE??'').trim()===filterValue('circle'));
 fillSelect('region',uniqueFrom(subset,'REGION'));
 subset=subset.filter(x=>filterValue('region')==='ALL'||String(x.REGION??'').trim()===filterValue('region'));
 fillSelect('branch',uniqueFrom(subset,'BRANCH'));
 subset=subset.filter(x=>filterValue('branch')==='ALL'||String(x.BRANCH??'').trim()===filterValue('branch'));
 fillSelect('kabupaten',uniqueFrom(subset,'KABUPATEN'));
}
function uniqueFrom(arr,field){return [...new Set(arr.map(x=>String(x[field]??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function filtered(fromValue=dateFrom.value,toValue=dateTo.value){
 const from=new Date(fromValue+'T00:00:00'),to=new Date(toValue+'T23:59:59');
 return rows.filter(r=>r.dt>=from&&r.dt<=to&&matchesActiveFilters(r));
}
function bucket(r){const p=period.value;if(p==='daily')return isoDate(r.dt);if(p==='hourly'){const d=new Date(r.dt);d.setMinutes(0,0,0);return d.toISOString()}return r.dt.toISOString()}
function aggregate(data){
 const m=new Map();
 data.forEach(r=>{
  const k=bucket(r);if(!m.has(k))m.set(k,{k,n:0,__counts:{}});const x=m.get(k);x.n++;
  metricKeys.forEach(key=>{const value=metricValue(r,key);if(value===null)return;x[key]=(x[key]||0)+value;x.__counts[key]=(x.__counts[key]||0)+1});
 });
 return [...m.values()].sort((a,b)=>a.k.localeCompare(b.k)).map(x=>{
  metricKeys.forEach(key=>{const count=x.__counts[key]||0;if(!count){x[key]=null;return}if(key!=='Total Traffic(Byte)')x[key]/=count});
  return x;
 });
}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
function shiftDateByDays(date,days){const shifted=new Date(date.getTime());shifted.setDate(shifted.getDate()+days);return shifted;}
function filteredDateTime(start,end){return rows.filter(r=>r.dt>=start&&r.dt<=end&&matchesActiveFilters(r));}
function localDayNumber(value){let d;if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)){const [y,m,day]=value.slice(0,10).split('-').map(Number);d=new Date(y,m-1,day);}else d=new Date(value);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;}
function pointOffset(point,anchor,daily){if(daily)return localDayNumber(point.k)-localDayNumber(anchor);return Math.round((new Date(point.k).getTime()-new Date(anchor).getTime())/60000);}
function compareSeries(current,comparison,key){if(!current.length)return[];if(!comparison.length||!activeCurrentWindow||!activeCompareWindow)return current.map(()=>null);const daily=period.value==='daily',lookup=new Map();comparison.forEach(point=>{const offset=pointOffset(point,activeCompareWindow.start,daily);lookup.set(offset,point[key]??null)});return current.map(point=>{const offset=pointOffset(point,activeCurrentWindow.start,daily);return lookup.has(offset)?lookup.get(offset):null;});}
function compareLastValue(current,comparison,key){if(!current.length||!comparison.length||!activeCurrentWindow||!activeCompareWindow)return null;const daily=period.value==='daily',last=current[current.length-1],target=pointOffset(last,activeCurrentWindow.start,daily),match=comparison.find(point=>pointOffset(point,activeCompareWindow.start,daily)===target);return match&&match[key]!=null?Number(match[key]):null;}
function compareRangeLabel(){if(!activeCompareWindow)return'Compare';const fmt=d=>d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});const days=Number(document.getElementById('compareDays')?.value||1);return `Compare D-${days} (${fmt(activeCompareWindow.start)} – ${fmt(activeCompareWindow.end)})`;}
function drawChart(spec,cur,cmp){const ctx=document.getElementById('ch_'+spec.key).getContext('2d');if(charts[spec.key])charts[spec.key].destroy();const labels=cur.map(x=>new Date(x.k).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+(period.value==='15min'?' '+new Date(x.k).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):''));const datasets=[{label:'Current',data:cur.map(x=>x[spec.source]),borderColor:spec.color,backgroundColor:rgba(spec.color,.12),borderWidth:2,pointRadius:cur.length<=1?4:1.5,pointHoverRadius:5,tension:.3,fill:true,spanGaps:true}];if(compare.checked){datasets.push({label:compareRangeLabel(),data:compareSeries(cur,cmp,spec.source),borderColor:'#FFB020',backgroundColor:'rgba(255,176,32,.06)',borderWidth:2,borderDash:[7,5],pointRadius:0,pointHoverRadius:4,tension:.3,fill:false,spanGaps:true})}charts[spec.key]=new Chart(ctx,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`${context.dataset.label}: ${spec.format(Number(context.parsed.y||0))}`}}},scales:{x:{ticks:{color:'#74a6ca',maxTicksLimit:8},grid:{color:'rgba(24,85,122,.25)'}},y:{ticks:{color:'#74a6ca',maxTicksLimit:5,callback:value=>spec.key==='traffic'?formatTrafficValue(value):Number(value).toLocaleString('en-US',{maximumFractionDigits:2})},grid:{color:'rgba(24,85,122,.25)'}}}}});}
function renderCharts(cur,cmp){const box=document.getElementById('charts');box.innerHTML=specs.map(s=>`<div class="chart-card"><div class="chart-head"><h3>${s.title}${s.key==='traffic'?'':' ('+s.unit+')'}</h3><div class="legend"><b style="color:${s.color}">━━ Current</b>${compare.checked?` <b style="color:#FFB020">┄┄ ${compareRangeLabel()}</b>`:''}</div></div><canvas id="ch_${s.key}"></canvas></div>`).join('');specs.forEach(s=>drawChart(s,cur,cmp))}
function absoluteMetricSeverity(key,val){
 const limits={
  tcp:v=>v<97?2:v<98?1:0,
  dlRetx:v=>v>5?2:v>2?1:0,
  ulRetx:v=>v>5?2:v>2?1:0,
  dlLoss:v=>v>0.5?2:v>0.1?1:0,
  ulLoss:v=>v>0.5?2:v>0.1?1:0,
  e2e:v=>v>200?2:v>100?1:0,
  synAck:v=>v>200?2:v>100?1:0,
  synSyn:v=>v>200?2:v>100?1:0
 };
 return limits[key]?limits[key](Number(val)||0):0;
}
function compareMetricSeverity(key,val,old){
 if(old===null||!Number.isFinite(old))return 0;
 const change=Number(val)-Number(old);
 if(key==='traffic'){
  if(old<=0)return 0;
  const drop=(Number(old)-Number(val))/Number(old)*100;
  return drop>=20?2:drop>=10?1:0;
 }
 if(key==='tcp'){const drop=-change;return drop>=2?2:drop>=1?1:0;}
 if(['dlRetx','ulRetx'].includes(key))return change>=2?2:change>=1?1:0;
 if(['dlLoss','ulLoss'].includes(key))return change>=.3?2:change>=.1?1:0;
 if(['e2e','synAck','synSyn'].includes(key)){
  if(old<=0)return 0;
  const rise=change/Math.abs(old)*100;
  return rise>=40?2:rise>=20?1:0;
 }
 return 0;
}
function updateKpis(cur,cmp){
 const last=cur.length?cur[cur.length-1]:null;
 document.getElementById('kpis').innerHTML=specs.slice(0,8).map((s,i)=>{
  const isTraffic=s.key==='traffic';
  const currentLatest=last&&Number.isFinite(last[s.source])?last[s.source]:null;
  const hasValue=isTraffic
   ?cur.some(point=>Number.isFinite(point[s.source]))
   :currentLatest!==null;
  // Traffic card keeps the period total as its headline value; status and delta use the latest interval only.
  const displayValue=isTraffic
   ?(hasValue?cur.reduce((sum,point)=>sum+(Number.isFinite(point[s.source])?point[s.source]:0),0):null)
   :currentLatest;
  const compareLatest=compare.checked?compareLastValue(cur,cmp,s.source):null;
  const hasCompare=compareLatest!==null&&Number.isFinite(compareLatest);
  const statusCurrent=currentLatest;
  const severity=(hasValue&&hasCompare)?compareMetricSeverity(s.key,statusCurrent,compareLatest):0;
  let delta='';
  if(hasCompare&&hasValue){
   const d=statusCurrent-compareLatest;
   const isRate=['tcp','dlRetx','ulRetx','dlLoss','ulLoss'].includes(s.key);
   const deltaText=isRate?Math.abs(d).toFixed(2)+' pp':(compareLatest!==0?Math.abs(d/Math.abs(compareLatest)*100).toFixed(2)+'%':(Math.abs(d).toFixed(2)+' '+(isTraffic?'TB':'ms')));
   const trendBad=s.key==='tcp'?d<0:['dlRetx','ulRetx','dlLoss','ulLoss','e2e','synAck','synSyn'].includes(s.key)?d>0:isTraffic?d<0:false;
   const trendClass=trendBad?'bad':(d===0?'neutral':'good');
   delta=`<div class="delta ${trendClass}">${d>0?'▲':d<0?'▼':'●'} ${deltaText}</div><div class="vs">Latest: ${s.format(statusCurrent)} vs ${s.format(compareLatest)} <span>(Compare)</span></div>`;
  }else if(compare.checked){
   delta='<div class="delta neutral">— Compare N/A</div><div class="vs">Data terakhir pada periode Compare tidak tersedia</div>';
  }else delta='<div class="delta neutral">● Live</div><div class="vs">Aktifkan Compare untuk melihat perubahan</div>';
  const status=!hasValue?'NO DATA':!compare.checked?'LIVE':!hasCompare?'COMPARE N/A':severity===2?'DEGRADED':severity===1?'WARNING':'NORMAL';
  const stateClass=severity===2?'degraded':severity===1?'warning':'';
  const statusClass=!hasValue||!compare.checked||!hasCompare?'status-live':severity===2?'status-bad':severity===1?'status-warning':'status-good';
  const valueText=displayValue!==null&&Number.isFinite(displayValue)?s.format(displayValue):'—';
  const note=!hasValue?'Data metrik tidak tersedia':compare.checked&&!hasCompare?'Pembanding data terakhir tidak tersedia':'';
  return `<div class="kpi ${['green','orange','purple','pink'][i%4]} ${stateClass} ${!hasValue?'no-data':''}"><div class="kpi-status ${statusClass}">${status}</div><div class="icon">${s.icon}</div><h3>${s.title}</h3><span class="unit">${s.unit}${isTraffic?' · TOTAL PERIODE':''}</span><div class="value">${valueText}</div>${delta}${note?`<div class="kpi-note">${note}</div>`:''}</div>`;
 }).join('');
}
function renderTable(data,bodyId='tableBody',headId='tableHead',limit=500){const cols=dataMode==='sgw'?['15 Minutes','SGW','Total Traffic(Byte)','Downlink TCP Retransmission Rate(%)','Uplink TCP Retransmission Rate(%)','TCP Connection Success Rate (Included RST)(%)','Downlink TCP Packet Loss Rate(%)','Uplink TCP Packet Loss Rate(%)','E2E Delay(ms)','SYN ACK-ACK Delay(ms)','SYN-SYN ACK Delay(ms)']:['15 Minutes','REGION','CIRCLE','BRANCH','KABUPATEN','Total Traffic(Byte)','Downlink TCP Retransmission Rate(%)','Uplink TCP Retransmission Rate(%)','TCP Connection Success Rate (Included RST)(%)','Downlink TCP Packet Loss Rate(%)','Uplink TCP Packet Loss Rate(%)','E2E Delay(ms)','SYN ACK-ACK Delay(ms)','SYN-SYN ACK Delay(ms)'];document.getElementById(headId).innerHTML='<tr>'+cols.map((c,i)=>`<th>${i===0?'DATE / TIME':c.replace('Total Traffic(Byte)',dataMode==='sgw'?'TOTAL TRAFFIC (TB)':'TOTAL TRAFFIC (GB / TB)').replace('Downlink TCP Retransmission Rate(%)','DL RETX (%)').replace('Uplink TCP Retransmission Rate(%)','UL RETX (%)').replace('TCP Connection Success Rate (Included RST)(%)','TCP SUCCESS (%)').replace('Downlink TCP Packet Loss Rate(%)','DL LOSS (%)').replace('Uplink TCP Packet Loss Rate(%)','UL LOSS (%)').replace('SYN ACK-ACK Delay(ms)','SYN ACK-ACK (ms)').replace('SYN-SYN ACK Delay(ms)','SYN-SYN ACK (ms)')}</th>`).join('')+'</tr>';const out=[...data].sort((a,b)=>b.dt-a.dt).slice(0,limit);if(bodyId==='dataBody'){const count=document.getElementById('dataCount');if(count)count.textContent=`Menampilkan ${out.length.toLocaleString('id-ID')} dari ${data.length.toLocaleString('id-ID')} data`; }document.getElementById(bodyId).innerHTML=out.map((r,i)=>`<tr><td>${esc(r['15 Minutes'])}</td>${dataMode==='sgw'?'<td>'+esc(r.SGW)+'</td>':'<td>'+esc(r.REGION)+'</td><td>'+esc(r.CIRCLE)+'</td><td>'+esc(r.BRANCH)+'</td><td>'+esc(r.KABUPATEN)+'</td>'}<td class="num">${esc(specs[0].format(metricValue(r,'Total Traffic(Byte)')))}</td><td class="num">${Number(r['Downlink TCP Retransmission Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['Uplink TCP Retransmission Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['TCP Connection Success Rate (Included RST)(%)']).toFixed(2)}</td><td class="num">${Number(r['Downlink TCP Packet Loss Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['Uplink TCP Packet Loss Rate(%)']).toFixed(2)}</td><td class="num">${Number(r['E2E Delay(ms)']).toFixed(0)}</td><td class="num">${Number(r['SYN ACK-ACK Delay(ms)']).toFixed(0)}</td><td class="num">${Number(r['SYN-SYN ACK Delay(ms)']).toFixed(0)}</td></tr>`).join('');return out}
function updateFilterSummary(data=[]){const box=document.getElementById('activeFilterChips');if(!box)return;const items=[];const add=(label,value)=>{if(value&&value!=='ALL')items.push({label,value})};add('DATA SOURCE',dataMode==='sgw'?'SGW':'WILAYAH');add('CIRCLE',filterValue('circle'));add('REGION',filterValue('region'));add('BRANCH',filterValue('branch'));add('KABUPATEN',filterValue('kabupaten'));add('SGW',filterValue('sgwFilter'));const from=document.getElementById('dateFrom')?.value,to=document.getElementById('dateTo')?.value;if(from)add('DATE FROM',new Date(from+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}));if(to)add('DATE TO',new Date(to+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}));const latest=data.length?data.reduce((max,row)=>row.dt>max?row.dt:max,data[0].dt):null;add('DATA UP TO',latest?latest.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' WIB':'Tidak ada data');if(document.getElementById('compare')?.checked)add('COMPARE',filterValue('compareDays')+' DAY(S) AGO');box.innerHTML=items.map(x=>'<span class="active-filter-chip"><small>'+esc(x.label)+'</small><strong>'+esc(x.value)+'</strong></span>').join('');}
function update(){const currentRows=filtered(dateFrom.value,dateTo.value).sort((a,b)=>a.dt-b.dt);updateFilterSummary(currentRows);if(!currentRows.length){activeCurrentWindow=null;activeCompareWindow=null;updateKpis([],[]);renderCharts([],[]);renderTable([]);return;}const currentStart=currentRows[0].dt,currentEnd=currentRows[currentRows.length-1].dt;activeCurrentWindow={start:currentStart,end:currentEnd};const cur=aggregate(currentRows);let cmp=[];if(compare.checked){const days=Number(document.getElementById('compareDays')?.value||1),compareStart=shiftDateByDays(currentStart,-days),compareEnd=shiftDateByDays(currentEnd,-days);activeCompareWindow={start:compareStart,end:compareEnd};const comparisonRows=filteredDateTime(compareStart,compareEnd).sort((a,b)=>a.dt-b.dt);cmp=aggregate(comparisonRows);}else activeCompareWindow=null;updateKpis(cur,cmp);renderCharts(cur,cmp);renderTable(currentRows);}
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
 if(dataMode==='sgw'){document.getElementById('topologyCanvas').innerHTML='<div style="padding:28px;color:#9fc9e5">Network Map tersedia saat sumber data Wilayah dipilih.</div>';return;}
 const dates=[...new Set(rows.map(r=>isoDate(r.dt)))].sort();if(!dates.length)return;
 const fromEl=document.getElementById('regionFrom'),toEl=document.getElementById('regionTo'),metric=document.getElementById('regionMetric').value;
 if(!fromEl.value)fromEl.value=dates.at(-1);if(!toEl.value)toEl.value=dates.at(-1);
 if(fromEl.value>toEl.value){const swap=fromEl.value;fromEl.value=toEl.value;toEl.value=swap}
 const from=fromEl.value,to=toEl.value,days=Math.max(1,Math.round((new Date(`${to}T00:00:00Z`)-new Date(`${from}T00:00:00Z`))/86400000)+1),previousTo=dateShift(from,-1),previousFrom=dateShift(previousTo,-days);
 const current=regionDateStats(from,to,metric),prior=regionDateStats(previousFrom,previousTo,metric),metricTitle=regionMetricTitles[metric]||metric,unit=metric==='Total Traffic(Byte)'?(dataMode==='sgw'?'TB':'Byte'):metric.includes('(%)')?'%':'ms';
 const pretty=d=>fmtDate(new Date(`${d}T00:00:00`));
 document.getElementById('regionDateCaption').textContent=`${pretty(from)} — ${pretty(to)} · Compare ${pretty(previousFrom)} — ${pretty(previousTo)}`;
 document.getElementById('regionValueHeader').textContent=`${metricTitle} (${unit})`;
 document.getElementById('comparisonCaption').textContent=`${pretty(from)} — ${pretty(to)} vs ${pretty(previousFrom)} — ${pretty(previousTo)}`;
 const fmtValue=v=>metric==='Total Traffic(Byte)'?v.toLocaleString('en-US',{maximumFractionDigits:dataMode==='sgw'?5:0}):v.toLocaleString('en-US',{maximumFractionDigits:metric.includes('(%)')?2:1});
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
function initNav(){
 document.querySelectorAll('.nav-btn').forEach(button=>button.addEventListener('click',()=>{
  const view=button.dataset.view;
  document.querySelectorAll('.nav-btn').forEach(item=>item.classList.toggle('active',item===button));
  document.querySelectorAll('.view').forEach(panel=>panel.classList.toggle('active-view',panel.id===`${view}View`));
  if(view==='map'&&rows.length)renderMap();
  if(view==='dashboard')setTimeout(()=>Object.values(charts).forEach(chart=>chart?.resize()),50);
 }));
}
function loadLegacyCsvFiles(){
 return fetch(`data/manifest.json?v=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Manifest tidak dapat dimuat: HTTP '+r.status);return r.json()}).then(async manifest=>{
  const groups={wilayah:Array.isArray(manifest.wilayah_files)?manifest.wilayah_files:(manifest.files||[]),sgw:Array.isArray(manifest.sgw_files)?manifest.sgw_files:[]};
  const read=async(mode,files)=>{
   const parts=await Promise.all(files.map(file=>new Promise(resolve=>{
    const name=String(file||'').trim();if(!name||name.includes('..')||name.includes('/')||name.includes('\\\\')){resolve({file:name,error:'Nama file tidak valid'});return}
    Papa.parse(`data/${encodeURIComponent(name)}?v=${Date.now()}`,{download:true,header:true,skipEmptyLines:true,dynamicTyping:true,complete:res=>{
     if(res.errors.length){resolve({file:name,error:res.errors[0].message});return}
     const h=res.meta.fields||[],required=mode==='sgw'?['15 Minutes','SGW','Total Traffic(TB)']:['15 Minutes','REGION','BRANCH','KABUPATEN','CIRCLE','Total Traffic(Byte)'],missing=required.filter(x=>!h.includes(x));
     if(missing.length){resolve({file:name,error:'Kolom wajib tidak ditemukan: '+missing.join(', ')});return}
     const data=res.data.filter(x=>x['15 Minutes']).map(x=>{const row={...x};if(mode==='sgw'){row['Total Traffic(Byte)']=Number(x['Total Traffic(TB)']??0);row['TCP Connection Success Rate (Included RST)(%)']=x['TCP Connection Success Rate(%)']??x['TCP Connection Success Rate (Included RST)(%)']??0;['REGION','BRANCH','KABUPATEN','CIRCLE'].forEach(k=>row[k]='')}else row['TCP Connection Success Rate (Included RST)(%)']=x['TCP Connection Success Rate (Included RST)(%)']??x['TCP Connection Success Rate(%)']??0;return row});
     resolve({file:name,headers:h,data});
    },error:e=>resolve({file:name,error:e.message||String(e)})});
   })));
   let sig=null;const data=[],loadedFiles=[],warnings=[];parts.forEach(p=>{if(p.error){warnings.push(p.file+': '+p.error);return}const s=p.headers.join('\\u001f');if(sig&&s!==sig){warnings.push(p.file+': susunan header berbeda, file dilewati');return}sig||=s;loadedFiles.push(p.file);for(const row of p.data)data.push(row)});
   return {data:mode==='wilayah'?normalizeLocationHierarchy(data):data,warnings,loadedFiles};
  };
  const [wilayah,sgw]=await Promise.all([read('wilayah',groups.wilayah),read('sgw',groups.sgw)]);
  if(!wilayah.data.length&&!sgw.data.length)throw new Error('Tidak ada data valid. Periksa data/manifest.json.');
  return {wilayah,sgw};
 });
}

function supabaseClient(){if(!window.socSupabase)throw new Error('Sesi Supabase belum siap. Silakan login ulang.');return window.socSupabase;}
const DB_FIELDS={
 wilayah:{'Total Traffic(Byte)':'total_traffic_byte','Downlink TCP Retransmission Rate(%)':'downlink_tcp_retransmission_rate','Uplink TCP Retransmission Rate(%)':'uplink_tcp_retransmission_rate','TCP Connection Success Rate (Included RST)(%)':'tcp_connection_success_rate_included_rst','Downlink TCP Packet Loss Rate(%)':'downlink_tcp_packet_loss_rate','Uplink TCP Packet Loss Rate(%)':'uplink_tcp_packet_loss_rate','E2E Delay(ms)':'e2e_delay_ms','SYN ACK-ACK Delay(ms)':'syn_ack_ack_delay_ms','SYN-SYN ACK Delay(ms)':'syn_syn_ack_delay_ms'},
 sgw:{'Total Traffic(Byte)':'total_traffic_tb','Downlink TCP Retransmission Rate(%)':'downlink_tcp_retransmission_rate','Uplink TCP Retransmission Rate(%)':'uplink_tcp_retransmission_rate','TCP Connection Success Rate (Included RST)(%)':'tcp_connection_success_rate','Downlink TCP Packet Loss Rate(%)':'downlink_tcp_packet_loss_rate','Uplink TCP Packet Loss Rate(%)':'uplink_tcp_packet_loss_rate','E2E Delay(ms)':'e2e_delay_ms','SYN ACK-ACK Delay(ms)':'syn_ack_ack_delay_ms','SYN-SYN ACK Delay(ms)':'syn_syn_ack_delay_ms'}
};
function toDatabaseRow(row,mode,batchId){
 const timestamp=row.dt instanceof Date?row.dt:parseDate(String(row['15 Minutes']),mode);if(!Number.isFinite(timestamp.getTime()))throw new Error('Tanggal tidak valid pada data '+mode.toUpperCase()+'.');const out={batch_id:batchId,fifteen_minutes:timestamp.toISOString()};
 if(mode==='wilayah'){out.region=row.REGION||null;out.branch=row.BRANCH||null;out.kabupaten=row.KABUPATEN||null;out.circle=row.CIRCLE||null;}
 else out.sgw=row.SGW||null;
 Object.entries(DB_FIELDS[mode]).forEach(([source,target])=>{const v=row[source];out[target]=v===''||v===undefined||v===null?null:Number(v);if(out[target]!==null&&!Number.isFinite(out[target]))out[target]=null;});
 return out;
}
function fromDatabaseRow(row,mode){
 const out={'15 Minutes':row.fifteen_minutes,dt:parseDate(row.fifteen_minutes,mode)};
 if(mode==='wilayah'){out.REGION=row.region||'';out.BRANCH=row.branch||'';out.KABUPATEN=row.kabupaten||'';out.CIRCLE=row.circle||'';}
 else {out.SGW=row.sgw||'';out.REGION='';out.BRANCH='';out.KABUPATEN='';out.CIRCLE='';}
 Object.entries(DB_FIELDS[mode]).forEach(([source,target])=>{out[source]=row[target]??null;});
 return out;
}
async function readSupabaseRows(mode){
 const table=mode==='wilayah'?'raw_data_wilayah':'raw_data_sgw',client=supabaseClient(),all=[];let from=0;
 while(true){const {data,error}=await client.from(table).select('*').order('fifteen_minutes',{ascending:true}).range(from,from+999);if(error)throw error;if(!data?.length)break;all.push(...data);if(data.length<1000)break;from+=data.length;}
 return all.map(row=>fromDatabaseRow(row,mode)).filter(row=>Number.isFinite(row.dt.getTime()));
}
async function writeSupabaseRows(mode,fileName,data){
 const client=supabaseClient(),table=mode==='wilayah'?'raw_data_wilayah':'raw_data_sgw',conflict=mode==='wilayah'?'fifteen_minutes,circle,region,branch,kabupaten':'fifteen_minutes,sgw';
 const {data:batch,error:batchError}=await client.from('upload_batches').insert({source_type:mode.toUpperCase(),file_name:fileName,total_rows:data.length,status:'PROCESSING'}).select('id').single();
 if(batchError)throw batchError;
 let inserted=0;
 try{
  const payload=data.map(row=>toDatabaseRow(row,mode,batch.id));
  for(let i=0;i<payload.length;i+=500){
   const {data:saved,error}=await client.from(table).upsert(payload.slice(i,i+500),{onConflict:conflict,ignoreDuplicates:true}).select('id');
   if(error)throw error;inserted+=(saved||[]).length;
  }
  const {error:updateError}=await client.from('upload_batches').update({total_rows:inserted,status:'SUCCESS'}).eq('id',batch.id);
  if(updateError)throw updateError;
  return inserted;
 }catch(error){
  await client.from('upload_batches').update({total_rows:inserted,status:'FAILED'}).eq('id',batch.id);
  throw error;
 }
}
async function loadCsvFiles(){
 const [wilayahRows,sgwRows]=await Promise.all([readSupabaseRows('wilayah'),readSupabaseRows('sgw')]);
 // Supabase is the sole source of truth. Empty tables stay empty; do not silently re-import legacy CSVs.
 return {wilayah:{data:wilayahRows,warnings:[],loadedFiles:wilayahRows.length?['Supabase Database']:[]},sgw:{data:sgwRows,warnings:[],loadedFiles:sgwRows.length?['Supabase Database']:[]}};
}

function activateDataSource(mode){
 dataMode=mode;rows=datasets[mode]||[];setTrafficPresentation();
 document.querySelectorAll('.location-filter').forEach(el=>el.hidden=mode==='sgw');
 document.getElementById('sgwFilterLabel').hidden=mode!=='sgw';
 const mapNav=document.querySelector('.nav-btn[data-view="map"]');if(mapNav)mapNav.disabled=mode==='sgw';
 const notice=document.getElementById('csvLoadNotice');
 if(!rows.length){['kpis','charts','tableHead','tableBody','dataHead','dataBody'].forEach(id=>document.getElementById(id).innerHTML='');notice.hidden=false;notice.classList.add('is-warning');notice.textContent=mode==='sgw'?'Raw Data SGW belum tersedia. Tambahkan nama file ke sgw_files di data/manifest.json.':'Raw Data Wilayah belum tersedia.';document.getElementById('regionDateCaption').textContent='Tidak ada data untuk sumber yang dipilih.';return}
 const min=rows[0].dt,max=rows[rows.length-1].dt,minDate=isoDate(min),maxDate=isoDate(max);
 setupFilters();
 circle.innerHTML='<option value="ALL">All Circle</option>'+unique('CIRCLE').map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');refreshDependent();
 const sgwSelect=document.getElementById('sgwFilter'),old=sgwSelect.value;sgwSelect.innerHTML='<option value="ALL">All SGW</option>'+unique('SGW').map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(unique('SGW').includes(old))sgwSelect.value=old;
 document.getElementById('compareDateGroup').hidden=!compare.checked;
 renderTable(rows,'dataBody','dataHead',1000);update();
 const info=datasetInfo[mode];notice.hidden=false;notice.classList.toggle('is-warning',info.warnings.length>0);notice.textContent='Data '+(mode==='sgw'?'SGW':'Wilayah')+' dimuat: '+info.loadedFiles.join(', ')+(info.warnings.length?'. Peringatan: '+info.warnings.join(' | '):'.');
}
const uploadStorageKey=mode=>'soc_sqm_uploaded_'+mode+'_v1';
function uploadStatus(message,type=''){
 const el=document.getElementById('uploadStatus');if(!el)return;
 el.textContent=message;el.classList.toggle('is-success',type==='success');el.classList.toggle('is-error',type==='error');
}
function normalizeUploadedRows(rawRows,mode){
 const required=mode==='sgw'?['15 Minutes','SGW','Total Traffic(TB)']:['15 Minutes','REGION','BRANCH','KABUPATEN','CIRCLE','Total Traffic(Byte)'];
 const headers=rawRows.meta?.fields||Object.keys(rawRows.data?.[0]||{});
 const missing=required.filter(h=>!headers.includes(h));
 if(missing.length)throw new Error('Kolom wajib tidak ditemukan: '+missing.join(', '));
 let normalized=rawRows.data.filter(x=>x['15 Minutes']).map(x=>{
  const row={...x};
  if(mode==='sgw'){
   row['Total Traffic(Byte)']=Number(x['Total Traffic(TB)']??0);
   row['TCP Connection Success Rate (Included RST)(%)']=x['TCP Connection Success Rate(%)']??x['TCP Connection Success Rate (Included RST)(%)']??0;
   ['REGION','BRANCH','KABUPATEN','CIRCLE'].forEach(k=>row[k]='');
  }else row['TCP Connection Success Rate (Included RST)(%)']=x['TCP Connection Success Rate (Included RST)(%)']??x['TCP Connection Success Rate(%)']??0;
  row.dt=parseDate(String(row['15 Minutes']),mode);
  return row;
 }).filter(r=>Number.isFinite(r.dt.getTime()));
 if(mode==='wilayah')normalized=normalizeLocationHierarchy(normalized);
 return normalized;
}
function uploadDuplicateKey(row,mode){
 return [row.dt?.getTime()||'',mode==='sgw'?row.SGW:row.CIRCLE,row.REGION,row.BRANCH,row.KABUPATEN].map(v=>String(v??'').trim().toUpperCase()).join('|');
}
function renderUploadPreview(data,mode){
 const box=document.getElementById('uploadPreview');if(!box)return;
 const cols=mode==='sgw'?['15 Minutes','SGW','Total Traffic(TB)']:['15 Minutes','REGION','CIRCLE','BRANCH','KABUPATEN','Total Traffic(Byte)'];
 box.hidden=false;
 box.innerHTML='<div style="padding:8px 10px;color:#9fc9e5;font-size:10px">Pratinjau 5 baris pertama dari '+data.length.toLocaleString('id-ID')+' baris valid</div><table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+data.slice(0,5).map(r=>'<tr>'+cols.map(c=>'<td>'+esc(r[c]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function previewCsvUpload(){
 const file=document.getElementById('uploadFile').files[0],mode=document.getElementById('uploadSource').value;
 if(!file){uploadStatus('Pilih file CSV terlebih dahulu.','error');return}
 if(!file.name.toLowerCase().endsWith('.csv')){uploadStatus('Format file harus CSV.','error');return}
 Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:true,complete:result=>{
  try{
   if(result.errors?.length)throw new Error(result.errors[0].message);
   const data=normalizeUploadedRows(result,mode);
   if(!data.length)throw new Error('Tidak ada baris dengan tanggal valid pada file ini.');
   pendingUpload={mode,fileName:file.name,data};
   renderUploadPreview(data,mode);
   document.getElementById('confirmUpload').disabled=false;
   uploadStatus('File valid: '+file.name+' · '+data.length.toLocaleString('id-ID')+' baris. Tekan “Tambahkan Data” untuk append.','success');
  }catch(error){pendingUpload=null;document.getElementById('confirmUpload').disabled=true;document.getElementById('uploadPreview').hidden=true;uploadStatus(error.message,'error')}
 },error:error=>uploadStatus('Gagal membaca CSV: '+error.message,'error')});
}

async function confirmCsvUpload(){
 if(!pendingUpload)return;
 const {mode,fileName,data}=pendingUpload;
 const button=document.getElementById('confirmUpload');button.disabled=true;button.textContent='Mengirim ke Supabase...';
 uploadStatus('Mengirim '+data.length.toLocaleString('id-ID')+' baris ke database Supabase...','');
 try{
  const added=await writeSupabaseRows(mode,fileName,data),skipped=data.length-added;
  pendingUpload=null;document.getElementById('uploadFile').value='';document.getElementById('uploadPreview').hidden=true;
  const [wilayahRows,sgwRows]=await Promise.all([readSupabaseRows('wilayah'),readSupabaseRows('sgw')]);
  datasets.wilayah=wilayahRows;datasets.sgw=sgwRows;
  datasetInfo[mode]=datasetInfo[mode]||{warnings:[],loadedFiles:[]};datasetInfo[mode].loadedFiles=[...new Set([...(datasetInfo[mode].loadedFiles||[]),fileName])];
  if(document.getElementById('dataSource').value===mode)activateDataSource(mode);
  uploadStatus('Berhasil disimpan di Supabase: '+added.toLocaleString('id-ID')+' baris baru; '+skipped.toLocaleString('id-ID')+' duplikat dilewati. Data tersimpan di database dan dapat diakses setelah login dari perangkat lain.','success');
 }catch(error){console.error('Supabase upload error:',error);uploadStatus('Upload ke Supabase gagal: '+(error.message||String(error)),'error');}
 finally{button.disabled=!pendingUpload;button.textContent='＋ Tambahkan Data';}
}

function restoreBrowserUploads(){
 for(const mode of ['wilayah','sgw']){
  try{
   const saved=JSON.parse(localStorage.getItem(uploadStorageKey(mode))||'[]');
   if(!Array.isArray(saved)||!saved.length)continue;
   const existing=datasets[mode]||[],seen=new Set(existing.map(r=>uploadDuplicateKey(r,mode)));
   saved.forEach(r=>{r.dt=new Date(r.dt);if(Number.isFinite(r.dt.getTime())){const key=uploadDuplicateKey(r,mode);if(!seen.has(key)){seen.add(key);existing.push(r)}}});
   existing.sort((a,b)=>a.dt-b.dt);datasets[mode]=existing;
   datasetInfo[mode]=datasetInfo[mode]||{warnings:[],loadedFiles:[]};
   datasetInfo[mode].loadedFiles=[...new Set([...(datasetInfo[mode].loadedFiles||[]),'Data tersimpan di browser'])];
  }catch(error){console.warn('Tidak dapat memulihkan upload lokal '+mode,error)}
 }
}
function initializeDashboard(payload){
 datasets={wilayah:payload.wilayah.data,sgw:payload.sgw.data};datasetInfo={wilayah:payload.wilayah,sgw:payload.sgw};
 for(const mode of ['wilayah','sgw'])datasets[mode]=datasets[mode].map(r=>({...r,dt:parseDate(String(r['15 Minutes']),mode)})).filter(r=>Number.isFinite(r.dt.getTime())).sort((a,b)=>a.dt-b.dt);
 // Data utama berasal dari Supabase; localStorage tidak lagi menjadi sumber dataset.
 // An intentionally empty Supabase database is valid: keep the dashboard available for the next CSV upload.
 if(!sourceInitialized){
  document.getElementById('dataSource').onchange=e=>activateDataSource(e.target.value);
  ['regionFrom','regionTo','regionMetric'].forEach(id=>document.getElementById(id).addEventListener('change',renderMap));
  downloadCsv.onclick=download;downloadCsv2.onclick=download;
  document.getElementById('previewUpload').onclick=previewCsvUpload;
  document.getElementById('confirmUpload').onclick=confirmCsvUpload;
  document.getElementById('uploadSource').onchange=()=>{pendingUpload=null;document.getElementById('confirmUpload').disabled=true;document.getElementById('uploadPreview').hidden=true;};
  dataSearch.oninput=()=>{const q=dataSearch.value.trim().toLowerCase();const found=rows.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));renderTable(found,'dataBody','dataHead',1000)};
  sourceInitialized=true;
 }
 const first=datasets.wilayah.length?'wilayah':datasets.sgw.length?'sgw':'wilayah';document.getElementById('dataSource').value=first;activateDataSource(first);
 const clock=document.querySelector('.clock');if(clock){clock.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});setInterval(()=>{clock.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})},1000);}
}
initNav();
loadCsvFiles().then(initializeDashboard).catch(error=>{console.error('CSV ERROR:',error);const notice=document.getElementById('csvLoadNotice');if(notice){notice.hidden=false;notice.classList.add('is-warning');notice.textContent=`Data CSV belum berhasil dimuat: ${error.message}`;}document.getElementById('regionDateCaption').textContent='Network Map dapat dibuka, tetapi data belum tersedia.';});









