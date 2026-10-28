import { isAdmin } from "@/lib/admin";
import { buildExportResponse } from "@/lib/export/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Export dari dashboard utama: hanya admin. Proxy sudah menjaga, pemeriksaan ini lapisan kedua. */
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return new Response("Perlu login admin.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return buildExportResponse(request);
}
