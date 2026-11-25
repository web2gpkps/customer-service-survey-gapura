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
| `/akses-cabang` | Share Akses Cabang (admin): dashboard yang sama plus target sampling semua cabang, dan tombol **Bagikan akses cabang**. |
| `/cabang/<kode>` | Halaman untuk cabang dari link yang dibagikan. Tanpa login; hanya halaman ini yang terbuka. |
| `/login` | Login admin. |
| `/tindak-lanjut` | Tindak Lanjut feedback: kritik, saran, dan skor rendah dari penumpang dan mitra dipantau sampai selesai. Tiga tingkat password (lihat bagian **Tindak Lanjut**). |
| `/p/<kode>` | Laporan satu halaman yang hanya bisa dibaca. Link-nya dibuat dari tombol **Bagikan**; bisa diputus dan punya masa berlaku. Tanpa login. |
| `/api/export` | Unduh PDF (`format=pdf`) atau Excel (`format=xlsx`). |

Tombol **Bagikan** dan **Export** membuka pilihan yang sama: segmen (B2C, B2B, atau keduanya), filter periode, bandara, dan jenis layanan per segmen, lalu konten yang disertakan. Pilihan export tersimpan di URL, misalnya:

```
/api/export?format=xlsx&segmen=b2c&b2c.periode=2026-09
```

Tombol **Bagikan** membuat link `/p/<kode>` (kode acak 12 karakter) dengan mekanisme yang sama seperti link akses cabang: pilih masa berlaku (7, 30, 90 hari, atau tanpa batas), **Buat link**, lalu **Putus** kapan saja dan **Hapus** (atau **Hapus semua yang tidak aktif**) untuk link yang sudah mati. Pilihan data dikunci di server saat link dibuat, jadi penerima tidak bisa mengubah filter lewat URL. Penerima hanya bisa mengunduh PDF (tanpa Excel). Link disimpan di penyimpanan yang sama dengan link cabang.

## Akses cabang

Cara kerjanya sama dengan AIRLINE CSS Survey Dashboard. Tombol **Share Akses Cabang** di sebelah **Bagikan** membuka `/akses-cabang`. Klik **Bagikan akses cabang**, pilih masa berlaku (7, 30, 90 hari, atau tanpa batas), lalu **Buat link**. Link berbentuk `/cabang/<kode>` (kode acak 12 karakter) dan bisa disalin, dikirim lewat WhatsApp atau Email.

- Satu link berlaku untuk semua cabang. Penerima melihat dashboard dan target sampling (bisa difilter per bandara), tanpa tombol Export atau Bagikan.
- Penerima tidak bisa membuka halaman utama, export, atau `/akses-cabang`; semuanya meminta login admin.
- Link bisa **Putus** kapan saja. Link yang diputus atau kedaluwarsa bisa **Hapus** dari daftar, atau **Hapus semua yang tidak aktif**.
- Penyimpanan: Upstash Redis (`UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`, atau `KV_REST_API_URL` dan `KV_REST_API_TOKEN` dari Vercel Marketplace). Wajib di produksi. Lokal memakai berkas `.data/share-links.json`. Kunci di Redis berawalan `joumpa:`.
- Tebakan kode salah dibatasi 20 kali per 10 menit per IP.

### Login admin

Halaman utama, `/api/export`, dan `/akses` dikunci dengan password. Atur `ADMIN_PASSWORD` dan `AUTH_SECRET` di `.env` (dan di environment Vercel). Tanpa keduanya halaman admin tidak bisa dibuka. Link laporan (`/p/<kode>`) dan link cabang tetap terbuka tanpa login selama kodenya masih berlaku.

Dashboard mengambil ulang data tiap 2 menit selama halaman terbuka, laporan tiap 5 menit. Server menyimpan hasil ambil data selama 60 detik; tombol **Muat ulang** melewati simpanan itu.

## Tindak Lanjut

Tombol **Tindak Lanjut** di header membuka `/tindak-lanjut`. Halaman ini memantau semua jawaban yang perlu ditindaklanjuti sampai selesai. Datanya disimpan di Google Sheet **Tracking Follow Up Index CSS JOUMPA** (env `TRACKER_SHEET_ID`; tab `B2C`, `B2B`, `Rekap`), jadi tampilan web dan Sheet selalu sama. Sheet survei tetap hanya-baca; hanya sheet tracker yang ditulis, dan service account harus berstatus **Editor** di sana.

**Tiga tingkat password**

| Peran | Password | Bisa |
|---|---|---|
| Admin | `FOLLOWUP_ADMIN_PASSWORD` | Semua fitur menu ini |
| Management | `FOLLOWUP_MANAGER_PASSWORD` | Melihat dan mengisi (status, PIC, tindakan, target, klasifikasi) |
| Lihat saja | `FOLLOWUP_VIEWER_PASSWORD` | Hanya melihat; penolakan juga dicek di server |

Menu ini **selalu meminta password**, termasuk bagi yang sudah login admin di dashboard utama: sesi admin dashboard tidak otomatis membuka Tindak Lanjut. Setelah password benar, sesi menu berlaku 12 jam. Password dashboard CSS JOUMPA (`ADMIN_PASSWORD`) **tidak** bisa membuka menu ini, dan tiga password menu tidak bisa membuka dashboard. Ketiga password menu harus berbeda satu sama lain dan dari `ADMIN_PASSWORD`; password menu yang sama dengan `ADMIN_PASSWORD` diabaikan oleh server. Cookie Management dan Lihat saja ditandatangani dengan kunci turunan, jadi tidak pernah sah sebagai sesi admin.

**Aturan otomatis** (kode di `src/lib/followup/classify.ts`, ditampilkan juga di halaman)

- Perlu ditindaklanjuti bila: index jawaban di bawah 4,50 (rata-rata semua butir dari satu responden), menjawab pernah mengalami kendala atau teks berisi keluhan, skor rekomendasi 6 atau kurang, atau ada kritik atau saran di kolom teks.
- Prioritas **Tinggi** (target 3 hari): kendala atau keluhan, skor rekomendasi 6 atau kurang, index di bawah 4,00, atau dua butir atau lebih bernilai 3 atau kurang. **Sedang** (14 hari): sisanya yang perlu ditindaklanjuti, termasuk satu butir bernilai 3 atau kurang. Rumus Target Selesai di sheet sama: tanggal survei + 3 atau 14 hari.
- Selain itu dibaca **apresiasi** dan tampil di tab Apresiasi (belum masuk sheet). Bila salah baca, buka jawabannya lalu **Jadikan tindak lanjut**. Klasifikasi item yang sudah ada juga bisa diubah (bacaan awal sistem tersimpan di kolom `Klasifikasi Sistem`).

**Kategori isu = bagian kuesioner**, sama dengan "Index per bagian layanan" (B2C: Reservasi, Keberangkatan, Transit / Transfer, Kedatangan, Penanganan kendala, Keamanan, Kepuasan keseluruhan; B2B: Reservasi & koordinasi, Operasional & SLA, Komunikasi real-time, Irregularity & komplain, Pelaporan & administrasi, Hubungan kemitraan; ditambah Lainnya). Sistem memilihnya dari: jawaban kendala atau keluhan (bagian penanganan kendala), lalu bagian dengan butir bernilai rendah terbanyak, lalu bagian dengan rata-rata skor terendah, dan untuk teks tanpa skor rendah dari kata kunci (kode di `src/lib/followup/sections.ts`). Dapat diubah lewat menu **Ubah Status Klasifikasi** di bagian atas panel item.

**Upload Evidence.** Di panel item (Admin dan Management) ada menu lipat **Upload Evidence**: pilih Dokumen, Gambar, PPT, atau Excel (maksimal 5 berkas sekali simpan, 10 MB per berkas), isi judul per berkas, lalu **Simpan perubahan**. Selama unggahan berjalan tampil animasi memuat; setelah selesai muncul popup **Tindak Lanjut & Evidence tersimpan** (harus klik Oke), atau **Upload Evidence Gagal Tersimpan** dengan tombol **Upload Ulang**. Nama berkas di Drive: `ID_Tanggal_Bandara_Judul.ext`. Tautan berkas dicatat di kolom `Link Evidence` sheet tracker. Isi berkas diperiksa tanda tangannya (bukan sekadar ekstensi), tipe `exe`/makro ditolak. Berkas disimpan memakai akun Google pemilik lewat Apps Script Web App (`integrations/apps-script-evidence-upload.gs`, langkah pemasangan ada di berkas itu), bukan service account. Env: `EVIDENCE_UPLOAD_URL` dan `EVIDENCE_UPLOAD_TOKEN`.

**Versi ringkas dan lengkap.** Daftar menampilkan ringkasan satu kalimat. Klik satu item untuk melihat jawaban asli langsung dari penumpang (nama, nomor HP, semua teks, butir bernilai rendah) dan formulir tindak lanjut. Email tidak ditampilkan karena formulir Tally tidak menanyakannya. Nama dan nomor HP hanya dimuat saat item dibuka dan tidak pernah ikut di data daftar, export, atau link bagikan.

**Sinkronisasi otomatis, hemat kuota.** Tidak ada cron dan tidak ada polling berat.

- Saat halaman dibuka dan lewat polling browser (tiap 60 detik, berhenti saat tab disembunyikan, balasan 304 bila tidak berubah), server menyinkronkan survei ke sheet tracker. Gerbang waktu membatasi satu kali per 60 detik untuk seluruh pengguna, dan satu kunci terdistribusi (Upstash) mencegah dua sinkronisasi berjalan bersamaan.
- Sheet tracker terbarui hampir seketika lewat webhook: pasang `integrations/apps-script-webhook.gs` di sheet survei (langkahnya ada di berkas itu). Webhook dijaga token `FOLLOWUP_SYNC_TOKEN` dan dibatasi satu kali per 5 detik.
- Satu putaran hanya 2 pembacaan dan, bila ada item baru, 3 sampai 4 penulisan berkelompok. Sinkronisasi hanya menambah baris dan menautkan ID respons; isian management tidak pernah ditimpa. Semua nilai ditulis dengan mode RAW sehingga teks responden tidak pernah menjadi rumus Sheets.
- Sheet tracker memuat kolom tambahan `ID Respons`, `Klasifikasi Sistem`, `Diubah Oleh`, `Terakhir Diubah`, `Riwayat Perubahan`, `Catatan Sinkron`, `Link Evidence`. Penyimpanan kunci gerbang memakai Upstash yang sama dengan link cabang (awalan `joumpa:followup:`); tanpa Upstash (lokal) memakai memori proses.

Opsional: `TRACKER_TAB_B2C`, `TRACKER_TAB_B2B`, `TRACKER_TAB_REKAP` mengganti nama tab tracker (dipakai untuk uji pada tab salinan).

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
