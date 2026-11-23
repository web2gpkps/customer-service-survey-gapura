/**
 * Memetakan baris tracker lama (yang belum punya ID Respons) ke jawaban survei aslinya.
 * Kunci utama: tanggal + bandara + skor rekomendasi. Bila ada lebih dari satu jawaban yang cocok, dipilah dengan
 * nomor penerbangan/instansi, kanal, layanan, kemiripan teks, dan ada-tidaknya butir skor rendah.
 * Baris yang tetap ragu TIDAK dipetakan; diberi catatan agar dicek manual.
 */
import { normText } from "./classify";

export interface LegacyRow {
  id: string;
  date: string;
  station: string;
  nps: number | null;
  context: string;
  channel: string;
  services: string;
  klass: string;
  text: string; // ringkasan + kutipan di sheet
}

export interface MatchCandidate {
  responseId: string;
  date: string;
  station: string;
  nps: number | null;
  context: string;
  channel: string;
  services: string;
  lowCount: number;
  text: string; // gabungan komentar responden
}

export type Confidence = "pasti" | "cukup" | "ragu" | "tidak ketemu";

export interface MatchResult {
  id: string;
  responseId: string | null;
  confidence: Confidence;
  pool: number; // jumlah kandidat dengan tanggal+bandara+skor rekomendasi yang sama
  alternatives: string[]; // ID respons kandidat lain, untuk catatan
}

const STOP = new Set("dan yang di ke dari untuk the and of to a in is are responden pernyataan asli menyampaikan masukan meminta".split(" "));
const tokens = (s: string) => new Set(normText(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t)));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const squash = (s: string) => normText(s).replace(/\s+/g, "");

function score(t: LegacyRow, c: MatchCandidate): number {
  let s = 0;
  const tc = squash(t.context);
  const cc = squash(c.context);
  if (tc && cc) s += tc === cc ? 5 : tc.includes(cc) || cc.includes(tc) ? 3 : -1;
  s += 2 * jaccard(tokens(t.channel), tokens(c.channel));
  s += 2 * jaccard(tokens(t.services), tokens(c.services));
  s += 8 * jaccard(tokens(t.text), tokens(c.text));
  const lowKind = /skor rendah/i.test(t.klass);
  if (lowKind) s += c.lowCount > 0 ? 2 : -2;
  else if (/^saran perbaikan$/i.test(t.klass)) s += c.lowCount > 0 ? -0.5 : 0;
  return s;
}

export function matchLegacy(rows: LegacyRow[], pool: MatchCandidate[]): MatchResult[] {
  const byKey = new Map<string, MatchCandidate[]>();
  for (const c of pool) {
    const k = `${c.date}|${c.station}|${c.nps}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
  }

  type Scored = { row: LegacyRow; cands: { c: MatchCandidate; s: number }[] };
  const scored: Scored[] = rows.map((row) => ({
    row,
    cands: (byKey.get(`${row.date}|${row.station}|${row.nps}`) ?? [])
      .map((c) => ({ c, s: score(row, c) }))
      .sort((a, b) => b.s - a.s),
  }));

  // Baris dengan kandidat paling sedikit diproses lebih dulu, supaya yang unik tidak "dicuri" baris lain.
  const order = [...scored].sort((a, b) => a.cands.length - b.cands.length);
  const taken = new Set<string>();
  const results = new Map<string, MatchResult>();

  for (const { row, cands } of order) {
    const free = cands.filter((x) => !taken.has(x.c.responseId));
    if (!cands.length) {
      results.set(row.id, { id: row.id, responseId: null, confidence: "tidak ketemu", pool: 0, alternatives: [] });
      continue;
    }
    const best = free[0];
    const second = free[1];
    if (!best) {
      results.set(row.id, { id: row.id, responseId: null, confidence: "ragu", pool: cands.length, alternatives: cands.map((x) => x.c.responseId) });
      continue;
    }
    const margin = second ? best.s - second.s : Infinity;
    // Kandidat tunggal yang masih punya konteks bertentangan (skor negatif besar) tidak dipetakan.
    const confidence: Confidence = cands.length === 1 ? (best.s > -2 ? "pasti" : "ragu") : margin >= 3 ? "pasti" : margin >= 1 ? "cukup" : "ragu";
    if (confidence === "ragu") {
      results.set(row.id, { id: row.id, responseId: null, confidence, pool: cands.length, alternatives: free.map((x) => x.c.responseId) });
      continue;
    }
    taken.add(best.c.responseId);
    results.set(row.id, { id: row.id, responseId: best.c.responseId, confidence, pool: cands.length, alternatives: free.slice(1).map((x) => x.c.responseId) });
  }
  return rows.map((r) => results.get(r.id)!);
}
