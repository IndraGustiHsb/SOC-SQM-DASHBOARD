const TRAFFIC_DIVISOR=1, TRAFFIC_UNIT='TB';
    
// Membuat Date berdasarkan tanggal pilihan dan jam dari timestamp referensi
function dateWithTime(dateValue, referenceDate) {
    const [year, month, day] = dateValue.split('-').map(Number);

    return new Date(
        year,
        month - 1,
        day,
        referenceDate.getHours(),
        referenceDate.getMinutes(),
        referenceDate.getSeconds(),
        0
    );
}

// Filter data menggunakan batas waktu aktual, termasuk lintas tanggal
function filteredDateTime(start, end) {
    return rows.filter(r =>
        r.dt >= start &&
        r.dt <= end &&
        (region.value === 'ALL' || r.REGION === region.value) &&
        (circle.value === 'ALL' || r.CIRCLE === circle.value) &&
        (branch.value === 'ALL' || r.BRANCH === branch.value) &&
        (kabupaten.value === 'ALL' || r.KABUPATEN === kabupaten.value)
    );
}

// Mengubah timestamp bucket menjadi waktu untuk pencocokan
function pointTime(point) {
    return new Date(point.k).getTime();
}

// Mencocokkan data berdasarkan posisi waktu relatif terhadap awal periode.
// Tidak menggunakan interpolasi atau memaksakan jumlah titik sama.
function compareSeries(current, comparison, key) {
    if (!current.length || !comparison.length) return [];

    const currentBase = pointTime(current[0]);
    const compareBase = pointTime(comparison[0]);

    const compareMap = new Map();

    comparison.forEach(point => {
        const offset = Math.round((pointTime(point) - compareBase) / 60000);
        compareMap.set(offset, point[key]);
    });

    return current.map(point => {
        const offset = Math.round((pointTime(point) - currentBase) / 60000);

        return compareMap.has(offset)
            ? compareMap.get(offset)
            : null;
    });
}

// Mengambil nilai Compare pada waktu yang sama dengan titik Current terakhir
function compareLastValue(current, comparison, key) {
    if (!current.length || !comparison.length) return null;

    const currentBase = pointTime(current[0]);
    const compareBase = pointTime(comparison[0]);
    const currentLast = current[current.length - 1];

    const targetOffset = Math.round(
        (pointTime(currentLast) - currentBase) / 60000
    );

    const match = comparison.find(point => {
        const offset = Math.round(
            (pointTime(point) - compareBase) / 60000
        );

        return offset === targetOffset;
    });

    return match ? match[key] : null;
}

// Label rentang Compare
function compareRangeLabel() {
    if (!activeCompareWindow) return 'Compare';

    const fmt = d => d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    return `Compare (${fmt(activeCompareWindow.start)} – ${fmt(activeCompareWindow.end)})`;
}

// Menggambar grafik Current dan Compare
function drawChart(spec, cur, cmp) {
    const ctx = document.getElementById('ch_' + spec.key).getContext('2d');

    if (charts[spec.key]) charts[spec.key].destroy();

    const labels = cur.map(x => {
        const d = new Date(x.k);

        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short'
        }) + ' ' + d.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    });

    const datasets = [{
        label: 'Current',
        data: cur.map(x => x[spec.source]),
        borderColor: spec.color,
        backgroundColor: rgba(spec.color, .12),
        borderWidth: 2,
        pointRadius: cur.length <= 1 ? 4 : 1.5,
        pointHoverRadius: 5,
        tension: .3,
        fill: true,
        spanGaps: false
    }];

    if (compare.checked && cmp.length) {
        datasets.push({
            label: compareRangeLabel(),
            data: compareSeries(cur, cmp, spec.source),
            borderColor: spec.color,
            borderWidth: 1.5,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: .3,
            fill: false,
            spanGaps: false
        });
    }

    charts[spec.key] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#74a6ca',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(24,85,122,.25)'
                    }
                },
                y: {
                    ticks: {
                        color: '#74a6ca',
                        maxTicksLimit: 5
                    },
                    grid: {
                        color: 'rgba(24,85,122,.25)'
                    }
                }
            }
        }
    });
}

// Render semua grafik
function renderCharts(cur, cmp) {
    const box = document.getElementById('charts');

    box.innerHTML = specs.map(s => `
        <div class="chart-card">
            <div class="chart-head">
                <h3>${s.title} (${s.unit})</h3>
                <div class="legend">
                    <b style="color:${s.color}">━━ Current</b>
                    ${compare.checked && cmp.length
                        ? ` <b style="color:${s.color}">┄┄ ${compareRangeLabel()}</b>`
                        : ''}
                </div>
            </div>
            <canvas id="ch_${s.key}"></canvas>
        </div>
    `).join('');

    specs.forEach(s => drawChart(s, cur, cmp));
}

// KPI membandingkan timestamp terakhir yang sepadan
function updateKpis(cur, cmp) {
    const c = cur.length ? cur[cur.length - 1] : null;

    document.getElementById('kpis').innerHTML =
        specs.slice(0, 8).map((s, i) => {

            const val = c ? c[s.source] : 0;

            const old = compare.checked
                ? compareLastValue(cur, cmp, s.source)
                : null;

            let delta = '';

            if (old !== null && Number.isFinite(old) && old !== 0) {
                const d = val - old;
                const p = (d / Math.abs(old)) * 100;

                delta = `
                    <div class="delta">
                        ${d >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(2)}%
                    </div>
                    <div class="vs">
                        vs ${s.format(old)} (Compare)
                    </div>
                `;
            } else {
                delta = `
                    <div class="delta">● Live</div>
                    <div class="vs">
                        Tidak ada pasangan data Compare
                    </div>
                `;
            }

            return `
                <div class="kpi ${['green','orange','purple','pink'][i % 4]}">
                    <div class="icon">${s.icon}</div>
                    <h3>${s.title}</h3>
                    <span class="unit">${s.unit}</span>
                    <div class="value">${s.format(val)}</div>
                    ${delta}
                </div>
            `;
        }).join('');
}

// Update dashboard
function update() {
    // Ambil Current berdasarkan tanggal dan filter lokasi
    const currentRows = filtered(dateFrom.value, dateTo.value);

    // Data Current harus memiliki record
    if (!currentRows.length) {
        activeCompareWindow = null;
        updateKpis([], []);
        renderCharts([], []);
        renderTable([]);
        return;
    }

    // Tentukan waktu aktual pertama dan terakhir Current
    const currentStart = currentRows[0].dt;
    const currentEnd = currentRows[currentRows.length - 1].dt;

    const cur = aggregate(currentRows);

    let cmp = [];

    if (
        compare.checked &&
        compareFrom.value &&
        compareTo.value
    ) {
        // Gunakan tanggal custom Compare,
        // tetapi pertahankan jam Current.
        const compareStart = dateWithTime(
            compareFrom.value,
            currentStart
        );

        const compareEnd = dateWithTime(
            compareTo.value,
            currentEnd
        );

        activeCompareWindow = {
            start: compareStart,
            end: compareEnd
        };

        // Ambil hanya data pada rentang waktu Compare
        const comparisonRows = filteredDateTime(
            compareStart,
            compareEnd
        );

        cmp = aggregate(comparisonRows);

    } else {
        activeCompareWindow = null;
    }

    updateKpis(cur, cmp);
    renderCharts(cur, cmp);
    renderTable(currentRows);
}

    
    }catch(error){console.error('DASHBOARD RENDER ERROR:',error);if(notice){notice.hidden=false;notice.classList.add('is-warning');notice.textContent+=` Tampilan grafik bermasalah: ${error.message}. Tabel CSV tetap dimuat.`;}}
 ['regionFrom','regionTo','regionMetric'].forEach(id=>document.getElementById(id).addEventListener('change',renderMap));
 downloadCsv.onclick=download;downloadCsv2.onclick=download;
 dataSearch.oninput=()=>{const q=dataSearch.value.toLowerCase();renderTable(rows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))),'dataBody','dataHead',1000)};
const clock = document.getElementById('clock');

if (clock) {
    clock.textContent = new Date().toLocaleTimeString('en-GB', {
        hour12: false
    });

    setInterval(() => {
        clock.textContent = new Date().toLocaleTimeString('en-GB', {
            hour12: false
        });
    }, 1000);
}
}
initNav();
loadCsvFiles().then(initializeDashboard).catch(error=>{console.error('CSV ERROR:',error);const notice=document.getElementById('csvLoadNotice');if(notice){notice.hidden=false;notice.classList.add('is-warning');notice.textContent=`Data CSV belum berhasil dimuat: ${error.message}`;}document.getElementById('regionDateCaption').textContent='Network Map dapat dibuka, tetapi data belum tersedia.';});









