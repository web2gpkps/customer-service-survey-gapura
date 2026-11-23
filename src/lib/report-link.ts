import { applyFilters, parseScope, type ReportScope } from "./filters";
import { kindOf, type ShareLink } from "./share-store";
import type { DashboardData } from "./sheets";
import { SEGMENT_IDS } from "./survey-config";

/** Link laporan yang sah: ada, jenis "laporan", belum diputus/kedaluwarsa (pemanggil memeriksa isDead). */
export const isReportLink = (link: ShareLink | null): link is ShareLink => !!link && kindOf(link) === "laporan";

export const scopeOf = (link: ShareLink): ReportScope => parseScope(new URLSearchParams(link.scope ?? ""));

/**
 * Data yang dikirim ke pemegang link dikunci di server sesuai cakupan link:
 * segmen di luar cakupan dikosongkan, filter diterapkan, dan jawaban tertulis dibuang
 * bila "Kata responden" tidak termasuk konten. Pemegang link tidak bisa mengubah cakupan lewat URL.
 */
export function lockToScope(data: DashboardData, scope: ReportScope): DashboardData {
  const showComments = scope.content.includes("responden");
  const segments = Object.fromEntries(
    SEGMENT_IDS.map((seg) => {
      const s = data.segments[seg];
      const responses = scope.segments.includes(seg)
        ? applyFilters(s.responses, scope.filters[seg]).map((r) =>
            showComments ? r : { ...r, comments: { best: "", improve: "", suggestion: "" } },
          )
        : [];
      return [seg, { ...s, responses }];
    }),
  ) as DashboardData["segments"];
  return { ...data, segments };
}
