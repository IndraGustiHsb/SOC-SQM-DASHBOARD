# SOC-SQM-DASHBOARD

Static dashboard for SQM network monitoring.

## Files
- `index.html`, `style.css`, `app.js`
- Local `papaparse.min.js`
- `data/raw_data.csv` (130,936 data rows)
- `data/indonesia-outline.json` (Natural Earth coastline outline)

The Network Map shows an Indonesia outline, six macro-region data points, KQI summaries, and branch/kabupaten counts. Choose a From/To date range and any available KQI to refresh the values and comparison chart. The chart compares the selected range with the immediately previous range of equal length. Traffic sums are derived from source rows; other KQIs use regional averages. Regions without source records appear as “Tidak ada data.” The CSV contains no GPS coordinates, so map points are regional anchors, not exact branch locations.
