import { CLOSED_STATUSES, type FollowupItem, type Status } from "@/lib/followup/types";

/** Tanggal hari ini menurut WIB (YYYY-MM-DD), sama dengan yang dipakai server dan rumus sheet. */
export const todayWib = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

export const isClosed = (s: Status) => CLOSED_STATUSES.includes(s);

export const isOverdue = (i: FollowupItem, today = todayWib()) => !isClosed(i.status) && !!i.target && i.target < today;

export const daysUntil = (iso: string, today = todayWib()): number =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export const PRIORITY_RANK: Record<string, number> = { Tinggi: 0, Sedang: 1, Rendah: 2 };

export const PRIORITY_TONE: Record<string, { mark: string; text: string; wash: string }> = {
  Tinggi: { mark: "bg-crit-mark", text: "text-crit", wash: "bg-crit-wash" },
  Sedang: { mark: "bg-warn-mark", text: "text-warn", wash: "bg-warn-wash" },
  Rendah: { mark: "bg-line-strong", text: "text-ink-2", wash: "bg-sunken" },
};

export const STATUS_TONE: Record<Status, { dot: string; text: string }> = {
  "Dalam pemantauan": { dot: "bg-warn-mark", text: "text-warn" },
  "Dalam proses": { dot: "bg-lk5", text: "text-lk5" },
  Selesai: { dot: "bg-good-mark", text: "text-good" },
  "Tidak perlu tindak lanjut": { dot: "bg-line-strong", text: "text-muted" },
};

/** Urutan default: terlambat lebih dulu, lalu prioritas, lalu target terdekat. */
export function byUrgency(a: FollowupItem, b: FollowupItem, today = todayWib()): number {
  const oa = isOverdue(a, today) ? 0 : 1;
  const ob = isOverdue(b, today) ? 0 : 1;
  if (oa !== ob) return oa - ob;
  const ca = isClosed(a.status) ? 1 : 0;
  const cb = isClosed(b.status) ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return (a.target || "9999").localeCompare(b.target || "9999") || b.date.localeCompare(a.date);
}

export const byNewest = (a: FollowupItem, b: FollowupItem) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

export const formatIdx = (n: number | null) =>
  n === null ? "-" : n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
