import { getDashboardData } from "../sheets";
import { appreciationSummary, buildCandidates } from "./candidates";
import { lastSync } from "./sync";
import { readTracker } from "./tracker";
import type { AppreciationItem, FollowupItem, Segment } from "./types";

export interface FollowupView {
  items: FollowupItem[];
  appreciation: AppreciationItem[];
  /** Jawaban yang perlu ditindaklanjuti tetapi belum masuk sheet (menunggu sinkronisasi berikutnya). */
  pending: number;
  syncedAt: number | null;
  syncError: string | null;
  version: string;
  generatedAt: number;
}

/** Hash FNV-1a sederhana untuk ETag. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export async function loadView(): Promise<FollowupView> {
  const [data, snap] = await Promise.all([getDashboardData(), readTracker()]);
  const tracked = new Set(snap.items.filter((i) => i.responseId).map((i) => `${i.segment}:${i.responseId}`));

  const appreciation: AppreciationItem[] = [];
  let pending = 0;
  for (const seg of ["b2c", "b2b"] as Segment[]) {
    for (const c of buildCandidates(data, seg)) {
      if (tracked.has(`${seg}:${c.responseId}`)) continue;
      if (c.classification.needsFollowup) {
        pending++;
        continue;
      }
      appreciation.push({
        segment: seg,
        responseId: c.responseId,
        date: c.date,
        station: c.station,
        summary: appreciationSummary(data, seg, c.responseId),
        nps: c.nps,
        index: c.index,
      });
    }
  }
  appreciation.sort((a, b) => b.date.localeCompare(a.date));

  // Riwayat perubahan hanya dimuat saat satu item dibuka, bukan di daftar.
  const items = snap.items.map((i) => ({ ...i, history: "" }));
  const sync = lastSync();
  return {
    items,
    appreciation,
    pending,
    syncedAt: sync?.ran ? sync.at : null,
    syncError: sync?.error ?? null,
    version: fnv(items.map((i) => `${i.id}${i.updatedAt}${i.status}${i.pic}${i.action}${i.target}${i.done}${i.klass}${i.priority}`).join("|") + `|${appreciation.length}|${pending}`),
    generatedAt: Date.now(),
  };
}
