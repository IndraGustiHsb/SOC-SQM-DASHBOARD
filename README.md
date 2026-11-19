# SOC-SQM-DASHBOARD

Dashboard statis untuk monitoring performa jaringan SOC-SQM.

## Struktur project
- `index.html` — struktur halaman dashboard.
- `style.css` — tampilan dashboard.
- `app.js` — pemrosesan CSV, filter, KPI, grafik, tabel, dan Network Map.
- `papaparse.min.js` — parser CSV lokal.
- `data/manifest.json` — daftar file CSV yang dimuat dashboard.
- `data/raw_data_01.csv`, `data/raw_data_02.csv` — data Raw Data Wilayah saat ini.

## Konvensi data
- Raw Data Wilayah menyimpan traffic dalam Byte. Dashboard mengonversinya menjadi GB dengan pembagi 1.000.000.000; file CSV sumber tidak diubah.
- Raw Data SGW menyimpan traffic dalam TB. Nilainya dipertahankan sebagai TB tanpa konversi.
- File SGW ditambahkan melalui properti `sgw_files` di `data/manifest.json`.
- Data Wilayah dan SGW dimuat sebagai sumber terpisah. Kolom TCP Success SGW yang menggunakan nama `TCP Connection Success Rate(%)` dipetakan ke field internal dashboard.

## Format tanggal
- Wilayah menggunakan format tanggal hari/bulan/tahun untuk nilai seperti `10/1/2026` (10 Januari 2026).
- Format ISO `YYYY-MM-DD` juga didukung.
- Perbandingan menggunakan selisih waktu dari awal rentang Current, sehingga rentang yang melewati tengah malam dapat dipasangkan dengan rentang Compare yang sesuai.

## Menambahkan file CSV
1. Letakkan file CSV baru di folder `data/`.
2. Tambahkan nama file ke `wilayah_files` atau `sgw_files` pada `data/manifest.json`.
3. Pastikan header pada file dalam kelompok sumber yang sama konsisten.
4. Commit perubahan ke repository, lalu muat ulang dashboard.

Network Map hanya tersedia untuk sumber Wilayah. Titik peta merupakan agregasi regional, bukan koordinat GPS cabang karena data CSV tidak menyediakan koordinat.
