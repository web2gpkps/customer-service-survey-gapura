# JOUMPA CSS Survey Dashboard

Dashboard index kepuasan pelanggan JOUMPA (PT Gapura Angkasa) untuk dua segmen: B2C (penumpang) dan B2B (mitra bisnis). Semua angka dihitung langsung dari Google Sheets setiap kali halaman dimuat.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start   # mode produksi
```

| Halaman | Isi |
|---|---|
| `/` | Dashboard. Tab B2C terbuka duluan, tab B2B lewat `/?tab=b2b`. Perlu login admin. |
| `/akses` | Share akses cabang (admin): dashboard yang sama plus target sampling semua cabang, dan tombol **Kelola link cabang**. |
| `/akses/<token>` | Dashboard satu cabang dari link yang dibagikan. Tanpa login, hanya data cabang itu. |
| `/login` | Login admin. |
| `/presentasi` | Laporan satu halaman yang hanya bisa dibaca. Link-nya dibuat dari tombol **Bagikan**. |
| `/api/export` | Unduh PDF (`format=pdf`) atau Excel (`format=xlsx`). |

Tombol **Bagikan** dan **Export** membuka pilihan yang sama: segmen (B2C, B2B, atau keduanya), filter periode, bandara, dan jenis layanan per segmen, lalu konten yang disertakan. Pilihan itu tersimpan di URL, misalnya:

```
/presentasi?segmen=b2c,b2b&b2b.bandara=CGK&konten=ringkasan,bagian
/api/export?format=xlsx&segmen=b2c&b2c.periode=2026-09
```

## Akses cabang

Tombol **Share akses cabang** di sebelah **Bagikan** membuka `/akses`. Di sana Anda melihat target sampling per cabang (dari sheet `Target Sampling`) dan membuat link untuk tiap cabang lewat **Kelola link cabang**.

- Link cabang hanya menampilkan dashboard dan target sampling cabang itu. Server hanya mengirim respons cabang tersebut, jadi cabang lain tidak ikut terkirim.
- Pemegang link tidak bisa membuka halaman utama, export, atau `/akses`; semuanya meminta login admin.
- Link bisa dimatikan, diaktifkan lagi, dan diberi masa berlaku (7, 30, 90 hari, atau tanpa batas). Perubahan berlaku dalam beberapa detik.
- Daftar link disimpan di tab `Share Akses Cabang` pada spreadsheet yang sama. Tab dibuat otomatis saat link pertama dibuat. **Service account harus berstatus Editor** di spreadsheet (selain Viewer untuk membaca data).

### Login admin

Halaman utama, `/api/export`, dan `/akses` dikunci dengan password. Atur `ADMIN_PASSWORD` dan `AUTH_SECRET` di `.env` (dan di environment Vercel). Tanpa keduanya halaman admin tidak bisa dibuka. `/presentasi` dan link cabang tetap terbuka tanpa login.

Dashboard mengambil ulang data tiap 2 menit selama halaman terbuka, laporan tiap 5 menit. Server menyimpan hasil ambil data selama 60 detik; tombol **Muat ulang** melewati simpanan itu.

## Isi file export

**Excel**

- Sheet `B2C CSS Tally` / `B2B CSS Tally`: salinan sheet Google dengan header, urutan kolom, dan isi sel yang sama. Barisnya hanya yang lolos filter.
- Sheet `Rekap B2C` / `Rekap B2B`: jumlah skor 1 sampai 5, n, total skor, skor maksimum, index, kategori, dan status per pernyataan, per bagian, dan keseluruhan. Semua angka memakai rumus yang membaca sheet Tally di file yang sama, jadi ikut berubah kalau datanya diedit. Standar KPI ada di sel `C4`.
- Sheet `Standar KPI`: tabel interpretasi dan cara hitung.

**PDF**: laporan A4 berisi halaman judul, lalu bagian yang dipilih untuk tiap segmen, dan standar KPI di akhir.

## Sumber data

| Segmen | Sheet |
|---|---|
| B2C | `B2C CSS Tally` (bisa diganti dengan env `SHEET_B2C`) |
| B2B | `B2B CSS Tally` (bisa diganti dengan env `SHEET_B2B`) |
| Target sampling | `Target Sampling` (bisa diganti dengan env `SHEET_SAMPLING`) |

Nama bandara diambil dari sheet `Helper_Kode_Cabang` kalau ada. Kalau tidak ada, dashboard menampilkan kodenya saja.

Kredensial dibaca dari `.env` (`GOOGLE_SERVICE_ACCOUNT` dan `GOOGLE_SHEET_ID`), contohnya ada di `.env.example`. Spreadsheet harus dibagikan (Viewer) ke `client_email` service account.

### Cara pernyataan dikenali

Daftar pernyataan, urutannya, dan jumlahnya dibaca dari header sheet:

- header matriks Tally seperti `Pernyataan / Aspek yang Dinilai [teks]`, atau
- header bernomor seperti `3. teks` yang minimal 80% isinya skor 1 sampai 5.

Kalau satu pernyataan muncul di dua kolom (form B2B pernah berganti versi), kedua kolom digabung. Pertanyaan NPS tidak ikut dihitung sebagai skor Likert.

Sheet Tally tidak menyimpan nama bagian kuesioner (B. Reservasi, C. Keberangkatan, dan seterusnya). Nama bagian itu ada di `src/lib/survey-config.ts` dan dipakai untuk mengelompokkan pernyataan saja. Pernyataan baru yang belum terdaftar di sana tetap dihitung dan muncul di kelompok "Pernyataan lainnya".

## Perhitungan

```
Index = (Total skor ÷ Skor maksimum) × 5
Total skor    = jumlah semua skor 1–5 yang diberikan
Skor maksimum = jumlah jawaban × 5
```

Index bagian dan index keseluruhan memakai total skor semua pernyataan di dalamnya. Pertanyaan yang tidak dijawab tidak dihitung. Index dibulatkan ke 2 desimal sebelum kategorinya ditentukan.

Standar minimum (KPI) adalah 4,50 pada skala 1 sampai 5.

| Rentang index | Kategori | Status |
|---|---|---|
| ≤ 1,00 | Sangat tidak puas | Belum memenuhi standar |
| 1,01 – 2,00 | Tidak puas | Belum memenuhi standar |
| 2,01 – 3,00 | Cukup / netral | Belum memenuhi standar |
| 3,01 – 4,49 | Puas | Perlu peningkatan / belum memenuhi standar |
| 4,50 – 5,00 | Sangat puas | Memenuhi standar KPI |

Aturan ini ada di `src/lib/scoring.ts`.
