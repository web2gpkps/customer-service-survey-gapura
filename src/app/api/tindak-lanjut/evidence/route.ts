import { getRole } from "@/lib/followup/auth";
import { signatureOk, uploadToDrive, validateFile } from "@/lib/followup/evidence";
import { EVIDENCE_MAX_BYTES, EVIDENCE_MAX_FILES, EVIDENCE_TITLE_MAX, evidenceFileName, extOf } from "@/lib/followup/evidence-shared";
import { ConflictError, ValidationError, addEvidence, readTracker } from "@/lib/followup/tracker";
import { canEdit, ROLE_LABEL, type EvidenceEntry, type Segment } from "@/lib/followup/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface FileResult {
  index: number;
  ok: boolean;
  error?: string;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Unggah evidence satu item. Hanya admin dan management. Setiap berkas dikirim ke Google Drive, lalu tautannya ditambahkan
 * ke kolom Link Evidence di sheet. Berkas yang gagal dilaporkan satu per satu supaya bisa diunggah ulang tanpa mengulang yang berhasil.
 */
export async function POST(request: Request) {
  const role = await getRole();
  if (!canEdit(role)) return json({ error: "Tidak berwenang mengunggah evidence." }, 403);

  // Perlindungan CSRF: permintaan harus berasal dari halaman yang sama.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) return json({ error: "Asal permintaan tidak sah." }, 403);
    } catch {
      return json({ error: "Asal permintaan tidak sah." }, 403);
    }
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > EVIDENCE_MAX_BYTES * EVIDENCE_MAX_FILES + 1_000_000) return json({ error: "Ukuran unggahan terlalu besar." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Data unggahan tidak terbaca." }, 400);
  }

  const segment = String(form.get("segment") ?? "") as Segment;
  const id = String(form.get("id") ?? "");
  if (!["b2c", "b2b"].includes(segment) || !/^B2[CB]-\d{1,5}$/.test(id)) return json({ error: "Item tidak valid." }, 400);

  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  let titles: string[] = [];
  try {
    titles = JSON.parse(String(form.get("titles") ?? "[]")) as string[];
  } catch {
    return json({ error: "Judul evidence tidak valid." }, 400);
  }
  if (!files.length || files.length > EVIDENCE_MAX_FILES || titles.length !== files.length) {
    return json({ error: `Pilih 1 sampai ${EVIDENCE_MAX_FILES} berkas, masing-masing dengan judul.` }, 400);
  }

  const snap = await readTracker({ fresh: true });
  const item = snap.items.find((i) => i.segment === segment && i.id === id);
  if (!item) return json({ error: "Item tidak ditemukan." }, 404);

  const results: FileResult[] = [];
  const done: EvidenceEntry[] = [];

  for (const [index, file] of files.entries()) {
    const title = String(titles[index] ?? "").replace(/\s+/g, " ").trim().slice(0, EVIDENCE_TITLE_MAX);
    const problem = !title ? "Judul evidence wajib diisi." : validateFile({ name: file.name, size: file.size });
    if (problem) {
      results.push({ index, ok: false, error: problem });
      continue;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = extOf(file.name);
      if (!signatureOk(ext, bytes)) {
        results.push({ index, ok: false, error: "Isi berkas tidak sesuai dengan jenisnya." });
        continue;
      }
      const name = evidenceFileName({ id: item.id, date: item.date, station: item.station, title, ext });
      const uploaded = await uploadToDrive(name, bytes);
      done.push({ title, url: uploaded.url });
      results.push({ index, ok: true });
    } catch (err) {
      console.error("Unggah evidence gagal:", err);
      results.push({ index, ok: false, error: err instanceof Error ? err.message : "Unggahan gagal." });
    }
  }

  let saved = item;
  if (done.length) {
    try {
      saved = await addEvidence(segment, id, done, ROLE_LABEL[role]);
    } catch (err) {
      console.error("Gagal mencatat evidence ke sheet:", err);
      const message = err instanceof ConflictError || err instanceof ValidationError ? err.message : "Gagal mencatat tautan evidence ke Google Sheet.";
      // Berkas sudah ada di Drive tetapi tautannya belum tercatat: semua dilaporkan gagal agar pengguna mengulang.
      return json({ ok: false, results: results.map((r) => (r.ok ? { ...r, ok: false, error: message } : r)) });
    }
  }

  return json({ ok: results.every((r) => r.ok), results, item: { ...saved, history: "" } });
}
