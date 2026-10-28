"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download, Quote } from "lucide-react";
import type { ContentKey, ReportScope } from "@/lib/filters";
import { buildSegmentReport, pickComments, type SegmentReport } from "@/lib/report";
import { KPI_TARGET, categorize, formatIndex, type Response, type SurveyResult } from "@/lib/scoring";
import type { DashboardData } from "@/lib/sheets";
import { ExportButtons } from "./ExportDialog";
import { Methodology, PriorityList } from "./Insights";
import { LikertLegend, StatementList } from "./StatementDetail";
import { HeroIndex, SummaryTiles } from "./Summary";
import { TrendPlot } from "./TrendChart";
import { StatusBadge, formatDate, formatDateTime, stationLabel, toneMark, toneText } from "./ui";
import { useAutoRefresh } from "./useAutoRefresh";

const AUTO_REFRESH_MS = 5 * 60_000;

/** Laporan satu halaman untuk link yang dibagikan. Hanya bisa dibaca, plus export. */
export function Presentation({ data, query }: { data: DashboardData; query: ReportScope }) {
  useAutoRefresh(AUTO_REFRESH_MS);
  const reports = useMemo(
    () => query.segments.map((seg) => buildSegmentReport(data, seg, query.filters[seg])),
    [data, query],
  );
  const has = (k: ContentKey) => query.content.includes(k);
  const dates = reports.flatMap((r) => r.responses.map((x) => x.date)).filter(Boolean).sort();

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-2.5 sm:px-8">
          <Image src="/logo-gapura.webp" alt="Gapura" width={1052} height={569} className="h-7 w-auto" priority />
          <span className="h-6 w-px bg-line-strong" aria-hidden />
          <span className="truncate text-sm font-bold tracking-tight text-ink">JOUMPA CSS Survey</span>
          {reports.length > 1 && (
            <nav className="ml-3 hidden gap-1 md:flex" aria-label="Segmen">
              {reports.map((r) => (
                <a
                  key={r.seg}
                  href={`#${r.seg}`}
                  className="rounded-md px-2.5 py-1 text-sm font-semibold text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  {r.meta.label}
                </a>
              ))}
            </nav>
          )}
          <span className="ml-auto hidden text-xs text-muted lg:inline">Data per {formatDateTime(data.fetchedAt)}</span>
          <ExportMenu scope={query} />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-14 px-4 pt-10 pb-20 sm:px-8 min-[1700px]:[zoom:1.15]">
        <section className="rise grid gap-8">
          <div>
            <p className="eyebrow">Laporan survei kepuasan pelanggan</p>
            <h1 className="mt-2 text-4xl leading-[0.95] font-extrabold tracking-tight text-ink sm:text-6xl">
              JOUMPA CSS Survey
            </h1>
            <p className="mt-3 text-base text-ink-2 sm:text-lg">
              {dates.length > 0 && (
                <>
                  Respons tanggal {formatDate(dates[0], true)} sampai {formatDate(dates[dates.length - 1], true)}.{" "}
                </>
              )}
              Standar KPI {formatIndex(KPI_TARGET)} pada skala 1 sampai 5.
            </p>
          </div>
          {reports.length > 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              {reports.map((r) => (
                <IndexCard key={r.seg} report={r} />
              ))}
            </div>
          )}
        </section>

        {reports.map((r) => (
          <SegmentReportView key={r.seg} report={r} has={has} airports={data.airports} />
        ))}

        {has("standar") && (
          <section className="grid gap-5">
            <SectionTitle eyebrow="Referensi" title="Standar KPI dan cara menghitung index" />
            <Methodology
              label={reports.length === 1 ? reports[0].meta.label : undefined}
              overall={reports.length === 1 ? reports[0].result.overall.index : undefined}
            />
          </section>
        )}
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-8">
          <span>PT Gapura Angkasa · Survei kepuasan pelanggan JOUMPA</span>
          <span>Data Google Sheets per {formatDateTime(data.fetchedAt)}</span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ExportMenu({ scope }: { scope: ReportScope }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative ml-auto lg:ml-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink hover:border-ink-2"
      >
        <Download aria-hidden className="size-4" />
        Export
        <ChevronDown aria-hidden className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-card p-1.5 shadow-xl">
          <ExportButtons scope={scope} compact />
        </div>
      )}
    </div>
  );
}

function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: ReactNode }) {
  return (
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-[1.75rem]">{title}</h2>
      {description && <div className="mt-1.5 text-base text-ink-2">{description}</div>}
    </div>
  );
}

function IndexCard({ report }: { report: SegmentReport }) {
  const idx = report.result.overall.index;
  const c = categorize(idx);
  return (
    <a href={`#${report.seg}`} className="card relative block overflow-hidden p-6 transition-shadow hover:shadow-md sm:p-7">
      <div className={`absolute inset-x-0 top-0 h-1 ${c ? toneMark(c.tone) : "bg-line"}`} aria-hidden />
      <div className="flex items-center gap-3">
        <span className="grid h-8 min-w-11 place-items-center rounded-md bg-ink px-2 font-mono text-sm font-semibold text-white">
          {report.meta.label}
        </span>
        <span className="font-bold text-ink">{report.meta.audience}</span>
        <span className="num ml-auto text-sm text-muted">{report.responses.length} respons</span>
      </div>
      <p className="mt-6 flex flex-wrap items-end gap-x-4 leading-none">
        <span className="text-6xl font-extrabold tracking-[-0.04em] text-ink sm:text-7xl">{formatIndex(idx)}</span>
        <span className={`pb-2 text-xl font-bold ${c ? toneText(c.tone) : "text-muted"}`}>{c?.label ?? "Belum ada data"}</span>
      </p>
      <div className="mt-4">
        <StatusBadge category={c} />
      </div>
      <p className="mt-4 text-xs text-muted">{report.filterText}</p>
    </a>
  );
}

function SegmentReportView({
  report,
  has,
  airports,
}: {
  report: SegmentReport;
  has: (k: ContentKey) => boolean;
  airports: Record<string, string>;
}) {
  const { meta, result, responses } = report;
  return (
    <section id={report.seg} className="grid scroll-mt-20 gap-10">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b-2 border-ink pb-4">
        <span className="grid h-10 min-w-14 place-items-center rounded-lg bg-ink px-3 font-mono text-lg font-semibold text-white">
          {meta.label}
        </span>
        <div>
          <h2 className="text-3xl leading-none font-extrabold tracking-tight text-ink sm:text-4xl">{meta.audience}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {report.filterText} · {responses.length} respons
          </p>
        </div>
      </div>

      {!responses.length ? (
        <div className="card px-6 py-16 text-center text-muted">Tidak ada respons untuk pilihan ini.</div>
      ) : (
        <>
          {has("ringkasan") && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
              <HeroIndex meta={meta} result={result} className="min-w-0 lg:col-span-7" />
              <SummaryTiles meta={meta} result={result} nps={report.nps} className="min-w-0 lg:col-span-5" />
            </div>
          )}

          {has("bagian") && (
            <Block title="Index per bagian layanan" description="Garis hitam menandai standar KPI 4,50.">
              <SectionBars result={result} />
            </Block>
          )}

          {(has("prioritas") || has("tren")) && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-12 lg:gap-6">
              {has("prioritas") && (
                <div className={`min-w-0 ${has("tren") ? "lg:col-span-7" : "lg:col-span-12"}`}>
                  <Block title="Pernyataan dengan skor terendah" description="Yang paling jauh dari standar 4,50.">
                    <div className="card">
                      <PriorityList result={result} />
                    </div>
                  </Block>
                </div>
              )}
              {has("tren") && (
                <div className={`min-w-0 ${has("prioritas") ? "lg:col-span-5" : "lg:col-span-12"}`}>
                  <Block title="Index per minggu" description="Satu titik mewakili satu minggu (Senin sampai Minggu).">
                    <div className="card min-w-0 overflow-hidden px-3 pt-5 pb-3 sm:px-4">
                      <TrendPlot points={report.trend} height={300} />
                    </div>
                  </Block>
                </div>
              )}
            </div>
          )}

          {has("rincian") && (
            <Block title="Rincian per pernyataan" description="Jumlah responden yang memilih skor 1 sampai 5 di tiap bagian.">
              <LikertLegend />
              <div className="grid gap-4">
                {result.sections.map((s) => {
                  const c = categorize(s.index);
                  return (
                    <div key={s.code} className="card overflow-hidden">
                      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-sunken/60 px-5 py-3 sm:px-6">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink font-mono text-xs font-semibold text-white">
                          {s.code}
                        </span>
                        <span className="min-w-0 flex-1 font-bold text-ink">{s.title}</span>
                        <span className="num text-lg font-extrabold text-ink">{formatIndex(s.index)}</span>
                        <StatusBadge category={c} />
                      </div>
                      <StatementList statements={s.statements} />
                    </div>
                  );
                })}
              </div>
            </Block>
          )}

          {has("responden") && <Voices responses={responses} airports={airports} />}
        </>
      )}
    </section>
  );
}

function Block({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4">
      <SectionTitle title={title} description={description} />
      {children}
    </div>
  );
}

const pos = (v: number) => `${((Math.min(Math.max(v, 1), 5) - 1) / 4) * 100}%`;

function SectionBars({ result }: { result: SurveyResult }) {
  return (
    <div className="card">
      <div className="hidden grid-cols-[minmax(0,15rem)_1fr_5rem_13rem] gap-5 border-b border-line px-6 py-3 md:grid">
        <span className="eyebrow">Bagian</span>
        <div className="relative h-4 font-mono text-[11px] text-muted" aria-hidden>
          {[1, 2, 3, 4, 5].map((t) => (
            <span
              key={t}
              className="num absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: pos(t) }}
            >
              {t}
            </span>
          ))}
          <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: pos(KPI_TARGET) }}>
            4,5
          </span>
        </div>
        <span className="eyebrow text-right">Index</span>
        <span className="eyebrow">Status</span>
      </div>
      <ul>
        {result.sections.map((s) => {
          const c = categorize(s.index);
          return (
            <li
              key={s.code}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,15rem)_1fr_5rem_13rem] md:px-6"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sunken font-mono text-xs font-semibold text-ink-2 ring-1 ring-line">
                  {s.code}
                </span>
                <span className="min-w-0 text-base font-semibold text-ink">{s.short}</span>
              </span>
              <div className="relative col-span-2 row-start-2 h-4 md:col-span-1 md:row-start-auto">
                <span className="absolute inset-0 rounded-sm bg-sunken" aria-hidden />
                {s.index !== null && c && (
                  <span
                    className={`grow-x absolute inset-y-0 left-0 rounded-r-[4px] ${toneMark(c.tone)}`}
                    style={{ width: pos(s.index) }}
                    aria-hidden
                  />
                )}
                <span
                  className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 bg-ink"
                  style={{ left: pos(KPI_TARGET) }}
                  aria-hidden
                />
              </div>
              <span className="num text-right text-2xl font-extrabold text-ink">{formatIndex(s.index)}</span>
              <span className="col-span-2 md:col-span-1">
                <StatusBadge category={c} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Voices({ responses, airports }: { responses: Response[]; airports: Record<string, string> }) {
  const groups = [
    { title: "Yang perlu diperbaiki", items: pickComments(responses, "improve").slice(0, 6) },
    { title: "Yang paling berkesan", items: pickComments(responses, "best").slice(0, 6) },
  ];
  if (groups.every((g) => !g.items.length)) return null;
  return (
    <Block title="Kata responden" description="Jawaban tertulis terbaru dari survei.">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title} className="card overflow-hidden">
            <h3 className="border-b border-line px-5 py-3.5 text-base font-bold text-ink sm:px-6">{g.title}</h3>
            {g.items.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted">Belum ada jawaban.</p>
            ) : (
              <ul>
                {g.items.map(({ r, text }) => (
                  <li key={r.id} className="border-b border-line px-5 py-4 last:border-b-0 sm:px-6">
                    <Quote aria-hidden className="size-4 text-brand" strokeWidth={2.5} />
                    <p className="mt-1.5 text-base leading-relaxed text-ink">{text}</p>
                    <p className="mt-1.5 text-xs text-muted">
                      {r.date && formatDate(r.date)}
                      {r.station && <> · {stationLabel(r.station, airports)}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}
