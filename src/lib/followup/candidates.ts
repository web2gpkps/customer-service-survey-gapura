import type { ServerDashboardData, ServerSegmentData } from "../sheets";
import { buildSummary, classify, formatLowItems, type Classification } from "./classify";
import { pickSection, spansOf } from "./sections";
import { FOLLOWUP_KPI, LOW_ITEM_MAX, type Segment } from "./types";

/** Satu jawaban survei beserta hasil baca sistem. Dipakai untuk membuat baris tracker dan tab Apresiasi. */
export interface Candidate {
  segment: Segment;
  responseId: string;
  date: string;
  station: string;
  services: string;
  channel: string;
  context: string; // nomor penerbangan (B2C) atau instansi (B2B)
  nps: number | null;
  index: number | null;
  classification: Classification;
  /** Bagian kuesioner (Reservasi, Keberangkatan, dst.). */
  category: string;
  summary: string;
  quote: string;
  lowItemsText: string;
  lowCount: number;
  /** Gabungan komentar responden; dipakai mencocokkan baris tracker lama. */
  commentText: string;
  /** Urutan baris di sheet survei, supaya item baru ditambahkan menurut urutan masuk. */
  order: number;
}

export interface ResponseDetail {
  responseId: string;
  segment: Segment;
  submittedAt: string;
  name: string;
  phone: string;
  /** Formulir Tally tidak menanyakan email; kolom ini kosong. */
  email: string;
  issueAnswer: string;
  best: string;
  improve: string;
  suggestion: string;
  index: number | null;
  nps: number | null;
  services: string;
  channels: string;
  station: string;
  context: string;
  period: string;
  lowItems: { no: number; text: string; score: number }[];
}

const find = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h));

interface Cols {
  issue: number;
  name: number;
  phone: number;
  email: number;
  flight: number;
  period: number;
}

function columns(headers: string[]): Cols {
  return {
    issue: find(headers, /mengalami kendala/i),
    name: find(headers, /^\s*\d+\.\s*nama\b/i),
    phone: find(headers, /nomor hp|no\.?\s?hp/i),
    email: find(headers, /^\s*(\d+\.\s*)?(alamat )?e-?mail\b[^()]{0,30}:?\s*$/i),
    flight: find(headers, /nomor penerbangan/i),
    period: find(headers, /periode kerja sama/i),
  };
}

/** Jawaban "A. Ya/Yes, pernah mengalami Kendala" dihitung kendala; "Tidak …" bukan. */
export const isIssueYes = (answer: string | undefined): boolean => {
  const a = (answer ?? "").trim();
  if (!a || /tidak\s+mengalami|^\s*b\.|^\s*tidak\b/i.test(a)) return false;
  return /pernah mengalami|^\s*(a\.\s*)?ya\b/i.test(a);
};

const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

function statementsOf(seg: ServerSegmentData) {
  return seg.sections.flatMap((s) => s.statements.map((st) => ({ no: st.no, text: st.text })));
}

export function buildCandidates(data: ServerDashboardData, segment: Segment): Candidate[] {
  const seg = data.segments[segment];
  const cols = columns(seg.headers);
  const statements = statementsOf(seg);
  const spans = spansOf(seg.sections);
  const out: Candidate[] = [];

  for (const r of seg.responses) {
    const row = seg.rows[r.rowIndex] ?? [];
    const valid = r.scores.filter((s): s is number => s !== null);
    const index = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    const lowItems = r.scores.flatMap((s, k) =>
      s !== null && s <= LOW_ITEM_MAX && statements[k] ? [{ ...statements[k], score: s }] : [],
    );
    const input = {
      index,
      nps: r.nps,
      issueYes: isIssueYes(cell(row, cols.issue)),
      improve: r.comments.improve,
      suggestion: r.comments.suggestion,
      lowItems,
    };
    const classification = classify(input);
    const category = pickSection({
      segment,
      spans,
      scores: r.scores,
      index,
      belowKpi: index !== null && Math.round(index * 100) / 100 < FOLLOWUP_KPI,
      kendala: input.issueYes || classification.complaint,
      text: `${r.comments.improve} ${r.comments.suggestion}`,
      services: r.services.join(", "),
    });
    const built = classification.klass ? buildSummary({ ...input, klass: classification.klass }) : null;
    const context = segment === "b2c" ? cell(row, cols.flight) : r.institution;
    out.push({
      segment,
      responseId: r.id,
      date: r.date,
      station: r.station,
      services: r.services.join(", "),
      channel: r.channels.join(", "),
      context: context.replace(/\s+/g, " "),
      nps: r.nps,
      index,
      classification,
      summary: built?.summary ?? "",
      quote: built?.quote ?? "",
      lowItemsText: formatLowItems(lowItems),
      category,
      lowCount: lowItems.length,
      commentText: `${r.comments.improve} ${r.comments.suggestion}`.trim(),
      order: r.rowIndex,
    });
  }
  return out;
}

/** Ringkasan satu jawaban yang tidak perlu ditindaklanjuti, untuk tab Apresiasi. */
export function appreciationSummary(data: ServerDashboardData, segment: Segment, responseId: string): string {
  const r = data.segments[segment].responses.find((x) => x.id === responseId);
  if (!r) return "";
  const t = [r.comments.best, r.comments.suggestion, r.comments.improve].find((x) => x.trim().length > 3) ?? "";
  return t.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Data lengkap satu jawaban, termasuk data pribadi responden. Hanya untuk pengguna yang sudah login. */
export function responseDetail(data: ServerDashboardData, segment: Segment, responseId: string): ResponseDetail | null {
  const seg = data.segments[segment];
  const r = seg.responses.find((x) => x.id === responseId);
  if (!r) return null;
  const row = seg.rows[r.rowIndex] ?? [];
  const cols = columns(seg.headers);
  const statements = statementsOf(seg);
  const valid = r.scores.filter((s): s is number => s !== null);
  return {
    responseId: r.id,
    segment,
    submittedAt: r.submittedAt,
    name: cell(row, cols.name),
    phone: cell(row, cols.phone),
    email: cell(row, cols.email),
    issueAnswer: cell(row, cols.issue),
    best: r.comments.best,
    improve: r.comments.improve,
    suggestion: r.comments.suggestion,
    index: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    nps: r.nps,
    services: r.services.join(", "),
    channels: r.channels.join(", "),
    station: r.station,
    context: segment === "b2c" ? cell(row, cols.flight) : r.institution,
    period: cell(row, cols.period),
    lowItems: r.scores.flatMap((s, k) =>
      s !== null && s <= LOW_ITEM_MAX && statements[k] ? [{ ...statements[k], score: s }] : [],
    ),
  };
}
