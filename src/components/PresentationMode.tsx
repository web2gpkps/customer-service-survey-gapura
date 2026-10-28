"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { computeNps, computeSurvey, weeklyTrend, type Response, type SectionDef } from "@/lib/scoring";
import type { SegmentMeta } from "@/lib/survey-config";
import { Priority, Profile, Voices } from "./Insights";
import { SectionIndex } from "./SectionIndex";
import { HeroIndex, SummaryTiles } from "./Summary";
import { TrendChart } from "./TrendChart";

/** Mode presentasi layar penuh: seluruh bagian dashboard disusun ke bawah dan digulir dengan scroll atau panah keyboard. */
export function PresentationMode({
  meta,
  sections,
  responses,
  airports,
  filterText,
  onClose,
}: {
  meta: SegmentMeta;
  sections: SectionDef[];
  responses: Response[];
  airports: Record<string, string>;
  filterText: string;
  onClose: () => void;
}) {
  const result = useMemo(() => computeSurvey(sections, responses), [sections, responses]);
  const trend = useMemo(() => weeklyTrend(sections, responses), [sections, responses]);
  const nps = useMemo(() => computeNps(responses), [responses]);
  const scroller = useRef<HTMLElement>(null);
  // Fokus di area gulir agar panah, Page Down, dan Spasi langsung menggulir.
  useEffect(() => scroller.current?.focus(), []);

  const sectionsList = useMemo<{ title: string; body: ReactNode }[]>(() => {
    if (!responses.length || !sections.length) {
      return [{ title: "Ringkasan", body: <p className="card px-6 py-16 text-center text-lg font-bold">Tidak ada respons untuk filter ini</p> }];
    }
    return [
      {
        title: "Ringkasan",
        body: (
          <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-12">
            <HeroIndex meta={meta} result={result} large className="min-w-0 lg:col-span-7" />
            <SummaryTiles meta={meta} result={result} nps={nps} responses={responses} airports={airports} className="min-w-0 lg:col-span-5" />
          </section>
        ),
      },
      { title: "Index per bagian layanan", body: <SectionIndex result={result} /> },
      {
        title: "Prioritas dan tren",
        body: (
          <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7"><Priority result={result} /></div>
            <div className="min-w-0 lg:col-span-5"><TrendChart points={trend} /></div>
          </section>
        ),
      },
      {
        title: "Profil dan Voice of Customer",
        body: (
          <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5"><Profile meta={meta} responses={responses} airports={airports} /></div>
            <div className="min-w-0 lg:col-span-7"><Voices responses={responses} airports={airports} /></div>
          </section>
        ),
      },
    ];
  }, [airports, meta, nps, responses, result, sections.length, trend]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    // Keluar dari layar penuh (Esc bawaan browser) menutup mode presentasi juga.
    const onFullscreen = () => {
      if (!document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.body.style.overflow = "";
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Mode presentasi" className="fixed inset-0 z-[60] flex flex-col bg-page">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-2.5 sm:px-8">
        <Image src="/logo-gapura.webp" alt="Gapura" width={1052} height={569} className="h-7 w-auto" priority />
        <span className="h-6 w-px bg-line-strong" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-ink">JOUMPA CSS SURVEY DASHBOARD · {meta.label} ({meta.audience})</p>
          <p className="truncate text-xs text-muted">{filterText}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Keluar dari mode presentasi"
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink hover:border-ink-2"
        >
          <X aria-hidden className="size-4" /> <span className="hidden sm:inline">Keluar</span>
        </button>
      </header>

      <main ref={scroller} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto scroll-smooth outline-none px-4 py-6 sm:px-8 min-[1700px]:[zoom:1.15]">
        <div className="mx-auto grid max-w-[1320px] gap-10 pb-16">
          {sectionsList.map((section) => (
            <section key={section.title} aria-label={section.title} className="min-w-0">
              {section.body}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
