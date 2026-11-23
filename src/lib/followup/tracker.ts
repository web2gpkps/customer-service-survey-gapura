/**
 * Akses ke sheet "Tracking Follow Up Index CSS JOUMPA" (terpisah dari sheet survei, yang tetap hanya-baca).
 * Sheet ini satu-satunya penyimpanan data tindak lanjut, jadi tampilan web dan Google Sheet selalu sama.
 *
 * Aturan keamanan penulisan:
 * - Semua nilai ditulis dengan mode RAW (tidak ditafsirkan Sheets): teks responden yang diawali = + - @ tidak pernah menjadi
 *   rumus, dan teks seperti "1/2" atau "10 November" tidak berubah menjadi tanggal. Hanya rumus Target Selesai milik sistem
 *   yang ditulis sebagai rumus.
 * - Sebelum mengubah satu baris, ID di baris itu dibaca ulang dan dicocokkan, supaya baris yang bergeser tidak tertimpa.
 */
import { JWT } from "google-auth-library";
import { getServiceAccount, getTrackerSheetId } from "../credentials";
import {
  ALL_CATEGORIES,
  EVIDENCE_SEP,
  categoriesFor,
  type EvidenceEntry,
  CLASSES,
  COL,
  COLS,
  LAST_COL_LETTER,
  PRIORITIES,
  QUOTE_MARK,
  SEGMENT_PREFIX,
  STATUSES,
  type FollowupItem,
  type Priority,
  type Segment,
  type Status,
} from "./types";

/** Nama tab di sheet tracker. Bisa diganti lewat env (dipakai untuk uji pada tab salinan). */
const SHEET_TAB: Record<Segment, string> = {
  b2c: process.env.TRACKER_TAB_B2C?.trim() || "B2C",
  b2b: process.env.TRACKER_TAB_B2B?.trim() || "B2B",
};
const REKAP_TAB = process.env.TRACKER_TAB_REKAP?.trim() || "Rekap";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_ROWS = 5000;

/* ---------- jaringan ---------- */

let jwt: JWT | null = null;

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const account = getServiceAccount();
  jwt ??= new JWT({ email: account.client_email, key: account.private_key, scopes: [SCOPE] });
  const { token } = await jwt.getAccessToken();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}/${getTrackerSheetId()}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    // 429 dan 5xx dicoba ulang dengan jeda bertambah; selain itu langsung gagal.
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }
  if (lastStatus === 403) throw new Error("Service account belum berstatus Editor di sheet tracker.");
  if (lastStatus === 404) throw new Error("Sheet tracker tidak ditemukan. Periksa TRACKER_SHEET_ID.");
  throw new Error(`Google Sheets API ${lastStatus}`);
}

/* ---------- konversi nilai ---------- */

const SERIAL_EPOCH = 25569; // 1970-01-01 dalam serial Google Sheets
export const isoToSerial = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000) + SERIAL_EPOCH;
export const serialToIso = (n: number): string => new Date((Math.round(n) - SERIAL_EPOCH) * 86_400_000).toISOString().slice(0, 10);

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, aug: 8, ags: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

/** Sel tanggal bisa berupa serial (angka), teks "10 Nov 2026", atau "2026-11-10". */
export function toIsoDate(v: unknown): string {
  if (typeof v === "number" && v > 30_000 && v < 80_000) return serialToIso(v);
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bool = (v: unknown) => v === true || /^true$/i.test(str(v));
const numOrNull = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const todayWib = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const stampWib = (d = new Date()) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(d)
    .replace(",", "")
    .replace(/\./g, ":");

/* ---------- baca ---------- */

export function parseRow(segment: Segment, rowNumber: number, c: unknown[]): FollowupItem {
  const g = (name: (typeof COLS)[number]) => c[COL[name]];
  const raw = str(g("Ringkasan Feedback"));
  const cut = raw.indexOf(QUOTE_MARK);
  const status = str(g("Status")) as Status;
  return {
    segment,
    id: str(g("ID")).trim(),
    row: rowNumber,
    responseId: str(g("ID Respons")).trim(),
    date: toIsoDate(g("Tanggal Survei")),
    station: str(g("Bandara")).trim().toUpperCase(),
    klass: str(g("Klasifikasi")),
    priority: str(g("Prioritas")),
    category: str(g("Kategori Isu")),
    summary: (cut >= 0 ? raw.slice(0, cut) : raw).trim(),
    quote: cut >= 0 ? raw.slice(cut + QUOTE_MARK.length).trim() : "",
    status: (STATUSES as readonly string[]).includes(status) ? status : "Dalam pemantauan",
    pic: str(g("PIC")),
    action: str(g("Tindakan Follow Up")),
    target: toIsoDate(g("Target Selesai")),
    done: toIsoDate(g("Tanggal Selesai")),
    contacted: bool(g("Pelanggan Dihubungi")),
    nps: numOrNull(g("Skor Rekomendasi (0–10)")),
    lowItems: str(g("Butir Skor ≤ 3")),
    services: str(g("Layanan")),
    channel: str(g("Kanal Reservasi")),
    context: str(g("Penerbangan / Instansi")),
    systemClass: str(g("Klasifikasi Sistem")),
    updatedBy: str(g("Diubah Oleh")),
    updatedAt: str(g("Terakhir Diubah")),
    history: str(g("Riwayat Perubahan")),
    note: str(g("Catatan Sinkron")),
    evidence: str(g("Link Evidence")),
  };
}

export interface TrackerSnapshot {
  items: FollowupItem[];
  /** Sel mentah per baris, dipakai untuk pemetaan baris lama. */
  raw: Record<Segment, { row: number; cells: unknown[] }[]>;
  schemaReady: boolean;
  nextRow: Record<Segment, number>;
  fetchedAt: number;
}

let snapshot: TrackerSnapshot | null = null;
const SNAPSHOT_TTL_MS = 10_000;
export const clearTrackerCache = () => {
  snapshot = null;
};

export async function readTracker(opts: { fresh?: boolean } = {}): Promise<TrackerSnapshot> {
  if (!opts.fresh && snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) return snapshot;
  const url = new URLSearchParams();
  for (const seg of ["b2c", "b2b"] as const) url.append("ranges", `'${SHEET_TAB[seg]}'!A2:${LAST_COL_LETTER}`);
  url.set("valueRenderOption", "UNFORMATTED_VALUE");
  url.set("dateTimeRenderOption", "SERIAL_NUMBER");
  const json = await call<{ valueRanges: { values?: unknown[][] }[] }>(`/values:batchGet?${url}`);

  const items: FollowupItem[] = [];
  const raw: TrackerSnapshot["raw"] = { b2c: [], b2b: [] };
  const nextRow = { b2c: 3, b2b: 3 };
  let schemaReady = true;
  (["b2c", "b2b"] as const).forEach((seg, k) => {
    const [header = [], ...body] = json.valueRanges[k]?.values ?? [];
    if (str(header[COL["ID Respons"]]) !== "ID Respons" || str(header[COL["Link Evidence"]]) !== "Link Evidence") schemaReady = false;
    body.forEach((cells, i) => {
      const rowNumber = i + 3;
      if (!str(cells[COL.ID]).trim()) return;
      raw[seg].push({ row: rowNumber, cells });
      items.push(parseRow(seg, rowNumber, cells));
      nextRow[seg] = rowNumber + 1;
    });
  });
  return (snapshot = { items, raw, schemaReady, nextRow, fetchedAt: Date.now() });
}

/* ---------- tulis ---------- */

export interface NewRow {
  segment: Segment;
  id: string;
  date: string;
  station: string;
  klass: string;
  priority: Priority;
  category: string;
  summary: string;
  quote: string;
  pic: string;
  nps: number | null;
  lowItems: string;
  services: string;
  channel: string;
  context: string;
  responseId: string;
  systemClass: string;
  note?: string;
}

function rowValues(r: NewRow): (string | number | boolean)[] {
  const v: (string | number | boolean)[] = new Array(COLS.length).fill("");
  v[COL.ID] = r.id;
  v[COL["Tanggal Survei"]] = isoToSerial(r.date);
  v[COL.Bandara] = r.station;
  v[COL.Klasifikasi] = r.klass;
  v[COL.Prioritas] = r.priority;
  v[COL["Kategori Isu"]] = r.category;
  v[COL["Ringkasan Feedback"]] = r.quote ? `${r.summary}${QUOTE_MARK} ${r.quote}` : r.summary;
  v[COL.Status] = "Dalam pemantauan";
  v[COL.PIC] = r.pic;
  v[COL["Pelanggan Dihubungi"]] = false;
  v[COL["Skor Rekomendasi (0–10)"]] = r.nps ?? "";
  v[COL["Butir Skor ≤ 3"]] = r.lowItems;
  v[COL.Layanan] = r.services;
  v[COL["Kanal Reservasi"]] = r.channel;
  v[COL["Penerbangan / Instansi"]] = r.context;
  v[COL["ID Respons"]] = r.responseId;
  v[COL["Klasifikasi Sistem"]] = r.systemClass;
  v[COL["Diubah Oleh"]] = "Sistem";
  v[COL["Terakhir Diubah"]] = new Date().toISOString();
  v[COL["Catatan Sinkron"]] = r.note ?? "";
  return v;
}

async function sheetIds(): Promise<Record<Segment, { id: number; rows: number }>> {
  const j = await call<{ sheets: { properties: { sheetId: number; title: string; gridProperties: { rowCount: number } } }[] }>(
    "?fields=sheets.properties(sheetId,title,gridProperties.rowCount)",
  );
  const out = {} as Record<Segment, { id: number; rows: number }>;
  for (const seg of ["b2c", "b2b"] as const) {
    const s = j.sheets.find((x) => x.properties.title === SHEET_TAB[seg]);
    if (!s) throw new Error(`Tab "${SHEET_TAB[seg]}" tidak ada di sheet tracker.`);
    out[seg] = { id: s.properties.sheetId, rows: s.properties.gridProperties.rowCount };
  }
  return out;
}

/** Tambah baris baru di akhir tabel. Mengembalikan baris pertama yang terisi. */
export async function appendRows(segment: Segment, rows: NewRow[]): Promise<number> {
  if (!rows.length) return 0;
  const snap = await readTracker({ fresh: true });
  const start = snap.nextRow[segment];
  const end = start + rows.length - 1;
  if (end > MAX_ROWS) throw new Error(`Tab ${SHEET_TAB[segment]} penuh (batas ${MAX_ROWS} baris).`);

  const ids = await sheetIds();
  const sheetId = ids[segment].id;
  const requests: unknown[] = [];
  if (end > ids[segment].rows) requests.push({ appendDimension: { sheetId, dimension: "ROWS", length: end - ids[segment].rows + 50 } });
  // Salin format dan dropdown dari baris contoh (baris 3) ke baris baru.
  const dest = { sheetId, startRowIndex: start - 1, endRowIndex: end, startColumnIndex: 0, endColumnIndex: COLS.length };
  const src = { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: COLS.length };
  requests.push({ copyPaste: { source: src, destination: dest, pasteType: "PASTE_FORMAT" } });
  requests.push({ copyPaste: { source: src, destination: dest, pasteType: "PASTE_DATA_VALIDATION" } });
  await call(":batchUpdate", { method: "POST", body: { requests } });

  const values = rows.map((r) => rowValues(r));
  await call(`/values/${encodeURIComponent(`'${SHEET_TAB[segment]}'!A${start}:${LAST_COL_LETTER}${end}`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: { range: `'${SHEET_TAB[segment]}'!A${start}:${LAST_COL_LETTER}${end}`, majorDimension: "ROWS", values },
  });
  // Rumus Target Selesai milik sistem, sama dengan baris lama: tanggal survei + 3 hari (Tinggi) atau 14 hari.
  const kRange = `'${SHEET_TAB[segment]}'!K${start}:K${end}`;
  await call(`/values/${encodeURIComponent(kRange)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: { range: kRange, majorDimension: "ROWS", values: rows.map((_, i) => [`=B${start + i}+IF(E${start + i}="Tinggi",3,14)`]) },
  });
  clearTrackerCache();
  return start;
}

export interface CellWrite {
  segment: Segment;
  row: number;
  col: (typeof COLS)[number];
  value: string | number | boolean;
  /** true = nilai adalah rumus milik sistem (USER_ENTERED); selain itu selalu RAW. */
  formula?: boolean;
}

/** Tulis banyak sel sekaligus. Nilai biasa memakai RAW; rumus sistem dikirim terpisah. */
export async function writeCells(writes: CellWrite[]): Promise<void> {
  if (!writes.length) return;
  const colLetter = (i: number) => String.fromCharCode(65 + i);
  const toData = (list: CellWrite[]) =>
    list.map((w) => ({ range: `'${SHEET_TAB[w.segment]}'!${colLetter(COL[w.col])}${w.row}`, values: [[w.value]] }));
  const plain = writes.filter((w) => !w.formula);
  const formulas = writes.filter((w) => w.formula);
  if (plain.length) await call("/values:batchUpdate", { method: "POST", body: { valueInputOption: "RAW", data: toData(plain) } });
  if (formulas.length) await call("/values:batchUpdate", { method: "POST", body: { valueInputOption: "USER_ENTERED", data: toData(formulas) } });
  clearTrackerCache();
}

/* ---------- ubah satu item (dipakai UI) ---------- */

export interface ItemPatch {
  status?: string;
  pic?: string;
  action?: string;
  target?: string;
  done?: string;
  contacted?: boolean;
  klass?: string;
  priority?: string;
  category?: string;
}

export class ConflictError extends Error {}
export class ValidationError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && s >= "2020-01-01" && s <= "2100-12-31";
/** Buang karakter kontrol (selain baris baru dan tab), rapikan baris baru, dan batasi panjang. */
const clean = (s: unknown, max: number) =>
  [...String(s ?? "").replace(/\r\n?/g, "\n")]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 || c === 10 || c === 9;
    })
    .join("")
    .trim()
    .slice(0, max);

/** Validasi input dari klien; hanya nilai yang dikenal yang lolos. */
export function validatePatch(input: unknown): ItemPatch {
  if (typeof input !== "object" || input === null) throw new ValidationError("Data tidak valid.");
  const p = input as Record<string, unknown>;
  const out: ItemPatch = {};
  const pick = (key: keyof ItemPatch, list: readonly string[], label: string) => {
    if (p[key] === undefined) return;
    if (typeof p[key] !== "string" || !list.includes(p[key] as string)) throw new ValidationError(`${label} tidak dikenal.`);
    (out as Record<string, unknown>)[key] = p[key];
  };
  pick("status", STATUSES, "Status");
  pick("priority", PRIORITIES, "Prioritas");
  pick("category", ALL_CATEGORIES, "Kategori");
  pick("klass", CLASSES, "Klasifikasi");
  if (p.pic !== undefined) out.pic = clean(p.pic, 80);
  if (p.action !== undefined) out.action = clean(p.action, 2000);
  for (const key of ["target", "done"] as const) {
    if (p[key] === undefined) continue;
    const v = String(p[key]);
    if (v !== "" && !validDate(v)) throw new ValidationError("Tanggal tidak valid.");
    out[key] = v;
  }
  if (p.contacted !== undefined) {
    if (typeof p.contacted !== "boolean") throw new ValidationError("Nilai dihubungi tidak valid.");
    out.contacted = p.contacted;
  }
  return out;
}

const FIELD_LABEL: Record<keyof ItemPatch, string> = {
  status: "Status",
  pic: "PIC",
  action: "Tindakan",
  target: "Target",
  done: "Selesai",
  contacted: "Dihubungi",
  klass: "Klasifikasi",
  priority: "Prioritas",
  category: "Kategori",
};

const shortVal = (v: unknown) => {
  const s = typeof v === "boolean" ? (v ? "ya" : "tidak") : String(v ?? "");
  return s ? (s.length > 60 ? `${s.slice(0, 59)}…` : s).replace(/\n/g, " ") : "(kosong)";
};

/**
 * Ubah satu baris. `expectedVersion` = nilai "Terakhir Diubah" yang dilihat pengguna; bila sudah berubah di sheet
 * (orang lain mengubahnya lebih dulu) permintaan ditolak dengan ConflictError.
 */
export async function updateItem(
  segment: Segment,
  id: string,
  patch: ItemPatch,
  who: string,
  expectedVersion: string,
): Promise<FollowupItem> {
  const snap = await readTracker({ fresh: true });
  const known = snap.items.find((i) => i.segment === segment && i.id === id);
  if (!known) throw new ValidationError("Item tidak ditemukan.");

  // Baca ulang baris yang akan diubah dan pastikan masih item yang sama.
  const range = `'${SHEET_TAB[segment]}'!A${known.row}:${LAST_COL_LETTER}${known.row}`;
  const fresh = await call<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  const cells = fresh.values?.[0] ?? [];
  const current = parseRow(segment, known.row, cells);
  if (current.id !== id) throw new ConflictError("Baris di sheet sudah bergeser. Muat ulang halaman.");
  if (current.updatedAt !== expectedVersion) throw new ConflictError("Item ini baru saja diubah orang lain. Data terbaru sudah dimuat.");

  const next = { ...current } as unknown as Record<string, unknown>;
  const before = current as unknown as Record<string, unknown>;
  const changed: (keyof ItemPatch)[] = [];
  for (const key of Object.keys(patch) as (keyof ItemPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (before[key] !== value) {
      next[key] = value;
      changed.push(key);
    }
  }
  if (!changed.length) return current;
  if (changed.includes("category") && !categoriesFor(segment).includes(String(next.category))) {
    throw new ValidationError("Kategori tidak sesuai dengan segmen ini.");
  }

  // Aturan turunan: selesai otomatis memberi tanggal selesai; kembali ke status terbuka mengosongkannya.
  const closed = next.status === "Selesai" || next.status === "Tidak perlu tindak lanjut";
  if (changed.includes("status") && !changed.includes("done")) {
    if (closed && !next.done) {
      next.done = todayWib();
      changed.push("done");
    } else if (!closed && next.done) {
      next.done = "";
      changed.push("done");
    }
  }

  const stamp = stampWib();
  const lines = changed.map((k) => `${stamp} · ${who} · ${FIELD_LABEL[k]}: ${shortVal(before[k])} → ${shortVal(next[k])}`);
  let history = [current.history, ...lines].filter(Boolean).join("\n");
  const kept = history.split("\n");
  if (kept.length > 30) history = kept.slice(-30).join("\n");
  if (history.length > 8000) history = history.slice(-8000);

  const version = new Date().toISOString();
  const writes: CellWrite[] = [];
  const w = (col: (typeof COLS)[number], value: string | number | boolean, formula = false) =>
    writes.push({ segment, row: known.row, col, value, formula });
  for (const k of changed) {
    switch (k) {
      case "status": w("Status", String(next.status)); break;
      case "pic": w("PIC", String(next.pic)); break;
      case "action": w("Tindakan Follow Up", String(next.action)); break;
      // Target kosong = kembali ke rumus bawaan (tanggal survei + 3 atau 14 hari menurut prioritas).
      case "target":
        if (next.target) w("Target Selesai", isoToSerial(String(next.target)));
        else w("Target Selesai", `=B${known.row}+IF(E${known.row}="Tinggi",3,14)`, true);
        break;
      case "done": w("Tanggal Selesai", next.done ? isoToSerial(String(next.done)) : ""); break;
      case "contacted": w("Pelanggan Dihubungi", Boolean(next.contacted)); break;
      case "klass": w("Klasifikasi", String(next.klass)); break;
      case "priority": w("Prioritas", String(next.priority)); break;
      case "category": w("Kategori Isu", String(next.category)); break;
    }
  }
  w("Diubah Oleh", who);
  w("Terakhir Diubah", version);
  w("Riwayat Perubahan", history);
  await writeCells(writes);

  // Baca ulang baris agar tampilan memakai nilai akhir sheet (termasuk hasil rumus Target Selesai).
  const after = await call<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  return parseRow(segment, known.row, after.values?.[0] ?? []);
}

/* ---------- penataan sheet (sekali jalan, idempotent) ---------- */

export interface MigrateReport {
  headers: boolean;
  rekapFormulas: number;
  conditionalRules: number;
  filters: number;
}

export async function ensureSchema(): Promise<MigrateReport> {
  const report: MigrateReport = { headers: false, rekapFormulas: 0, conditionalRules: 0, filters: 0 };
  const meta = await call<{
    sheets: {
      properties: { sheetId: number; title: string };
      conditionalFormats?: { ranges: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }[] }[];
      basicFilter?: { range: Record<string, number>; [k: string]: unknown };
    }[];
  }>("?fields=sheets(properties(sheetId,title),conditionalFormats,basicFilter)");

  const requests: unknown[] = [];
  const headerWrites: { range: string; values: string[][] }[] = [];

  for (const seg of ["b2c", "b2b"] as const) {
    const sheet = meta.sheets.find((s) => s.properties.title === SHEET_TAB[seg]);
    if (!sheet) throw new Error(`Tab "${SHEET_TAB[seg]}" tidak ada di sheet tracker.`);
    const sheetId = sheet.properties.sheetId;

    const head = await call<{ values?: string[][] }>(`/values/${encodeURIComponent(`'${SHEET_TAB[seg]}'!S2:${LAST_COL_LETTER}2`)}`);
    if ((head.values?.[0]?.[0] ?? "") !== "ID Respons" || (head.values?.[0]?.[COL["Link Evidence"] - COL["ID Respons"]] ?? "") !== "Link Evidence") {
      report.headers = true;
      headerWrites.push({ range: `'${SHEET_TAB[seg]}'!S2:${LAST_COL_LETTER}2`, values: [COLS.slice(COL["ID Respons"]) as unknown as string[]] });
      requests.push({
        copyPaste: {
          source: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 17, endColumnIndex: 18 },
          destination: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 18, endColumnIndex: COLS.length },
          pasteType: "PASTE_FORMAT",
        },
      });
      // Sel isi di kolom baru memakai format baris contoh (teks, rata atas) untuk seluruh area tabel.
      requests.push({
        copyPaste: {
          source: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 17, endColumnIndex: 18 },
          destination: { sheetId, startRowIndex: 2, endRowIndex: MAX_ROWS, startColumnIndex: 18, endColumnIndex: COLS.length },
          pasteType: "PASTE_FORMAT",
        },
      });
      const widths: [number, number][] = [[18, 130], [19, 150], [20, 110], [21, 170], [22, 320], [23, 220], [24, 340]];
      for (const [i, px] of widths) {
        requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
      }
    }

    // Aturan format bersyarat yang berhenti di baris 200 diperpanjang agar baris baru ikut diwarnai.
    (sheet.conditionalFormats ?? []).forEach((rule, index) => {
      if (!rule.ranges.some((r) => r.endRowIndex === 200)) return;
      report.conditionalRules++;
      requests.push({
        updateConditionalFormatRule: {
          sheetId,
          index,
          rule: { ...rule, ranges: rule.ranges.map((r) => (r.endRowIndex === 200 ? { ...r, endRowIndex: MAX_ROWS } : r)) },
        },
      });
    });

    // Filter otomatis diperluas ke seluruh tabel dan kolom baru.
    if (sheet.basicFilter) {
      const r = sheet.basicFilter.range;
      if (r.endRowIndex !== undefined || (r.endColumnIndex ?? 0) < COLS.length) {
        report.filters++;
        const { endRowIndex: _drop, ...rest } = r;
        void _drop;
        requests.push({ setBasicFilter: { filter: { ...sheet.basicFilter, range: { ...rest, endColumnIndex: COLS.length } } } });
      }
    }
  }

  // Rumus tab Rekap menghitung sampai baris 200; perpanjang agar semua item terhitung.
  const rekap = await call<{ values?: string[][] }>(`/values/${encodeURIComponent(`'${REKAP_TAB}'!A1:H80`)}?valueRenderOption=FORMULA`);
  const rekapWrites: { range: string; values: string[][] }[] = [];
  (rekap.values ?? []).forEach((row, ri) => {
    row.forEach((cell, ci) => {
      if (typeof cell !== "string" || !cell.startsWith("=") || !/\$?[A-Z]+\$?3:\$?[A-Z]+\$?200\b/.test(cell)) return;
      report.rekapFormulas++;
      rekapWrites.push({
        range: `'${REKAP_TAB}'!${String.fromCharCode(65 + ci)}${ri + 1}`,
        values: [[cell.replace(/(\$?[A-Z]+\$?3:\$?[A-Z]+\$?)200\b/g, `$1${MAX_ROWS}`)]],
      });
    });
  });

  if (requests.length) await call(":batchUpdate", { method: "POST", body: { requests } });
  const data = [...headerWrites, ...rekapWrites];
  if (data.length) await call("/values:batchUpdate", { method: "POST", body: { valueInputOption: "USER_ENTERED", data } });

  // Blok "Kategori isu" di Rekap memakai daftar lama (Petugas & Penjemputan, dst.). Ganti dengan bagian kuesioner.
  const rekapSheet = meta.sheets.find((s) => s.properties.title === REKAP_TAB);
  if (rekapSheet) {
    const probe = await call<{ values?: string[][] }>(`/values/${encodeURIComponent(`'${REKAP_TAB}'!A14`)}`);
    if ((probe.values?.[0]?.[0] ?? "") === "Petugas & Penjemputan") {
      const sheetId = rekapSheet.properties.sheetId;
      const labels = ALL_CATEGORIES;
      const oldRows = 9; // baris 14 sampai 22 pada blok lama
      const extra = labels.length - oldRows;
      if (extra > 0) {
        // Sisipkan baris sebelum baris kosong di bawah blok; blok "Per bandara" bergeser turun bersama rumusnya.
        await call(":batchUpdate", {
          method: "POST",
          body: { requests: [{ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: 22, endIndex: 22 + extra }, inheritFromBefore: true } }] },
        });
      }
      const values = labels.map((label, i) => {
        const r = 14 + i;
        return [label, `=COUNTIF(B2C!F3:F${MAX_ROWS},A${r})`, `=COUNTIF(B2B!F3:F${MAX_ROWS},A${r})`, `=B${r}+C${r}`];
      });
      await call(`/values/${encodeURIComponent(`'${REKAP_TAB}'!A14:D${13 + labels.length}`)}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: { range: `'${REKAP_TAB}'!A14:D${13 + labels.length}`, majorDimension: "ROWS", values },
      });
      report.rekapFormulas += labels.length;
    }
  }
  clearTrackerCache();
  return report;
}

/** Tambahkan tautan evidence ke baris item (menambah, tidak pernah menimpa evidence yang sudah ada). */
export async function addEvidence(segment: Segment, id: string, entries: EvidenceEntry[], who: string): Promise<FollowupItem> {
  if (!entries.length) throw new ValidationError("Tidak ada evidence untuk disimpan.");
  const snap = await readTracker({ fresh: true });
  const known = snap.items.find((i) => i.segment === segment && i.id === id);
  if (!known) throw new ValidationError("Item tidak ditemukan.");
  const range = `'${SHEET_TAB[segment]}'!A${known.row}:${LAST_COL_LETTER}${known.row}`;
  const read = () =>
    call<{ values?: unknown[][] }>(`/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  const current = parseRow(segment, known.row, (await read()).values?.[0] ?? []);
  if (current.id !== id) throw new ConflictError("Baris di sheet sudah bergeser. Muat ulang halaman.");

  const oneLine = (s: string) => s.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  const lines = entries.map((e) => `${oneLine(e.title)}${EVIDENCE_SEP}${e.url}`);
  const stamp = stampWib();
  const historyLines = entries.map((e) => `${stamp} · ${who} · Evidence ditambahkan: ${oneLine(e.title)}`);
  let history = [current.history, ...historyLines].filter(Boolean).join("\n");
  const kept = history.split("\n");
  if (kept.length > 30) history = kept.slice(-30).join("\n");
  if (history.length > 8000) history = history.slice(-8000);

  await writeCells([
    { segment, row: known.row, col: "Link Evidence", value: [current.evidence, ...lines].filter(Boolean).join("\n") },
    { segment, row: known.row, col: "Riwayat Perubahan", value: history },
    { segment, row: known.row, col: "Diubah Oleh", value: who },
    { segment, row: known.row, col: "Terakhir Diubah", value: new Date().toISOString() },
  ]);
  return parseRow(segment, known.row, (await read()).values?.[0] ?? []);
}

export const nextId = (segment: Segment, items: FollowupItem[]): (() => string) => {
  let max = 0;
  for (const i of items) {
    if (i.segment !== segment) continue;
    const m = i.id.match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => `${SEGMENT_PREFIX[segment]}-${String(++max).padStart(3, "0")}`;
};
