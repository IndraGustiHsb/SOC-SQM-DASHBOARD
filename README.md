# SOC-SQM-DASHBOARD

Static dashboard for SQM network monitoring.

## Files
- `index.html`, `style.css`, `app.js`
- Local `papaparse.min.js`
- `data/manifest.json` (list of CSV files loaded by the dashboard)
- `data/raw_data.csv` (130,936 data rows)
- `data/indonesia-outline.json` (Natural Earth coastline outline)

The Network Map shows an Indonesia outline, six macro-region data points, KQI summaries, and branch/kabupaten counts. Choose a From/To date range and any available KQI to refresh the values and comparison chart. The chart compares the selected range with the immediately previous range of equal length. Traffic sums are derived from source rows; other KQIs use regional averages. Regions without source records appear as “Tidak ada data.” The CSV contains no GPS coordinates, so map points are regional anchors, not exact branch locations.

## Adding data without replacing old records
1. Put each CSV part inside `data/`. Keep the same headers on every CSV part. Each part must have one header row.
2. Keep every individual CSV below GitHub's 25 MiB browser-upload limit; 20 MiB or less is a practical target.
3. Add each new filename to the `files` list in `data/manifest.json`. Keep `raw_data.csv` in the list to retain the existing records.
4. Upload the new CSV part(s) and the updated manifest. The dashboard combines all listed files when it loads.
5. Do not include old records again in a new part, or they will be counted twice.
