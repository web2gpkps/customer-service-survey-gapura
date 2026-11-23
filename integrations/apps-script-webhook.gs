/**
 * Webhook sinkronisasi Tindak Lanjut (Google Apps Script).
 *
 * Fungsi: begitu ada respons survei baru masuk, memanggil dashboard supaya sheet "Tracking Follow Up Index CSS JOUMPA"
 * terbarui hampir seketika. Tanpa ini sinkronisasi tetap berjalan saat halaman Tindak Lanjut dibuka (maksimal sekali per 60 detik).
 *
 * Pemasangan (sekali saja, oleh pemilik sheet survei "CSS JOUMPA (Responses)"):
 *  1. Buka sheet survei, menu Ekstensi > Apps Script, tempel isi berkas ini, simpan.
 *  2. Pengaturan proyek (ikon roda gigi) > Properti skrip > tambahkan dua properti:
 *       SYNC_URL   = https://<domain-dashboard>/api/tindak-lanjut/sync
 *       SYNC_TOKEN = nilai FOLLOWUP_SYNC_TOKEN dari environment Vercel (jangan ditulis di kode ini)
 *  3. Jalankan fungsi pasangPemicu() satu kali dan setujui izinnya.
 *
 * Pemicu "saat ada perubahan" dibatasi di sini: panggilan digabung (maksimal satu kali per 10 detik) agar kuota Apps Script
 * dan Vercel tidak terpakai sia-sia. Server juga punya gerbang waktu sendiri.
 */

function pasangPemicu() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'kirimSinyal'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('kirimSinyal').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
}

function kirimSinyal() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SYNC_URL');
  var token = props.getProperty('SYNC_TOKEN');
  if (!url || !token) return;

  // Gabungkan rentetan perubahan beruntun (mis. Tally menulis beberapa sel) menjadi satu panggilan.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  try {
    var now = Date.now();
    var last = Number(props.getProperty('TERAKHIR') || 0);
    if (now - last < 10000) return;
    props.setProperty('TERAKHIR', String(now));
  } finally {
    lock.releaseLock();
  }

  // Beri jeda singkat supaya penulisan baris respons selesai sebelum dashboard membaca sheet.
  Utilities.sleep(4000);
  UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'x-sync-token': token },
    muteHttpExceptions: true,
  });
}
