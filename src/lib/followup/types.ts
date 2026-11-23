import { OTHER_SECTION, SECTION_CATALOG, type Segment } from "../survey-config";

export type { Segment };

/** Standar minimum Index JOUMPA: jawaban dengan index di bawah ini perlu ditindaklanjuti. */
export const FOLLOWUP_KPI = 4.5;
/** Index di bawah ini langsung berprioritas Tinggi (kategori "Belum Memenuhi" + "Puas" bawah). */
export const HIGH_INDEX_BELOW = 4;
/** Jumlah butir skor rendah yang membuat prioritas langsung Tinggi (satu butir saja masuk Sedang). */
export const HIGH_LOW_ITEMS = 2;
/** Butir bernilai sampai angka ini dianggap skor rendah. */
export const LOW_ITEM_MAX = 3;
/** Skor rekomendasi sampai angka ini dianggap detractor. */
export const DETRACTOR_MAX = 6;

export const STATUSES = ["Dalam pemantauan", "Dalam proses", "Selesai", "Tidak perlu tindak lanjut"] as const;
export type Status = (typeof STATUSES)[number];
export const CLOSED_STATUSES: readonly Status[] = ["Selesai", "Tidak perlu tindak lanjut"];

export const PRIORITIES = ["Tinggi", "Sedang", "Rendah"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Batas waktu penyelesaian sejak tanggal survei; sama dengan rumus kolom Target Selesai di sheet. */
export const TARGET_DAYS: Record<Priority, number> = { Tinggi: 3, Sedang: 14, Rendah: 14 };

export const CLASSES = [
  "Pengalaman Kendala",
  "Indikasi Kendala",
  "Saran + Skor Rendah",
  "Skor Rendah",
  "Saran Perbaikan",
] as const;
export type FollowupClass = (typeof CLASSES)[number];

/** Pembacaan sistem untuk jawaban yang tidak perlu ditindaklanjuti. Ditampilkan di tab Apresiasi, belum masuk sheet. */
export const APPRECIATION = "Apresiasi";

/**
 * Kategori isu = bagian kuesioner, sama dengan "Index per bagian layanan" di dashboard (Reservasi, Keberangkatan,
 * Kedatangan, dst.). Tiap segmen punya daftar bagiannya sendiri, ditambah "Lainnya".
 */
export const categoriesFor = (segment: Segment): string[] => [...SECTION_CATALOG[segment].map((s) => s.short), OTHER_SECTION.short];
export const ALL_CATEGORIES: string[] = [...new Set([...categoriesFor("b2c"), ...categoriesFor("b2b")])];
export type Category = string;

/** Bagian yang menampung jawaban "mengalami kendala". */
export const KENDALA_CATEGORY: Record<Segment, string> = { b2c: "Penanganan kendala", b2b: "Irregularity & komplain" };

/** Format evidence di sheet: satu baris per berkas, "Judul | https://tautan". */
export const EVIDENCE_SEP = " | ";
export interface EvidenceEntry {
  title: string;
  url: string;
}
export function parseEvidence(cell: string): EvidenceEntry[] {
  return cell
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const i = line.lastIndexOf(EVIDENCE_SEP);
      const url = i >= 0 ? line.slice(i + EVIDENCE_SEP.length).trim() : "";
      return /^https:\/\/(drive|docs)\.google\.com\//.test(url) ? [{ title: line.slice(0, i).trim(), url }] : [];
    });
}

export type Role = "admin" | "manager" | "viewer";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Management", viewer: "Lihat saja" };
export const canEdit = (role: Role | null): role is "admin" | "manager" => role === "admin" || role === "manager";

/** Satu baris tracker. Tidak memuat data pribadi responden; itu diambil terpisah saat detail dibuka. */
export interface FollowupItem {
  segment: Segment;
  id: string; // mis. B2C-007
  row: number; // nomor baris di sheet (1-based)
  responseId: string; // Submission ID di sheet survei; kosong bila belum terpetakan
  date: string; // YYYY-MM-DD
  station: string;
  klass: string;
  priority: string;
  category: string;
  summary: string; // versi ringkas
  quote: string; // kutipan asli yang ikut tersimpan di sheet (boleh kosong)
  status: Status;
  pic: string;
  action: string;
  target: string; // YYYY-MM-DD
  done: string; // YYYY-MM-DD
  contacted: boolean;
  nps: number | null;
  lowItems: string;
  services: string;
  channel: string;
  context: string; // nomor penerbangan (B2C) atau instansi (B2B)
  systemClass: string;
  updatedBy: string;
  updatedAt: string;
  history: string;
  note: string;
  /** Tautan evidence yang sudah diunggah ke Drive, satu baris per berkas ("Judul | tautan"). */
  evidence: string;
}

/** Jawaban survei yang sistem nilai tidak perlu ditindaklanjuti (apresiasi). Belum ada di sheet tracker. */
export interface AppreciationItem {
  segment: Segment;
  responseId: string;
  date: string;
  station: string;
  summary: string;
  nps: number | null;
  index: number | null;
}

export const SEGMENT_PREFIX: Record<Segment, string> = { b2c: "B2C", b2b: "B2B" };

/** Kolom sheet tracker. A sampai R sudah ada; S sampai X ditambahkan oleh sistem. */
export const COLS = [
  "ID",
  "Tanggal Survei",
  "Bandara",
  "Klasifikasi",
  "Prioritas",
  "Kategori Isu",
  "Ringkasan Feedback",
  "Status",
  "PIC",
  "Tindakan Follow Up",
  "Target Selesai",
  "Tanggal Selesai",
  "Pelanggan Dihubungi",
  "Skor Rekomendasi (0–10)",
  "Butir Skor ≤ 3",
  "Layanan",
  "Kanal Reservasi",
  "Penerbangan / Instansi",
  "ID Respons",
  "Klasifikasi Sistem",
  "Diubah Oleh",
  "Terakhir Diubah",
  "Riwayat Perubahan",
  "Catatan Sinkron",
  "Link Evidence",
] as const;
export const COL = Object.fromEntries(COLS.map((c, i) => [c, i])) as Record<(typeof COLS)[number], number>;
export const LAST_COL_LETTER = "Y";

export const QUOTE_MARK = "\nPernyataan asli:";
