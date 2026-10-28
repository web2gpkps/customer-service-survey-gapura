import { buildExcel } from "@/lib/export/excel";
import { buildPdf } from "@/lib/export/pdf";
import { parseScope } from "@/lib/filters";
import { getDashboardData } from "@/lib/sheets";
import { SEGMENT_META } from "@/lib/survey-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requested = params.get("format");
  const format = requested === "xlsx" ? "xlsx" : "pdf";
  const landscape = requested === "pdf-landscape";
  const scope = parseScope(params);

  try {
    const data = await getDashboardData();
    const body = format === "xlsx" ? await buildExcel(data, scope) : buildPdf(data, scope, landscape ? "landscape" : "portrait");
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date(data.fetchedAt));
    const name = `JOUMPA-CSS-Survey-${scope.segments.map((s) => SEGMENT_META[s].label).join("-")}-${stamp}${landscape ? "-Slide" : ""}.${format}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type":
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Export gagal: ${message}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
