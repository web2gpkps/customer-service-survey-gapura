/**
 * Sinkronisasi survei → sheet tracker, dirancang hemat dan aman terhadap batas Vercel dan Google:
 *
 * - Tidak ada cron dan tidak ada polling berat. Sinkronisasi dipicu (1) saat halaman dibuka dan lewat polling browser,
 *   dibatasi gerbang waktu (default satu kali per 60 detik untuk seluruh pengguna), dan (2) oleh webhook Apps Script
 *   begitu ada respons baru masuk (gerbang 5 detik), sehingga Google Sheet terbarui hampir seketika.
 * - Satu kunci terdistribusi (Upstash) memastikan hanya satu sinkronisasi berjalan pada satu waktu.
 * - Satu putaran = 2 pembacaan (survei, tracker) dan, bila ada item baru, 3 sampai 4 penulisan berkelompok. Jauh di bawah
 *   kuota Google (300 baca per menit per proyek).
 * - Sinkronisasi hanya MENAMBAH baris baru dan menautkan ID respons. Isian manajemen (status, PIC, tindakan) tidak pernah ditimpa.
 */
import { randomBytes } from "node:crypto";
import { clearSheetCache, getDashboardData } from "../sheets";
import { buildCandidates, type Candidate } from "./candidates";
import { release, setIfAbsent } from "./kv";
import { matchLegacy, type LegacyRow, type MatchCandidate } from "./match";
import { appendRows, ensureSchema, nextId, readTracker, writeCells, type CellWrite, type NewRow } from "./tracker";
import { APPRECIATION, categoriesFor, type FollowupItem, type Segment } from "./types";

export interface SyncStatus {
  at: number;
  ran: boolean;
  added: number;
  linked: number;
  flagged: number;
  skipped?: string;
  error?: string;
}

const g = globalThis as unknown as { __followupSync?: SyncStatus };
export const lastSync = (): SyncStatus | null => g.__followupSync ?? null;

const SEGMENTS: Segment[] = ["b2c", "b2b"];
const CHUNK = 150;

const picFor = (segment: Segment, station: string) => (segment === "b2c" ? `Cabang ${station}` : `CA & Cabang ${station}`);

const toLegacy = (i: FollowupItem): LegacyRow => ({
  id: i.id,
  date: i.date,
  station: i.station,
  nps: i.nps,
  context: i.context,
  channel: i.channel,
  services: i.services,
  klass: i.klass,
  text: `${i.summary} ${i.quote}`,
});

const toPool = (c: Candidate): MatchCandidate => ({
  responseId: c.responseId,
  date: c.date,
  station: c.station,
  nps: c.nps,
  context: c.context,
  channel: c.channel,
  services: c.services,
  lowCount: c.lowCount,
  text: c.commentText,
});

export function toNewRow(segment: Segment, id: string, c: Candidate, override?: { klass: string; priority: "Tinggi" | "Sedang" | "Rendah"; summary: string; quote: string; category: string }): NewRow {
  const cls = c.classification;
  return {
    segment,
    id,
    date: c.date,
    station: c.station,
    klass: override?.klass ?? cls.klass ?? "Saran Perbaikan",
    priority: override?.priority ?? cls.priority ?? "Sedang",
    category: override?.category ?? c.category,
    summary: override?.summary ?? c.summary,
    quote: override?.quote ?? c.quote,
    pic: picFor(segment, c.station),
    nps: c.nps,
    lowItems: c.lowItemsText,
    services: c.services,
    channel: c.channel,
    context: c.context,
    responseId: c.responseId,
    systemClass: cls.klass ?? APPRECIATION,
  };
}

/**
 * Jalankan satu putaran sinkronisasi bila gerbang waktu terbuka.
 * `minIntervalMs`: jarak minimum antar putaran untuk seluruh pengguna.
 */
export async function syncTracker(opts: { minIntervalMs: number; fresh?: boolean }): Promise<SyncStatus> {
  const skip = (reason: string): SyncStatus => ({ at: Date.now(), ran: false, added: 0, linked: 0, flagged: 0, skipped: reason });

  if (!(await setIfAbsent("gate", "1", opts.minIntervalMs))) return skip("baru saja disinkronkan");
  const token = randomBytes(8).toString("hex");
  if (!(await setIfAbsent("lock", token, 90_000))) return skip("sinkronisasi lain sedang berjalan");

  const status: SyncStatus = { at: Date.now(), ran: true, added: 0, linked: 0, flagged: 0 };
  try {
    if (opts.fresh) clearSheetCache();
    const data = await getDashboardData();
    let snap = await readTracker({ fresh: true });
    if (!snap.schemaReady) {
      await ensureSchema();
      snap = await readTracker({ fresh: true });
    }

    const writes: CellWrite[] = [];
    const toAppend: Record<Segment, NewRow[]> = { b2c: [], b2b: [] };

    for (const seg of SEGMENTS) {
      const candidates = buildCandidates(data, seg);
      const byId = new Map(candidates.map((c) => [c.responseId, c]));
      const known = new Set(snap.items.filter((i) => i.segment === seg && i.responseId).map((i) => i.responseId));
      const linked = new Map<string, string>(); // ID item lama → ID respons yang baru ditautkan

      // 1. Baris lama yang belum punya ID Respons: petakan ke jawaban survei aslinya.
      const legacy = snap.items.filter((i) => i.segment === seg && !i.responseId);
      if (legacy.length) {
        const pool = candidates.filter((c) => !known.has(c.responseId)).map(toPool);
        for (const m of matchLegacy(legacy.map(toLegacy), pool)) {
          const item = legacy.find((i) => i.id === m.id)!;
          const put = (col: CellWrite["col"], value: string) => writes.push({ segment: seg, row: item.row, col, value });
          if (m.responseId) {
            const c = byId.get(m.responseId)!;
            known.add(m.responseId);
            linked.set(item.id, m.responseId);
            status.linked++;
            put("ID Respons", m.responseId);
            put("Klasifikasi Sistem", c.classification.klass ?? APPRECIATION);
            // Kolom "Butir Skor ≤ 3" yang kosong atau "Tidak ada" padahal ada butir rendah dilengkapi.
            if (!item.lowItems.trim() || (/^tidak ada$/i.test(item.lowItems.trim()) && c.lowCount > 0)) put("Butir Skor ≤ 3", c.lowItemsText);
            const note = m.confidence === "cukup" ? "Dipetakan otomatis ke respons survei (keyakinan sedang); mohon dicek sekali." : "";
            if (item.note !== note) put("Catatan Sinkron", note);
          } else {
            status.flagged++;
            const alt = m.alternatives.slice(0, 3).join(", ");
            const note = `Perlu dicek: belum bisa dipastikan responden aslinya${alt ? ` (kandidat: ${alt})` : ""}.`;
            if (item.note !== note) put("Catatan Sinkron", note);
          }
        }
      }

      // 1b. Kategori lama (Petugas & Penjemputan, dst.) diganti bagian kuesioner. Kategori yang sudah berupa bagian,
      // termasuk hasil pilihan manual, tidak pernah ditimpa.
      const validCategories = new Set(categoriesFor(seg));
      for (const it of snap.items.filter((i) => i.segment === seg && !validCategories.has(i.category))) {
        const c = byId.get(it.responseId || linked.get(it.id) || "");
        if (c) writes.push({ segment: seg, row: it.row, col: "Kategori Isu", value: c.category });
      }

      // 2. Jawaban baru yang perlu ditindaklanjuti dan belum ada di tracker.
      const fresh = candidates
        .filter((c) => c.classification.needsFollowup && c.date && !known.has(c.responseId))
        .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
      const mk = nextId(seg, snap.items);
      toAppend[seg] = fresh.map((c) => toNewRow(seg, mk(), c));
    }

    if (writes.length) {
      for (let i = 0; i < writes.length; i += 400) await writeCells(writes.slice(i, i + 400));
    }
    for (const seg of SEGMENTS) {
      const rows = toAppend[seg];
      for (let i = 0; i < rows.length; i += CHUNK) {
        await appendRows(seg, rows.slice(i, i + CHUNK));
        status.added += Math.min(CHUNK, rows.length - i);
      }
    }
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
    console.error("Sinkronisasi tracker gagal:", err);
  } finally {
    await release("lock", token);
  }
  g.__followupSync = status;
  return status;
}
