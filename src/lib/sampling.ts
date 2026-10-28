import { sheetsApi } from "./google";

const SAMPLING_SHEET = process.env.SHEET_SAMPLING || "Target Sampling";
const CACHE_TTL_MS = 60_000;

export interface B2bCustomer {
  no: number;
  name: string;
  production: string;
  status: string;
  target: number;
  collected: number;
  pic: string;
  note: string;
  pattern: string; // pola pencocok nama instansi di Tally, mis. (?i)DPR
}

export interface B2cChannel {
  no: number;
  name: string;
  production: string;
  kind: string;
  target: number | null;
  collected: number | null;
  source: string;
}

export interface BranchSampling {
  code: string;
  b2b: { customers: B2bCustomer[]; target: number; collected: number; other: number };
  b2c: { channels: B2cChannel[]; target: number; collected: number; unclassified: number };
}

export interface SamplingData {
  fetchedAt: string;
  productionLabel: string; // judul kolom produksi di sheet, mis. "Produksi Sep"
  branches: Record<string, BranchSampling>;
  error?: string;
}

let cache: { at: number; data: SamplingData } | null = null;

export function clearSamplingCache() {
  cache = null;
}

export async function getSamplingData(): Promise<SamplingData> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const { headers, base } = await sheetsApi();
  const url = `${base}/values/${encodeURIComponent(`'${SAMPLING_SHEET}'`)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet "${SAMPLING_SHEET}" tidak bisa dibaca (Google Sheets API ${res.status}).`);
  const rows = ((await res.json()) as { values?: string[][] }).values ?? [];
  const data = parseSampling(rows);
  cache = { at: Date.now(), data };
  return data;
}

/** Data target untuk halaman yang menampilkannya. Gagal baca sheet tidak menjatuhkan dashboard. */
export async function loadSampling(): Promise<SamplingData> {
  try {
    return await getSamplingData();
  } catch (err) {
    console.error("Gagal memuat sheet Target Sampling:", err);
    return { fetchedAt: new Date().toISOString(), productionLabel: "Produksi", branches: {}, error: "Sheet Target Sampling belum bisa dimuat." };
  }
}

/** "47" → 47, "–", "-" dan sel kosong → null. */
function num(raw: string | undefined): number | null {
  const m = raw?.replace(/\./g, "").match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

const cell = (row: string[], i: number) => row[i]?.trim() ?? "";
/** Tanda "–" di sheet berarti kosong. */
const text = (row: string[], i: number) => (/^[–-]$/.test(cell(row, i)) ? "" : cell(row, i));

/**
 * Sheet "Target Sampling" berisi satu blok per cabang:
 *   CABANG AMQ | B2B: … | B2C: …
 *   A. B2B · …   → baris customer (No, Customer, Produksi, Status, Target, Terkumpul, PIC, Catatan), TOTAL B2B, RESPON LAIN
 *   B. B2C · …   → baris kanal (No, Kanal, Produksi, Jenis, Target, Terkumpul, % capaian, Sumber), TOTAL B2C, SELISIH
 * Angka Terkumpul dihitung oleh rumus di sheet itu sendiri; di sini hanya dibaca.
 */
export function parseSampling(rows: string[][]): SamplingData {
  const branches: Record<string, BranchSampling> = {};
  let productionLabel = "Produksi";
  let current: BranchSampling | null = null;
  let part: "b2b" | "b2c" | null = null;

  for (const row of rows) {
    const first = cell(row, 0);
    const second = cell(row, 1);

    const head = first.match(/^CABANG\s+([A-Za-z]{3})\b/);
    if (head) {
      const code = head[1].toUpperCase();
      current = {
        code,
        b2b: { customers: [], target: 0, collected: 0, other: 0 },
        b2c: { channels: [], target: 0, collected: 0, unclassified: 0 },
      };
      branches[code] = current;
      part = null;
      continue;
    }
    if (!current) continue;

    if (/^A\.\s*B2B/i.test(first)) part = "b2b";
    else if (/^B\.\s*B2C/i.test(first)) part = "b2c";
    else if (first === "No") {
      if (part === "b2c" && cell(row, 2)) productionLabel = cell(row, 2);
    } else if (/^TOTAL B2B/i.test(second)) {
      current.b2b.target = num(row[4]) ?? 0;
      current.b2b.collected = num(row[5]) ?? 0;
    } else if (/^RESPON LAIN/i.test(second)) {
      current.b2b.other = num(row[5]) ?? 0;
    } else if (/^TOTAL B2C/i.test(second)) {
      current.b2c.target = num(row[4]) ?? 0;
      current.b2c.collected = num(row[5]) ?? 0;
    } else if (/^SELISIH KLASIFIKASI/i.test(second)) {
      current.b2c.unclassified = num(row[5]) ?? 0;
    } else if (/^\d+$/.test(first)) {
      if (part === "b2b") {
        current.b2b.customers.push({
          no: Number(first),
          name: second,
          production: text(row, 2),
          status: cell(row, 3),
          target: num(row[4]) ?? 0,
          collected: num(row[5]) ?? 0,
          pic: cell(row, 6),
          note: cell(row, 7),
          pattern: cell(row, 9),
        });
      } else if (part === "b2c") {
        current.b2c.channels.push({
          no: Number(first),
          name: second,
          production: text(row, 2),
          kind: cell(row, 3),
          target: num(row[4]),
          collected: num(row[5]),
          source: cell(row, 7),
        });
      }
    }
  }

  return { fetchedAt: new Date().toISOString(), productionLabel, branches };
}
