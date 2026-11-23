/** Aturan evidence yang dipakai bersama oleh browser (pemilihan berkas) dan server (pemeriksaan ulang). */

export type EvidenceGroup = "dokumen" | "gambar" | "ppt" | "excel";

export const EVIDENCE_GROUPS: Record<EvidenceGroup, { label: string; exts: string[] }> = {
  dokumen: { label: "Dokumen", exts: ["pdf", "doc", "docx", "txt", "rtf", "odt"] },
  gambar: { label: "Gambar", exts: ["jpg", "jpeg", "png", "gif", "webp", "heic"] },
  ppt: { label: "PPT", exts: ["ppt", "pptx"] },
  excel: { label: "Excel", exts: ["xls", "xlsx", "csv"] },
};

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024; // per berkas
export const EVIDENCE_MAX_FILES = 5; // per simpan
export const EVIDENCE_TITLE_MAX = 100;

export const ALL_EVIDENCE_EXTS: string[] = Object.values(EVIDENCE_GROUPS).flatMap((g) => g.exts);

export const extOf = (name: string): string => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export const groupOfExt = (ext: string): EvidenceGroup | null =>
  (Object.entries(EVIDENCE_GROUPS).find(([, g]) => g.exts.includes(ext))?.[0] as EvidenceGroup | undefined) ?? null;

export const acceptFor = (group: EvidenceGroup): string => EVIDENCE_GROUPS[group].exts.map((e) => `.${e}`).join(",");

export const formatBytes = (n: number): string =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${Number((n / 1024 / 1024).toFixed(1))} MB`;

/** Nama berkas di Drive: ID, tanggal survei, bandara, judul dari pengguna (dipisah garis bawah). */
export function evidenceFileName(parts: { id: string; date: string; station: string; title: string; ext: string }): string {
  const clean = (s: string) =>
    [...s]
      .filter((ch) => ch.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(ch))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const base = [parts.id, parts.date, clean(parts.station) || "-", clean(parts.title)].join("_");
  return `${base.slice(0, 180)}.${parts.ext}`;
}
