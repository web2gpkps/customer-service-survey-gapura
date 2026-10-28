import {
  KPI_TARGET,
  categorize,
  formatIndex,
  meetsKpi,
  type NpsResult,
  type Response,
  type SurveyResult,
} from "@/lib/scoring";
import type { SegmentMeta } from "@/lib/survey-config";
import { NpsDetailButton } from "./NpsDetail";
import { StatusBadge, toneMark, toneText } from "./ui";

const pos = (v: number) => `${((Math.min(Math.max(v, 1), 5) - 1) / 4) * 100}%`;

export function HeroIndex({
  meta,
  result,
  className = "",
  large = false,
}: {
  meta: SegmentMeta;
  result: SurveyResult;
  className?: string;
  large?: boolean;
}) {
  const idx = result.overall.index;
  const cat = categorize(idx);
  const gap = idx === null ? null : idx - KPI_TARGET;

  return (
    <div className={`card rise relative overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-lime to-brand" aria-hidden />
      <div className={large ? "p-6 pl-8 sm:p-10 sm:pl-12" : "p-5 pl-7 sm:p-7 sm:pl-9"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Index keseluruhan · {meta.label}</p>
            <h2 className={`mt-0.5 font-bold text-ink ${large ? "text-xl" : "text-base"}`}>
              Kepuasan {meta.audience.toLowerCase()}
            </h2>
          </div>
          <StatusBadge category={cat} size="lg" />
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="leading-none">
            <span
              className={`font-extrabold tracking-[-0.04em] text-ink ${
                large ? "text-[5rem] sm:text-[8rem]" : "text-[4.5rem] sm:text-[5.5rem]"
              }`}
            >
              {formatIndex(idx)}
            </span>
            <span className="ml-1.5 text-xl font-semibold text-muted">/ 5,00</span>
          </p>
          <div className="pb-2">
            <p className={`font-bold ${large ? "text-2xl" : "text-lg"} ${cat ? toneText(cat.tone) : "text-muted"}`}>
              {cat?.label ?? "Belum ada data"}
            </p>
            {gap !== null && (
              <p className={`${large ? "text-base" : "text-sm"} text-ink-2`}>
                {gap >= 0 ? (
                  <>
                    <b className="num">{formatIndex(gap)}</b> di atas standar KPI <b>4,50</b>
                  </>
                ) : (
                  <>
                    Kurang <b className="num">{formatIndex(-gap)}</b> untuk mencapai standar KPI <b>4,50</b>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className={large ? "mt-12" : "mt-8"} aria-hidden>
          <div className="relative h-3 rounded-full">
            <div className="absolute inset-0 flex overflow-hidden rounded-full">
              <span className="bg-crit-wash" style={{ width: pos(3) }} />
              <span className="bg-warn-wash" style={{ width: `calc(${pos(4.5)} - ${pos(3)})` }} />
              <span className="flex-1 bg-good-wash" />
            </div>
            {idx !== null && (
              <div
                className={`grow-x absolute inset-y-0 left-0 rounded-full ${cat ? toneMark(cat.tone) : ""}`}
                style={{ width: pos(idx) }}
              />
            )}
            <div className="absolute -top-2 -bottom-2 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pos(KPI_TARGET) }} />
            <span
              className="absolute -top-7 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white"
              style={{ left: pos(KPI_TARGET) }}
            >
              KPI 4,50
            </span>
          </div>
          <div className="relative mt-2 h-4 font-mono text-[11px] text-muted">
            {[1, 2, 3, 4, 5].map((t) => (
              <span
                key={t}
                className="num absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                style={{ left: pos(t) }}
              >
                {t},00
              </span>
            ))}
          </div>
          <div className="mt-2 flex text-[11px] font-medium text-ink-2">
            <span style={{ width: pos(3) }}>Belum memenuhi</span>
            <span style={{ width: `calc(${pos(4.5)} - ${pos(3)})` }}>Perlu peningkatan</span>
            <span className="flex-1 text-right">Memenuhi</span>
          </div>
        </div>
        <p className="sr-only">
          Index {formatIndex(idx)} dari 5, kategori {cat?.label}, status {cat?.status}.
        </p>
      </div>
    </div>
  );
}

export function SummaryTiles({
  meta,
  result,
  nps,
  responses,
  airports,
  className = "",
}: {
  meta: SegmentMeta;
  result: SurveyResult;
  nps: NpsResult;
  responses?: Response[];
  airports?: Record<string, string>;
  className?: string;
}) {
  const sectionsMet = result.sections.filter((s) => meetsKpi(s.index)).length;
  const sectionsWithData = result.sections.filter((s) => s.index !== null).length;
  const statements = result.sections.flatMap((s) => s.statements).filter((s) => s.index !== null);
  const statementsBelow = statements.filter((s) => !meetsKpi(s.index)).length;

  return (
    <div className={`grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 ${className}`}>
      <Tile
        label="Responden"
        value={result.respondents.toLocaleString("id-ID")}
        note={`${meta.audience} yang mengisi survei`}
        delay={60}
      />
      <Tile
        label="Bagian lolos KPI"
        value={
          <>
            {sectionsMet}
            <span className="text-lg font-bold text-muted"> / {sectionsWithData}</span>
          </>
        }
        note={
          <span className="mt-1 flex gap-1" aria-hidden>
            {result.sections.map((s) => {
              const c = categorize(s.index);
              return (
                <span
                  key={s.code}
                  title={`${s.code}. ${s.short}: ${formatIndex(s.index)}`}
                  className={`h-1.5 flex-1 rounded-full ${c ? toneMark(c.tone) : "bg-line"}`}
                />
              );
            })}
          </span>
        }
        delay={120}
      />
      <Tile
        label="Butir di bawah 4,50"
        value={
          <>
            {statementsBelow}
            <span className="text-lg font-bold text-muted"> / {statements.length}</span>
          </>
        }
        note="Pernyataan yang skornya belum sampai standar"
        delay={180}
      />
      <Tile
        label="Net Promoter Score"
        value={nps.score === null ? "–" : nps.score > 0 ? `+${nps.score}` : String(nps.score)}
        note={
          nps.n ? (
            <span className="num block">
              Dari {nps.n} jawaban:
              <span className="mt-1 block space-y-0.5">
                <span className="block">
                  <b className="text-ink">{nps.promoters}</b> promotor (skor 9–10) · sangat puas, mau merekomendasikan
                </span>
                <span className="block">
                  <b className="text-ink">{nps.passives}</b> pasif (skor 7–8) · puas tapi biasa saja
                </span>
                <span className="block">
                  <b className="text-ink">{nps.detractors}</b> detraktor (skor 0–6) · kurang puas, berisiko tidak
                  merekomendasikan
                </span>
              </span>
              {responses && airports && <NpsDetailButton responses={responses} airports={airports} segment={meta.id} />}
            </span>
          ) : (
            "Belum ada yang menjawab"
          )
        }
        delay={240}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  delay: number;
}) {
  return (
    <div className="card rise flex flex-col justify-between p-4 sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <p className="eyebrow">{label}</p>
      <div className="mt-3">
        <p className="text-[2rem] leading-none font-extrabold tracking-tight text-ink sm:text-[2.25rem]">{value}</p>
        <div className="mt-2 text-xs text-muted">{note}</div>
      </div>
    </div>
  );
}
