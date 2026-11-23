/**
 * Unggah evidence ke Google Drive memakai akun Google pemilik (bukan service account), lewat Google Apps Script
 * Web App yang berjalan sebagai pemilik akun dan hanya mau menulis ke satu folder tetap. Server dashboard
 * mengirim berkas (base64) beserta token rahasia; Apps Script membalas tautan berkas.
 *
 * Env: EVIDENCE_UPLOAD_URL (alamat Web App) dan EVIDENCE_UPLOAD_TOKEN (token rahasia). Panduan: integrations/apps-script-evidence-upload.gs
 */
import { ALL_EVIDENCE_EXTS, EVIDENCE_MAX_BYTES, extOf } from "./evidence-shared";

export const evidenceConfigured = (): boolean =>
  Boolean(process.env.EVIDENCE_UPLOAD_URL?.trim() && (process.env.EVIDENCE_UPLOAD_TOKEN?.trim().length ?? 0) >= 24);

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Cek tanda tangan berkas supaya ekstensi tidak sekadar ganti nama (mis. .exe dinamai .pdf). */
export function signatureOk(ext: string, b: Uint8Array): boolean {
  if (b.length < 8) return ext === "txt" || ext === "csv";
  switch (ext) {
    case "pdf":
      return starts(b, [0x25, 0x50, 0x44, 0x46]);
    case "png":
      return starts(b, [0x89, 0x50, 0x4e, 0x47]);
    case "jpg":
    case "jpeg":
      return starts(b, [0xff, 0xd8, 0xff]);
    case "gif":
      return starts(b, [0x47, 0x49, 0x46, 0x38]);
    case "webp":
      return starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8);
    case "heic":
      return starts(b, [0x66, 0x74, 0x79, 0x70], 4);
    case "docx":
    case "pptx":
    case "xlsx":
    case "odt":
      return starts(b, [0x50, 0x4b, 0x03, 0x04]);
    case "doc":
    case "ppt":
    case "xls":
      return starts(b, [0xd0, 0xcf, 0x11, 0xe0]);
    case "rtf":
      return starts(b, [0x7b, 0x5c, 0x72, 0x74, 0x66]);
    case "txt":
    case "csv":
      return !b.slice(0, 2000).includes(0); // teks biasa tidak memuat byte nol
    default:
      return false;
  }
}

export function validateFile(file: { name: string; size: number }): string | null {
  const ext = extOf(file.name);
  if (!ALL_EVIDENCE_EXTS.includes(ext)) return "Jenis berkas tidak didukung.";
  if (file.size <= 0) return "Berkas kosong.";
  if (file.size > EVIDENCE_MAX_BYTES) return "Ukuran berkas melebihi 10 MB.";
  return null;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export interface UploadedFile {
  url: string;
  name: string;
}

/** Kirim satu berkas ke Drive. Melempar galat berpesan jelas bila gagal. */
export async function uploadToDrive(fileName: string, bytes: Uint8Array): Promise<UploadedFile> {
  if (!evidenceConfigured()) throw new Error("Penyimpanan evidence belum tersambung ke Google Drive.");
  const ext = extOf(fileName);
  let res: Response;
  try {
    res = await fetch(process.env.EVIDENCE_UPLOAD_URL!.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: process.env.EVIDENCE_UPLOAD_TOKEN!.trim(),
        fileName,
        mimeType: MIME[ext] ?? "application/octet-stream",
        dataBase64: Buffer.from(bytes).toString("base64"),
      }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("Google Drive tidak merespons.");
  }
  if (!res.ok) throw new Error(`Google Drive menolak unggahan (${res.status}).`);
  let out: { ok?: boolean; url?: string; name?: string; error?: string };
  try {
    out = await res.json();
  } catch {
    throw new Error("Balasan Google Drive tidak dikenali.");
  }
  if (!out.ok || !out.url || !/^https:\/\/(drive|docs)\.google\.com\//.test(out.url)) throw new Error(out.error || "Unggahan ke Google Drive gagal.");
  return { url: out.url, name: out.name ?? fileName };
}
