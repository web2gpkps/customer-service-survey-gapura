import { after } from "next/server";
import { getRole } from "@/lib/followup/auth";
import { syncTracker } from "@/lib/followup/sync";
import { loadView } from "@/lib/followup/view";

export const dynamic = "force-dynamic";

/**
 * Polling ringan dari browser. Balasan 304 (tanpa isi) bila data tidak berubah. Sinkronisasi ke Google Sheet
 * dijalankan di belakang layar dan dibatasi satu kali per 60 detik untuk seluruh pengguna.
 */
export async function GET(request: Request) {
  if (!(await getRole())) return new Response("Perlu login.", { status: 401, headers: { "Cache-Control": "no-store" } });

  after(async () => {
    await syncTracker({ minIntervalMs: 60_000 });
  });

  try {
    const view = await loadView();
    const etag = `"${view.version}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return Response.json(view, { headers });
  } catch (err) {
    console.error("Gagal memuat data tindak lanjut:", err);
    return Response.json({ error: "Gagal memuat data." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
