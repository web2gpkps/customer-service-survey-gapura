import { after } from "next/server";
import { clientIp, isGuessBlocked, recordMiss } from "@/lib/guess-limit";
import { safeEqual } from "@/lib/session";
import { syncTracker } from "@/lib/followup/sync";

export const dynamic = "force-dynamic";

/**
 * Webhook untuk Google Apps Script di sheet survei: dipanggil begitu ada respons baru agar sheet tracker terbarui
 * hampir seketika, tanpa polling. Dijaga token rahasia (FOLLOWUP_SYNC_TOKEN). Balasan segera 202; sinkronisasi berjalan
 * sesudahnya dan dibatasi satu kali per 5 detik.
 */
export async function POST(request: Request) {
  const expected = process.env.FOLLOWUP_SYNC_TOKEN?.trim();
  if (!expected || expected.length < 24) return new Response("Webhook belum dikonfigurasi.", { status: 503 });

  const ip = clientIp(request.headers);
  if (isGuessBlocked(ip)) return new Response("Terlalu banyak percobaan.", { status: 429 });

  const given = request.headers.get("x-sync-token") ?? "";
  if (!given || !(await safeEqual(given, expected))) {
    recordMiss(ip);
    return new Response("Token tidak sah.", { status: 401 });
  }

  after(async () => {
    await syncTracker({ minIntervalMs: 5_000, fresh: true });
  });
  return Response.json({ ok: true }, { status: 202 });
}

export const GET = () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
