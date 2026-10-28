"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";
import { computeNps, computeSurvey, weeklyTrend, type Response, type SectionDef } from "@/lib/scoring";
import type { SegmentMeta } from "@/lib/survey-config";
import { Methodology, Priority, Profile, Voices } from "./Insights";
import { SectionIndex } from "./SectionIndex";
import { HeroIndex, SummaryTiles } from "./Summary";
import { TrendChart } from "./TrendChart";

export function SegmentView({
  meta,
  sheet,
  sections,
  responses,
  airports,
  unmapped,
}: {
  meta: SegmentMeta;
  sheet: string;
  sections: SectionDef[];
  responses: Response[];
  airports: Record<string, string>;
  unmapped: string[];
}) {
  const result = useMemo(() => computeSurvey(sections, responses), [sections, responses]);
  const trend = useMemo(() => weeklyTrend(sections, responses), [sections, responses]);
  const nps = useMemo(() => computeNps(responses), [responses]);

  if (!sections.length) {
    return (
      <div className="card grid place-items-center px-6 py-20 text-center">
        <p className="text-lg font-bold">Kolom pernyataan tidak ditemukan</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          Sheet <span className="font-mono">{sheet}</span> tidak punya kolom berisi skor 1 sampai 5.
        </p>
      </div>
    );
  }

  if (!responses.length) {
    return (
      <div className="card grid place-items-center px-6 py-20 text-center">
        <p className="text-lg font-bold">Tidak ada respons untuk filter ini</p>
        <p className="mt-1 text-sm text-muted">Coba ganti periode, bandara, atau jenis layanan.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:gap-6">
      {unmapped.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-line-strong bg-card px-4 py-3 text-sm text-ink-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <p>
            Ada {unmapped.length} pernyataan baru di sheet yang belum masuk bagian mana pun. Skornya tetap dihitung
            dan tampil di kelompok &quot;Pernyataan lainnya&quot;.
          </p>
        </div>
      )}

      <section aria-label="Ringkasan index" className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:gap-6">
        <HeroIndex meta={meta} result={result} className="min-w-0 lg:col-span-7" />
        <SummaryTiles meta={meta} result={result} nps={nps} responses={responses} airports={airports} className="min-w-0 lg:col-span-5" />
      </section>

      <SectionIndex result={result} />

      <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="min-w-0 lg:col-span-7">
          <Priority result={result} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <TrendChart points={trend} />
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="min-w-0 lg:col-span-5">
          <Profile meta={meta} responses={responses} airports={airports} />
        </div>
        <div className="min-w-0 lg:col-span-7">
          <Voices responses={responses} airports={airports} />
        </div>
      </section>

      <Methodology label={meta.label} sheet={sheet} overall={result.overall.index} />
    </div>
  );
}
