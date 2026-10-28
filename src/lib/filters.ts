import { meetsKpi, npsGroupId, type Response } from "./scoring";
import { SEGMENT_IDS, type Segment } from "./survey-config";

export type KpiValue = "met" | "unmet";

/** Setiap filter pilihan ganda; daftar kosong berarti semua. Instansi hanya berlaku di B2B. */
export interface Filters {
  month: string[]; // YYYY-MM
  station: string[];
  service: string[];
  institution: string[]; // nama instansi (huruf besar/kecil tidak dibedakan)
  kpi: KpiValue[];
}

export const EMPTY_FILTERS: Filters = { month: [], station: [], service: [], institution: [], kpi: [] };

export const KPI_OPTIONS = [
  { value: "met", label: "Memenuhi standar (≥ 4,50)" },
  { value: "unmet", label: "Belum memenuhi (< 4,50)" },
] as const;

/** Index satu responden = rata-rata semua pernyataan yang dijawab. */
function respondentIndex(r: Response): number | null {
  const answered = r.scores.filter((s): s is number => s !== null);
  return answered.length ? answered.reduce((a, b) => a + b, 0) / answered.length : null;
}

const matches = (selected: string[], value: string) => !selected.length || selected.includes(value);

export function applyFilters(responses: Response[], f: Filters) {
  return responses.filter(
    (r) =>
      (!f.month.length || f.month.some((m) => r.date.startsWith(m))) &&
      matches(f.station, r.station) &&
      (!f.service.length || r.services.some((s) => f.service.includes(s))) &&
      (!f.institution.length || f.institution.some((i) => npsGroupId(i) === npsGroupId(r.institution))) &&
      (f.kpi.length !== 1 || meetsKpi(respondentIndex(r)) === (f.kpi[0] === "met")),
  );
}

export const hasFilters = (f: Filters) => Object.values(f).some((v) => v.length > 0);

/** Opsi filter instansi (B2B): huruf besar/kecil digabung, label memakai ejaan yang paling sering muncul. */
export function institutionOptions(responses: Response[]): { value: string; label: string }[] {
  const groups = new Map<string, Map<string, number>>();
  for (const r of responses) {
    const raw = r.institution.trim().replace(/\s+/g, " ");
    if (!raw) continue;
    const spellings = groups.get(npsGroupId(raw)) ?? new Map<string, number>();
    spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
    groups.set(npsGroupId(raw), spellings);
  }
  return [...groups.entries()]
    .map(([, sp]) => [...sp.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .map((label) => ({ value: label, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

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
   ?segmen=b2c,b2b&b2c.periode=2026-09&b2b.bandara=CGK&b2b.bandara=SUB&konten=ringkasan,bagian
   Filter pilihan ganda memakai parameter berulang (nama bandara/instansi bisa memuat koma). */

const PARAM: Record<keyof Filters, string> = {
  month: "periode",
  station: "bandara",
  service: "layanan",
  institution: "instansi",
  kpi: "kpi",
};

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
      for (const v of q.filters[seg][key]) params.append(`${seg}.${PARAM[key]}`, v);
    }
  }
  if (q.content.length < ALL_CONTENT.length) params.set("konten", q.content.join(","));
  return params.toString();
}

/** Batas parameter URL: 100 nilai per filter, 120 karakter per nilai. */
const MAX_PARAM_VALUES = 100;
const MAX_PARAM_LENGTH = 120;

export function parseScope(sp: Record<string, string | string[] | undefined> | URLSearchParams): ReportScope {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return ((Array.isArray(v) ? v[0] : v)?.trim() ?? "").slice(0, MAX_PARAM_LENGTH);
  };
  const getAll = (k: string): string[] => {
    const v = sp instanceof URLSearchParams ? sp.getAll(k) : (sp[k] ?? []);
    const list = (Array.isArray(v) ? v : [v]).map((x) => x.trim().slice(0, MAX_PARAM_LENGTH)).filter(Boolean);
    return [...new Set(list)].slice(0, MAX_PARAM_VALUES);
  };
  const segments = get("segmen")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Segment => (SEGMENT_IDS as string[]).includes(s));
  const filters = Object.fromEntries(
    SEGMENT_IDS.map((seg) => [
      seg,
      {
        month: getAll(`${seg}.${PARAM.month}`),
        station: getAll(`${seg}.${PARAM.station}`),
        service: getAll(`${seg}.${PARAM.service}`),
        institution: getAll(`${seg}.${PARAM.institution}`),
        kpi: getAll(`${seg}.${PARAM.kpi}`).filter((x): x is KpiValue => x === "met" || x === "unmet"),
      },
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

export type ExportFormat = "pdf" | "pdf-slide" | "xlsx";

export const exportUrl = (scope: ReportScope, format: ExportFormat) =>
  `/api/export?format=${format}&${scopeToSearch(scope)}`;
