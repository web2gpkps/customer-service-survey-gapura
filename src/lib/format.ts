import type { Filters } from "./filters";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatDate(iso: string, long = false) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${d ? `${d} ` : ""}${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function formatMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function formatDateTime(iso: string) {
  const s = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
  return `${s} WIB`;
}

/** "CGK · Cengkareng" bila nama bandara ada di sheet Helper_Kode_Cabang. */
export function stationLabel(code: string, airports: Record<string, string>) {
  const name = airports[code]?.split(",")[0];
  return name ? `${code} · ${name}` : code;
}


export function describeFilters(f: Filters, airports: Record<string, string>): string {
  const parts = [
    f.month.length && f.month.map(formatMonth).join(", "),
    f.station.length && f.station.map((s) => stationLabel(s, airports)).join(", "),
    f.service.length && f.service.join(", "),
    f.institution.length && f.institution.join(", "),
    f.kpi.length === 1 && (f.kpi[0] === "met" ? "Memenuhi standar KPI" : "Belum memenuhi standar KPI"),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Semua periode, bandara, dan layanan";
}
