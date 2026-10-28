import { JWT } from "google-auth-library";
import { getServiceAccount, getSheetId } from "./credentials";
import type { Response, SectionDef } from "./scoring";
import { OTHER_SECTION, SECTION_CATALOG, SEGMENT_IDS, SEGMENT_META, type Segment } from "./survey-config";

const AIRPORT_SHEET = "Helper_Kode_Cabang";
const CACHE_TTL_MS = 60_000;

export interface SegmentData {
  sheet: string;
  sections: SectionDef[];
  responses: Response[];
  unmapped: string[]; // pernyataan di sheet yang belum punya bagian di katalog
}

/** Data lengkap di server: ditambah header dan baris mentah sheet untuk export Excel. */
export interface ServerSegmentData extends SegmentData {
  headers: string[];
  rows: string[][];
  statementCols: number[][]; // kolom sheet untuk tiap pernyataan, urut sama dengan scores
}

export interface DashboardData {
  fetchedAt: string;
  airports: Record<string, string>; // kode → nama bandara
  segments: Record<Segment, SegmentData>;
}

export interface ServerDashboardData extends DashboardData {
  segments: Record<Segment, ServerSegmentData>;
}

/** Buang baris mentah sebelum data dikirim ke browser. */
export function toClientData(data: ServerDashboardData): DashboardData {
  const strip = ({ headers: _h, rows: _r, statementCols: _c, ...rest }: ServerSegmentData): SegmentData => rest;
  return { ...data, segments: { b2c: strip(data.segments.b2c), b2b: strip(data.segments.b2b) } };
}

let cache: { at: number; data: ServerDashboardData } | null = null;

const MIN_REFRESH_INTERVAL_MS = 15_000;

/** Cache yang masih berumur < 15 detik dipertahankan agar muat ulang berulang tidak menghabiskan kuota API. */
export function clearSheetCache() {
  if (cache && Date.now() - cache.at < MIN_REFRESH_INTERVAL_MS) return;
  cache = null;
}

export async function getDashboardData(): Promise<ServerDashboardData> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await fetchDashboardData();
  cache = { at: Date.now(), data };
  return data;
}

async function fetchDashboardData(): Promise<ServerDashboardData> {
  const account = getServiceAccount();
  const client = new JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const { token } = await client.getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}`;

  // Helper_Kode_Cabang hanya untuk nama bandara; dashboard tetap jalan tanpanya.
  const metaRes = await fetch(`${base}?fields=sheets.properties.title`, { headers, cache: "no-store" });
  if (!metaRes.ok) throw new Error(`Google Sheets API ${metaRes.status}`);
  const titles = new Set(
    ((await metaRes.json()) as { sheets: { properties: { title: string } }[] }).sheets.map((s) => s.properties.title),
  );
  for (const id of SEGMENT_IDS) {
    if (!titles.has(SEGMENT_META[id].sheet)) throw new Error(`Sheet "${SEGMENT_META[id].sheet}" tidak ditemukan.`);
  }

  const ranges = [...SEGMENT_IDS.map((id) => SEGMENT_META[id].sheet), ...(titles.has(AIRPORT_SHEET) ? [AIRPORT_SHEET] : [])];
  const url = new URL(`${base}/values:batchGet`);
  for (const sheet of ranges) url.searchParams.append("ranges", `'${sheet}'`);
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets API ${res.status}`);
  const json = (await res.json()) as { valueRanges: { values?: string[][] }[] };
  const [b2cRows, b2bRows, airportRows = []] = json.valueRanges.map((v) => v.values ?? []);

  const airports: Record<string, string> = {};
  for (const [name, code] of airportRows.slice(1)) {
    if (name && code) airports[code.trim().toUpperCase()] = name.trim();
  }

  return {
    fetchedAt: new Date().toISOString(),
    airports,
    segments: { b2c: parseSegment("b2c", b2cRows), b2b: parseSegment("b2b", b2bRows) },
  };
}

/* ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** "5 SP" → 5, "3" → 3; nilai di luar 1–5 diabaikan. */
function parseLikert(raw: string | undefined): number | null {
  const m = raw?.match(/^\s*([1-5])(?!\d)/);
  return m ? Number(m[1]) : null;
}

function findColumns(headers: string[], test: RegExp): number[] {
  return headers.flatMap((h, i) => (test.test(h) ? [i] : []));
}

function firstValue(row: string[], cols: number[]): string {
  for (const c of cols) {
    const v = row[c]?.trim();
    if (v) return v;
  }
  return "";
}

function parseStation(raw: string): string {
  const coded = raw.match(/\(\s*([A-Za-z]{3})\s*\)/);
  if (coded) return coded[1].toUpperCase();
  const bare = raw.trim().match(/^[A-Za-z]{3}$/);
  return bare ? bare[0].toUpperCase() : raw.trim();
}

function splitList(raw: string): string[] {
  return raw
    .split(/,\s*(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const NOT_A_STATEMENT = /seberapa besar kemungkinan|merekomendasikan/i;

/**
 * Kolom pernyataan Likert dikenali dari sheet itu sendiri:
 * - header matriks Tally "… [teks pernyataan]", atau
 * - header bernomor "3. teks" yang ≥ 80% isinya berupa skor 1–5.
 * Form B2B pernah berubah versi sehingga satu pernyataan bisa punya dua kolom;
 * kolom dengan teks yang sama digabung.
 */
function discoverStatements(headers: string[], body: string[][]) {
  const found = new Map<string, { text: string; cols: number[] }>();
  headers.forEach((header, i) => {
    if (NOT_A_STATEMENT.test(header)) return;
    const bracket = header.match(/\[([\s\S]+)\]\s*$/);
    const numbered = header.match(/^\s*\d+\.\s*([\s\S]+)$/);
    let text: string;
    if (bracket) {
      text = bracket[1].trim();
    } else if (numbered) {
      const values = body.map((r) => r[i]?.trim()).filter(Boolean);
      const likert = values.filter((v) => parseLikert(v) !== null).length;
      if (!values.length || likert / values.length < 0.8) return;
      text = numbered[1].trim();
    } else {
      return;
    }
    const key = norm(text);
    const entry = found.get(key);
    if (entry) entry.cols.push(i);
    else found.set(key, { text, cols: [i] });
  });
  return [...found.values()];
}

function parseSegment(segment: Segment, rows: string[][]): ServerSegmentData {
  const [headers = [], ...body] = rows;
  const discovered = discoverStatements(headers, body);

  // Kelompokkan ke bagian sesuai katalog; urutan pernyataan mengikuti sheet.
  const catalog = SECTION_CATALOG[segment];
  const sectionOf = new Map<string, number>();
  catalog.forEach((sec, si) => sec.statements.forEach((t) => sectionOf.set(norm(t), si)));

  const buckets: { cols: number[]; text: string }[][] = catalog.map(() => []);
  const other: { cols: number[]; text: string }[] = [];
  for (const st of discovered) {
    const si = sectionOf.get(norm(st.text));
    if (si === undefined) other.push(st);
    else buckets[si].push(st);
  }

  let no = 0;
  const statementCols: number[][] = [];
  const sections: SectionDef[] = [];
  const addSection = (meta: { code: string; title: string; short: string }, items: typeof other) => {
    if (!items.length) return;
    sections.push({
      ...meta,
      statements: items.map((it) => {
        statementCols.push(it.cols);
        return { no: ++no, text: it.text };
      }),
    });
  };
  catalog.forEach((sec, si) => addSection(sec, buckets[si]));
  addSection(OTHER_SECTION, other);

  const col = {
    submittedAt: findColumns(headers, /^submitted at$|^timestamp$/i),
    id: findColumns(headers, /^submission id$/i),
    service: findColumns(headers, /jenis layanan joumpa[^()]*:\s*$/i),
    channel: findColumns(headers, /^\d+\.\s*kanal [^()]*:\s*$/i),
    station: findColumns(headers, /^\d+\.\s*(bandara|station)/i),
    institution: findColumns(headers, /nama instansi\/perusahaan/i),
    issue: findColumns(headers, /mengalami kendala/i),
    nps: findColumns(headers, /seberapa besar kemungkinan/i),
    best: findColumns(headers, /paling berkesan/i),
    improve: findColumns(headers, /perlu diperbaiki/i),
    suggestion: findColumns(headers, /saran atau masukan/i),
  };

  const responses: Response[] = [];
  for (const [rowIndex, row] of body.entries()) {
    const scores = statementCols.map((cols) => parseLikert(firstValue(row, cols)));
    if (scores.every((s) => s === null)) continue;

    const submittedAt = firstValue(row, col.submittedAt);
    const npsRaw = firstValue(row, col.nps).match(/^\s*(\d{1,2})/);
    const nps = npsRaw && Number(npsRaw[1]) <= 10 ? Number(npsRaw[1]) : null;
    const issue = firstValue(row, col.issue);

    responses.push({
      id: firstValue(row, col.id) || `${segment}-${responses.length + 1}`,
      rowIndex,
      submittedAt,
      date: submittedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "",
      services: splitList(firstValue(row, col.service)),
      channels: splitList(firstValue(row, col.channel)),
      station: parseStation(firstValue(row, col.station)),
      institution: firstValue(row, col.institution),
      hadIssue: issue ? /^ya/i.test(issue) : null,
      nps,
      scores,
      comments: {
        best: firstValue(row, col.best),
        improve: firstValue(row, col.improve),
        suggestion: firstValue(row, col.suggestion),
      },
    });
  }

  return {
    sheet: SEGMENT_META[segment].sheet,
    sections,
    responses,
    unmapped: other.map((o) => o.text),
    headers,
    rows: body,
    statementCols,
  };
}
