import type { Response } from "./scoring";
import { SEGMENT_IDS, type Segment } from "./survey-config";

export interface Filters {
  month: string; // YYYY-MM
  station: string;
  service: string;
}

export const EMPTY_FILTERS: Filters = { month: "", station: "", service: "" };

export function applyFilters(responses: Response[], f: Filters) {
  return responses.filter(
    (r) =>
      (!f.month || r.date.startsWith(f.month)) &&
      (!f.station || r.station === f.station) &&
      (!f.service || r.services.includes(f.service)),
  );
}

export const hasFilters = (f: Filters) => Boolean(f.month || f.station || f.service);

/* ── Konten laporan yang bisa dipilih saat berbagi / export ── */

export const CONTENT_OPTIONS = [
  { key: "ringkasan", label: "Ringkasan index" },
  { key: "bagian", label: "Index per bagian" },
  { key: "prioritas", label: "Pernyataan skor terendah" },
  { key: "tren", label: "Tren mingguan" },
  { key: "rincian", label: "Rincian per pernyataan" },
  { key: "responden", label: "Kata responden" },
  { key: "standar", label: "Standar KPI & cara hitung" },
] as const;

export type ContentKey = (typeof CONTENT_OPTIONS)[number]["key"];
export const ALL_CONTENT: ContentKey[] = CONTENT_OPTIONS.map((c) => c.key);

/* ── Cakupan data: dipakai link presentasi dan export ──
   ?segmen=b2c,b2b&b2c.periode=2026-09&b2b.bandara=CGK&konten=ringkasan,bagian */

const PARAM: Record<keyof Filters, string> = { month: "periode", station: "bandara", service: "layanan" };

export interface ReportScope {
  segments: Segment[];
  filters: Record<Segment, Filters>;
  content: ContentKey[];
}

export function scopeToSearch(q: ReportScope): string {
  const params = new URLSearchParams();
  params.set("segmen", q.segments.join(","));
  for (const seg of q.segments) {
    for (const key of Object.keys(PARAM) as (keyof Filters)[]) {
      const v = q.filters[seg][key];
      if (v) params.set(`${seg}.${PARAM[key]}`, v);
    }
  }
  if (q.content.length < ALL_CONTENT.length) params.set("konten", q.content.join(","));
  return params.toString();
}

export function parseScope(sp: Record<string, string | string[] | undefined> | URLSearchParams): ReportScope {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const segments = get("segmen")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Segment => (SEGMENT_IDS as string[]).includes(s));
  const filters = Object.fromEntries(
    SEGMENT_IDS.map((seg) => [
      seg,
      { month: get(`${seg}.${PARAM.month}`), station: get(`${seg}.${PARAM.station}`), service: get(`${seg}.${PARAM.service}`) },
    ]),
  ) as Record<Segment, Filters>;
  const content = get("konten")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ContentKey => (ALL_CONTENT as string[]).includes(s));
  return {
    segments: segments.length ? SEGMENT_IDS.filter((s) => segments.includes(s)) : [...SEGMENT_IDS],
    filters,
    content: content.length ? ALL_CONTENT.filter((c) => content.includes(c)) : [...ALL_CONTENT],
  };
}

export type ExportFormat = "pdf" | "pdf-landscape" | "xlsx";

export const exportUrl = (scope: ReportScope, format: ExportFormat) =>
  `/api/export?format=${format}&${scopeToSearch(scope)}`;
