# SOC-SQM-DASHBOARD

Static dashboard for SQM network monitoring.

## Files
- `index.html`, `style.css`, `app.js`
- Local `papaparse.min.js`
- `data/raw_data.csv` (130,936 data rows)
- `data/indonesia-outline.json` (Natural Earth coastline outline)

The Network Map shows traffic totals for six macro-regions (Sumatera, Jawa, Kalimantan, Sulawesi, Bali & Nusa Tenggara, and Papua), a date-based traffic summary, and a two-date regional comparison chart. The latest two dates present in `data/raw_data.csv` are selected automatically. Traffic sums are derived from source rows; other selectable metrics use regional averages.
