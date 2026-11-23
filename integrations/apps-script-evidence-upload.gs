/**
 * Penerima unggahan evidence Tindak Lanjut (Google Apps Script Web App).
 *
 * Berjalan SEBAGAI AKUN GOOGLE PEMILIK (bukan service account) dan hanya menulis ke satu folder Drive tetap.
 * Dashboard mengirim berkas (base64) dan token rahasia; skrip ini membuat berkas di folder lalu membalas tautannya.
 *
 * Pemasangan (sekali saja, oleh pemilik folder Drive):
 *  1. script.google.com > Proyek baru, tempel isi berkas ini, simpan.
 *  2. Pengaturan proyek (roda gigi) > Properti skrip > tambahkan:
 *       FOLDER_ID    = ID folder Drive tujuan (bagian URL setelah /folders/)
 *       UPLOAD_TOKEN = nilai EVIDENCE_UPLOAD_TOKEN dari environment dashboard (jangan ditulis di kode ini)
 *  3. Terapkan > Deployment baru > jenis "Aplikasi web":
 *       Jalankan sebagai: Saya (akun pemilik)   |   Yang memiliki akses: Siapa saja
 *     Setujui izin Drive, lalu salin "URL aplikasi web" ke EVIDENCE_UPLOAD_URL di environment dashboard.
 *  4. Setiap mengubah kode: Terapkan > Kelola deployment > ikon pensil > Versi baru > Terapkan (URL tetap sama).
 */

var MAX_BASE64 = 15 * 1024 * 1024; // sekitar 11 MB berkas asli
var ALLOWED = {
  'application/pdf': 1, 'application/msword': 1, 'text/plain': 1, 'application/rtf': 1,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1,
  'application/vnd.oasis.opendocument.text': 1,
  'image/jpeg': 1, 'image/png': 1, 'image/gif': 1, 'image/webp': 1, 'image/heic': 1,
  'application/vnd.ms-powerpoint': 1,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 1,
  'application/vnd.ms-excel': 1,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 1,
  'text/csv': 1
};

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('UPLOAD_TOKEN');
    var folderId = props.getProperty('FOLDER_ID');
    var body = JSON.parse(e.postData.contents);

    if (!token || !folderId || body.token !== token) return reply({ ok: false, error: 'Token tidak sah.' });
    var name = String(body.fileName || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    var mime = String(body.mimeType || '');
    var data = String(body.dataBase64 || '');
    if (!name || !ALLOWED[mime]) return reply({ ok: false, error: 'Jenis berkas tidak diizinkan.' });
    if (!data || data.length > MAX_BASE64) return reply({ ok: false, error: 'Ukuran berkas tidak valid.' });

    var blob = Utilities.newBlob(Utilities.base64Decode(data), mime, name);
    var file = DriveApp.getFolderById(folderId).createFile(blob);
    return reply({ ok: true, url: file.getUrl(), id: file.getId(), name: file.getName() });
  } catch (err) {
    return reply({ ok: false, error: 'Skrip gagal menyimpan berkas.' });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
