import { buildExportResponse } from "@/lib/export/handler";
import { clientIp, isGuessBlocked, recordMiss } from "@/lib/guess-limit";
import { isReportLink } from "@/lib/report-link";
import { getLink, isDead } from "@/lib/share-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number) =>
  new Response("Tidak diizinkan.", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Export PDF untuk pemegang link laporan. Cakupan diambil dari link yang tersimpan di server, bukan dari URL,
 * sehingga filter tidak bisa diubah. Excel tidak tersedia (berisi salinan seluruh sheet Tally).
 */
export async function GET(request: Request, { params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const ip = clientIp(request.headers);
  if (isGuessBlocked(ip)) return deny(429);
  let link;
  try {
    link = await getLink(kode);
  } catch {
    return deny(503);
  }
  if (!isReportLink(link) || isDead(link)) {
    recordMiss(ip);
    return deny(401);
  }
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "pdf-slide") return deny(400);

  const locked = new URL(request.url);
  locked.search = `?format=${format}&${link.scope ?? ""}`;
  return buildExportResponse(new Request(locked, { headers: request.headers }));
}
