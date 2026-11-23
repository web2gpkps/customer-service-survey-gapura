/**
 * Klasifikasi otomatis jawaban survei menjadi item tindak lanjut. Murni berbasis aturan (tanpa AI, tanpa jaringan),
 * jadi hasilnya dapat diprediksi dan diuji. Pembacaan sistem boleh diubah manual oleh Management di halaman Tindak Lanjut.
 */
import {
  DETRACTOR_MAX,
  FOLLOWUP_KPI,
  HIGH_INDEX_BELOW,
  HIGH_LOW_ITEMS,
  LOW_ITEM_MAX,
  type FollowupClass,
  type Priority,
} from "./types";

export const normText = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s/'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Jawaban kosong makna: "-", "tidak ada", "nothing", dst. */
const EMPTY =
  /^(|-+|\/+|tidak|tidak ada|tidak ad|tidak perlu|tidak ada lagi|sudah tidak ada|tdk|tdk ada|tdk ad|gak|gak ada|gk|gk ada|ga|ga ada|nggak|nggak ada|enggak|enggak ada|belum|belum ada|masih belum ada( sih)?|nothing|nothing else|no|none|nil|nill|nihil|n a|na|nope|-)$/;

const FILLER = new Set(
  (
    "sudah sangat sekali yang dan selalu tetap untuk ini itu dipertahankan dipertahankan terus lagi semoga saja sih dengan " +
    "dari di ke pada oleh kami saya anda kita nya joumpa team tim petugas staf staff layanan service pelayanan " +
    "for your you the and of to is are was were a an in with all so much very really my me i it this that be been " +
    "has have had by at as we our they their saat sejauh kedepannya kedepan masih blm dulu sementara terus maju maksimal " +
    "buat seluruh indonesia far good tetap lebih tidak ada semua berjalan membantu para dikenal makin semakin menjadi " +
    "senang bangga bersyukur"
  ).split(" "),
);

const PRAISE = new Set(
  (
    "baik bagus mantap puas memuaskan pertahankan lanjutkan ramah profesional professional cukup oke ok okay excellent great good " +
    "perfect best thanks thank terima kasih impressive commendable welcome welcoming keep semangat konsisten sukses top " +
    "recommended sempurna hebat helpful smooth smoothly amazing wonderful appreciate appreciated sopan cepat tepat rapi " +
    "lancar nyaman bersahabat unbelievably fantastic superb nice wow love loved friendly punctuality hospitality star bintang " +
    "jempol keren sip joss terimakasih makasih thankyou thx terbaik luar biasa mengesankan kagum sigap"
  ).split(" "),
);

/** Penanda kritik atau permintaan perbaikan (Indonesia dan Inggris). */
const REQUEST =
  /\b(kurang|perlu|tolong|mohon|sebaiknya|harus|hrs|perbaiki|diperbaiki|perbaikan|lambat|lama|terlambat|telat|menunggu|antri|antrean|queue|hilang|rusak|salah|kecewa|mengecewakan|sulit|susah|ribet|komplain|keluhan|minta|meminta|harap|berharap|diharapkan|usul|usulan|tambah|tambahan|penambahan|ditambah|memperbanyak|perbanyak|tambahin|tambahkan|add|kurangi|jangan|hendaknya|alangkah|bisa lebih|lebih cepat|lebih lengkap|lebih banyak|dibuat|dibuka|dilakukan|tidak bisa|belum bisa|tidak ada petugas|diubah|dibenahi|benahi|evaluasi|could|should|need|needs|needed|wait|waiting|delay|delayed|slow|improve|improved|improvement|better|lack|missing|request|please|faster|enhanced|enhance|avoid|unable|difficult|issue|problem|maybe|too long|no one|not enough|more)\b/;

/** Penanda keluhan kuat: dipakai untuk "Indikasi Kendala" dan prioritas Tinggi. */
const COMPLAINT =
  /\b(kendala|masalah|hilang|rusak|kecewa|mengecewakan|marah|komplain|keluhan|terlambat|telat|tidak ramah|kasar|tidak profesional|tidak sopan|tertinggal|overbook\w*|insiden|telat jemput|tidak dijemput|tidak datang|tidak ada petugas|buruk|jelek|parah|lost|damaged|rude|unprofessional|complaint|disappointed|disappointing|terrible|worst|bad|poor)\b/;

export type TextKind = "kosong" | "apresiasi" | "masukan";
/** "improve" = kolom "apa yang perlu diperbaiki" (jawaban berisi topik apa pun dianggap masukan); "saran" = saran tambahan. */
export type TextField = "improve" | "saran";

export interface TextAnalysis {
  kind: TextKind;
  complaint: boolean;
}

/** Huruf berulang dilipat supaya salah ketik ("baikk", "semangatt") tetap dikenali. */
const fold = (t: string) => t.replace(/(.)\1+/g, "$1");
const PRAISE_FOLDED = new Set([...PRAISE].map(fold));
const FILLER_FOLDED = new Set([...FILLER].map(fold));

/** "tidak ada kendala", "no issue", dst. adalah pujian, bukan keluhan. */
const NEGATED = /\b(tidak ada|tdk ada|tidak ad|gak ada|ga ada|nggak ada|belum ada|tidak mengalami|tanpa|no|not any|without)\s+(kendala|masalah|keluhan|komplain|issue|issues|problem|problems|complaint|complaints)\b/g;

/** "tidak ada yang perlu diperbaiki" adalah pujian, bukan permintaan. */
const NEGATED_NEED = /\b(tidak|tdk|gak|ga|nggak|belum)( ada)?( yang| yg)? (perlu|kurang|harus|diperbaiki|ditingkatkan)( diperbaiki| ditingkatkan)?\b/g;
/** "untuk perbaikan kayaknya tidak ada", "kalau diperbaiki tidak ada". */
const NEGATED_AFTER = /\b(perbaikan|diperbaiki|diperbaiki|saran|masukan|kurang)( \w+){0,2} (tidak ada|tdk ada|belum ada|nihil)\b/g;

function hasTopic(text: string): boolean {
  return CATEGORY_KEYS.some(([, re]) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function analyzeText(raw: string | undefined, field: TextField = "saran"): TextAnalysis {
  const n = normText(raw ?? "");
  if (EMPTY.test(n)) return { kind: "kosong", complaint: false };
  const probe = n.replace(NEGATED, " ").replace(NEGATED_NEED, " ").replace(NEGATED_AFTER, " ").replace(/\s+/g, " ").trim();
  const complaint = COMPLAINT.test(probe);
  if (REQUEST.test(probe) || complaint) return { kind: "masukan", complaint };
  // Tanpa penanda kritik: teks yang menyebut topik layanan ("Pic dan komunikasi", "Jumlah personil", "Selalu ada
  // petugas lapangan") tetap masukan selama tidak memuat kata pujian. Lebih baik sesekali salah menandai daripada
  // melewatkan masukan nyata; bacaan yang keliru bisa dikoreksi (tab Apresiasi / Ubah klasifikasi).
  void field;
  const words = probe.split(" ").filter(Boolean);
  const praised = words.some((w) => PRAISE_FOLDED.has(fold(w)));
  if (words.length <= 14 && !praised && hasTopic(probe)) return { kind: "masukan", complaint: false };
  return { kind: "apresiasi", complaint: false };
}

const CATEGORY_KEYS: [string, RegExp][] = [
  [
    "Petugas & Penjemputan",
    /\b(petugas|staf|staff|personel|personil|penjemput\w*|jemput\w*|pickup|pick up|porter|buddy|buggy|seragam|manning|pendamping\w*|driver|sopir|shift|shif|dedicated|ramah|sopan|sikap|attitude|welcom\w+|drop zone|paging)\b/g,
  ],
  [
    "Respons & Komunikasi",
    /\b(respon\w*|respons\w*|balas\w*|chat|komunikasi|update|informasi|info|notifikasi|jadwal|kecepatan|telepon|telfon|whatsapp|wa|hotline|real time|realtime|kabar|menghubungi|hubungi|sosialisasi|rincian|breakdown|steps?|communicat\w+|schedule)\b/g,
  ],
  [
    "Reservasi & Konfirmasi",
    /\b(reservasi|booking|pesan\w*|pemesanan|konfirmasi|confirm\w*|website|aplikasi|app|form|formulir|h-1|24 jam|kuota|overbook\w*|ketersediaan|availab\w+|jms|email)\b/g,
  ],
  [
    "Fast Track & Proses Bandara",
    /\b(fast ?track|fasttrack|fastrack|imigrasi|immigration|antri\w*|antrean|queue|bea cukai|customs|x-?ray|security|screening|boarding|check-?in|counter|bagasi|baggage|gate|conveyor|customs declaration)\b/g,
  ],
  [
    "Sistem & Administrasi B2B",
    /\b(invoice|tagihan|penagihan|laporan|report|administrasi|admin|sistem|system|integrasi|integrated|kontrak|sla|dokumen\w*|data|handling report|pic)\b/g,
  ],
  ["Harga & Paket", /\b(harga|tarif|biaya|mahal|paket|diskon|price|pricing|cost|fee|murah)\b/g],
  [
    "Perluasan Layanan & Promosi",
    /\b(cabang|kota lain|bandara lain|perluas\w*|layanan baru|promosi|promo|iklan|marketing|jangkau\w*|coverage|diperluas|expand\w*|pendekatan|airlines?|maskapai)\b/g,
  ],
  [
    "Fasilitas & Lounge",
    /\b(lounge|ruang tunggu|fasilitas|makanan|minuman|kursi|toilet|wifi|ac|nyaman|mobil|kendaraan|limousine|limo|car|vehicle|transport\w*)\b/g,
  ],
];

/* ------------------------------------------------------------------ */

export interface ClassifyInput {
  index: number | null; // rata-rata skor jawaban (1–5)
  nps: number | null;
  issueYes: boolean; // menjawab "Ya, pernah mengalami kendala"
  improve: string;
  suggestion: string;
  /** Butir yang dinilai ≤ 3. */
  lowItems: { no: number; text: string; score: number }[];
}

export interface Classification {
  needsFollowup: boolean;
  klass: FollowupClass | null; // null = apresiasi
  priority: Priority | null;
  /** Ada keluhan kuat di teks (dipakai menentukan bagian penanganan kendala). */
  complaint: boolean;
  reasons: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function classify(i: ClassifyInput): Classification {
  const improve = analyzeText(i.improve, "improve");
  const suggestion = analyzeText(i.suggestion, "saran");
  const hasMasukan = improve.kind === "masukan" || suggestion.kind === "masukan";
  const complaint = improve.complaint || suggestion.complaint;

  const index = i.index === null ? null : round2(i.index);
  const belowKpi = index !== null && index < FOLLOWUP_KPI;
  const detractor = i.nps !== null && i.nps <= DETRACTOR_MAX;
  const lowCount = i.lowItems.length;
  const lowFlag = belowKpi || detractor || lowCount > 0;

  const reasons: string[] = [];
  if (i.issueYes) reasons.push("mengalami kendala");
  if (complaint) reasons.push("keluhan di teks");
  if (belowKpi) reasons.push(`index ${index} < ${FOLLOWUP_KPI}`);
  if (detractor) reasons.push(`skor rekomendasi ${i.nps}`);
  if (lowCount > 0) reasons.push(`${lowCount} butir ≤ ${LOW_ITEM_MAX}`);
  if (hasMasukan) reasons.push("ada kritik atau saran");

  let klass: FollowupClass | null = null;
  if (i.issueYes) klass = "Pengalaman Kendala";
  else if (complaint) klass = "Indikasi Kendala";
  else if (lowFlag && hasMasukan) klass = "Saran + Skor Rendah";
  else if (lowFlag) klass = "Skor Rendah";
  else if (hasMasukan) klass = "Saran Perbaikan";

  let priority: Priority | null = null;
  if (klass) {
    const high =
      i.issueYes || complaint || detractor || lowCount >= HIGH_LOW_ITEMS || (index !== null && index < HIGH_INDEX_BELOW);
    priority = high ? "Tinggi" : "Sedang";
  }

  return { needsFollowup: klass !== null, klass, priority, complaint, reasons };
}

/* ------------------------------------------------------------------ */

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

const firstSentence = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^.{20,}?[.!?](?=\s|$)/);
  return m ? m[0] : t;
};

export interface SummaryInput extends ClassifyInput {
  klass: FollowupClass;
}

/** Versi ringkas (satu kalimat) dan kutipan asli yang disimpan di sheet. Versi panjang selalu diambil langsung dari survei. */
export function buildSummary(i: SummaryInput, opts: { force?: boolean } = {}): { summary: string; quote: string } {
  const oneLine = (t: string) => t.replace(/\s+/g, " ").trim();
  // force = pengguna menandai jawaban ini sebagai masukan walau sistem membacanya apresiasi: semua teks berisi dipakai.
  const kindOf = (t: string, field: TextField): TextKind => {
    const k = analyzeText(t, field).kind;
    return opts.force && k === "apresiasi" ? "masukan" : k;
  };
  const improveKind = kindOf(i.improve, "improve");
  const suggestionKind = kindOf(i.suggestion, "saran");
  // Teks utama = kolom "perlu diperbaiki" bila berisi masukan; selain itu kolom saran.
  const primary = improveKind === "masukan" ? oneLine(i.improve) : suggestionKind === "masukan" ? oneLine(i.suggestion) : "";
  const extraRaw = primary === oneLine(i.improve) ? i.suggestion : i.improve;
  const extra = analyzeText(extraRaw, primary === oneLine(i.improve) ? "saran" : "improve").kind === "kosong" ? "" : oneLine(extraRaw);
  const verbatim = primary;
  const texts = primary ? [primary] : [];

  if (!texts.length) {
    if (i.issueYes) {
      return {
        summary: "Responden menyatakan pernah mengalami kendala, tanpa uraian masalah tertulis.",
        quote: "Tidak ada uraian tertulis; responden memilih Ya pada pertanyaan kendala.",
      };
    }
    const parts: string[] = [];
    if (i.index !== null) parts.push(`Index jawaban ${round2(i.index).toLocaleString("id-ID", { minimumFractionDigits: 2 })} di bawah standar ${FOLLOWUP_KPI.toLocaleString("id-ID", { minimumFractionDigits: 2 })}`);
    if (i.lowItems.length) parts.push(`${i.lowItems.length} butir bernilai ${LOW_ITEM_MAX} atau kurang`);
    if (i.nps !== null && i.nps <= DETRACTOR_MAX) parts.push(`skor rekomendasi ${i.nps}`);
    return { summary: `${parts.join("; ") || "Perlu ditinjau"}, tanpa komentar tertulis.`, quote: "" };
  }

  const lead = i.issueYes
    ? "Responden pernah mengalami kendala dan menyampaikan"
    : analyzeText(verbatim).complaint
      ? "Responden menyampaikan keluhan"
      : "Responden menyampaikan masukan";
  const quote = `“${clip(verbatim, 400)}”` + (extra && extra !== verbatim ? `\nMasukan tambahan: “${clip(extra, 300)}”` : "");
  return { summary: `${lead}: ${clip(firstSentence(verbatim), 140)}`, quote };
}

export function formatLowItems(items: { no: number; text: string; score: number }[]): string {
  if (!items.length) return "Tidak ada";
  const shown = items.slice(0, 6).map((x) => `No. ${x.no} (skor ${x.score}): ${clip(x.text, 70)}`);
  const rest = items.length - shown.length;
  return shown.join("; ") + (rest > 0 ? `; dan ${rest} butir lainnya` : "");
}
