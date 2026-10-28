"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Download, Presentation, RefreshCw, RotateCcw, Share2 } from "lucide-react";
import { refreshData } from "@/app/actions";
import {
  ALL_CONTENT,
  EMPTY_FILTERS,
  KPI_OPTIONS,
  applyFilters,
  hasFilters,
  institutionOptions,
  type Filters,
  type KpiValue,
  type ReportScope,
} from "@/lib/filters";
import { buildSegmentReport } from "@/lib/report";
import { categorize, computeSurvey, formatIndex } from "@/lib/scoring";
import type { DashboardData } from "@/lib/sheets";
import { SEGMENT_IDS, SEGMENT_META, type Segment } from "@/lib/survey-config";
import { MultiSelect } from "./MultiSelect";
import { PresentationMode } from "./PresentationMode";
import { SegmentView } from "./SegmentView";
import { ExportDialog } from "./ExportDialog";
import { ShareDialog } from "./ShareDialog";
import { formatDateTime, formatMonth, stationLabel, toneMark } from "./ui";
import { useAutoRefresh } from "./useAutoRefresh";

const AUTO_REFRESH_MS = 2 * 60_000;

export function Dashboard({ data, initialTab }: { data: DashboardData; initialTab: Segment }) {
  const router = useRouter();
  const [tab, setTab] = useState<Segment>(initialTab);
  const [filters, setFilters] = useState<Record<Segment, Filters>>({ b2c: EMPTY_FILTERS, b2b: EMPTY_FILTERS });
  const [dialog, setDialog] = useState<"share" | "export" | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  useAutoRefresh(AUTO_REFRESH_MS);

  const meta = SEGMENT_META[tab];
  const segment = data.segments[tab];
  const f = filters[tab];
  const filtered = useMemo(() => applyFilters(segment.responses, f), [segment.responses, f]);

  const options = useMemo(() => {
    const all = segment.responses;
    return {
      months: [...new Set(all.map((r) => r.date.slice(0, 7)))].filter(Boolean).sort().reverse(),
      stations: [...new Set(all.map((r) => r.station))].filter(Boolean).sort(),
      services: [...new Set(all.flatMap((r) => r.services))].sort(),
      institutions: institutionOptions(all),
    };
  }, [segment.responses]);

  const tabSummary = useMemo(
    () =>
      SEGMENT_IDS.map((id) => {
        const seg = data.segments[id];
        const rs = applyFilters(seg.responses, filters[id]);
        const idx = computeSurvey(seg.sections, rs).overall.index;
        return { id, n: rs.length, index: idx, category: categorize(idx) };
      }),
    [data, filters],
  );

  const filterText = useMemo(
    () => (presenting ? buildSegmentReport(data, tab, f).filterText : ""),
    [presenting, data, tab, f],
  );
  const closePresenting = useCallback(() => setPresenting(false), []);
  // Harus dipanggil langsung dari klik pengguna agar browser mengizinkan layar penuh.
  const startPresenting = () => {
    setPresenting(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const selectTab = (id: Segment) => {
    setTab(id);
    const url = new URL(window.location.href);
    if (id === "b2c") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [tab]: { ...prev[tab], [key]: value } }));

  const currentScope = (): ReportScope => ({ segments: [tab], filters, content: [...ALL_CONTENT] });

  return (
    <div className="min-h-dvh">
      <header className="runway border-b border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-4 pt-5 pb-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Image
              src="/logo-gapura.webp"
              alt="Gapura Airport Services"
              width={1052}
              height={569}
              priority
              className="h-10 w-auto shrink-0 sm:h-12"
            />
            <div className="h-10 w-px shrink-0 bg-line-strong" aria-hidden />
            <div className="min-w-0">
              <p className="eyebrow">Survei kepuasan pelanggan · skala 1 sampai 5</p>
              <h1 className="text-lg leading-tight font-extrabold tracking-tight text-ink sm:text-2xl">
                JOUMPA CSS SURVEY DASHBOARD
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="mr-1 text-right text-xs leading-snug text-muted">
              Data Realtime
              <br />
              <span className="font-medium text-ink-2">per {formatDateTime(data.fetchedAt)}</span>
            </p>
            <button
              onClick={() =>
                startRefresh(async () => {
                  await refreshData();
                  router.refresh();
                })
              }
              disabled={refreshing}
              aria-label="Muat ulang data"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2 disabled:opacity-60"
            >
              <RefreshCw aria-hidden className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden lg:inline">{refreshing ? "Memuat…" : "Muat ulang"}</span>
            </button>
            <button
              onClick={startPresenting}
              aria-label="Mulai mode presentasi"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2"
            >
              <Presentation aria-hidden className="size-4" />
              <span className="hidden sm:inline">Presentasi</span>
            </button>
            <button
              onClick={() => setDialog("export")}
              aria-label="Export data"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2"
            >
              <Download aria-hidden className="size-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={() => setDialog("share")}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
            >
              <Share2 aria-hidden className="size-4" />
              Bagikan
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
          <div role="tablist" aria-label="Segmen survei" className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            {tabSummary.map((t) => {
              const seg = SEGMENT_META[t.id];
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active}
                  aria-controls="segment-panel"
                  onClick={() => selectTab(t.id)}
                  className={`group relative flex min-h-16 items-center gap-3 rounded-t-xl border border-b-0 px-3 py-3 text-left transition-colors sm:min-w-72 sm:px-5 ${
                    active ? "border-line bg-page" : "border-transparent hover:bg-sunken"
                  }`}
                >
                  <span
                    className={`grid h-9 min-w-12 place-items-center rounded-lg px-2 font-mono text-sm font-semibold ${
                      active ? "bg-ink text-white" : "bg-sunken text-ink-2 ring-1 ring-line"
                    }`}
                  >
                    {seg.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${active ? "text-ink" : "text-ink-2"}`}>
                      {seg.audience}
                    </span>
                    <span className="block text-xs text-muted">{t.n} respons</span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="num block text-xl font-extrabold tracking-tight text-ink">
                      {formatIndex(t.index)}
                    </span>
                    {t.category && (
                      <span className="flex items-center justify-end gap-1 text-[11px] font-medium text-muted">
                        <span className={`size-1.5 rounded-full ${toneMark(t.category.tone)}`} aria-hidden />
                        {t.category.label}
                      </span>
                    )}
                  </span>
                  {active && <span className="absolute inset-x-0 -top-px h-[3px] rounded-t-xl bg-brand" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur supports-[backdrop-filter]:bg-page/80">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <MultiSelect
            label="Periode"
            values={f.month}
            onChange={(v) => setFilter("month", v)}
            allLabel="Semua periode"
            options={options.months.map((m) => ({ value: m, label: formatMonth(m) }))}
            className="flex-1 basis-40 sm:max-w-60"
          />
          <MultiSelect
            label="Bandara"
            values={f.station}
            onChange={(v) => setFilter("station", v)}
            allLabel="Semua bandara"
            options={options.stations.map((s) => ({ value: s, label: stationLabel(s, data.airports) }))}
            className="flex-1 basis-40 sm:max-w-60"
          />
          <MultiSelect
            label="Jenis layanan"
            values={f.service}
            onChange={(v) => setFilter("service", v)}
            allLabel="Semua layanan"
            options={options.services.map((s) => ({ value: s, label: s }))}
            className="flex-1 basis-40 sm:max-w-80"
          />
          {tab === "b2b" && options.institutions.length > 0 && (
            <MultiSelect
              label="Instansi"
              values={f.institution}
              onChange={(v) => setFilter("institution", v)}
              allLabel="Semua instansi"
              options={options.institutions}
              className="flex-1 basis-40 sm:max-w-80"
            />
          )}
          <MultiSelect
            label="KPI"
            values={f.kpi}
            onChange={(v) => setFilter("kpi", v as KpiValue[])}
            allLabel="Semua status KPI"
            options={KPI_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            className="flex-1 basis-40 sm:max-w-72"
          />
          <div className="flex min-h-10 items-center gap-3 sm:ml-auto">
            <p className="text-sm text-muted" aria-live="polite">
              <span className="num font-bold text-ink">{filtered.length}</span> dari{" "}
              <span className="num">{segment.responses.length}</span> respons
            </p>
            {hasFilters(f) && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, [tab]: EMPTY_FILTERS }))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand hover:bg-brand-wash"
              >
                <RotateCcw aria-hidden className="size-3.5" /> Hapus filter
              </button>
            )}
          </div>
        </div>
      </div>

      <main
        id="segment-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="mx-auto max-w-[1320px] px-4 pt-6 pb-16 sm:px-6 lg:px-8"
      >
        <SegmentView
          key={`${tab}-${JSON.stringify(f)}`}
          meta={meta}
          sheet={segment.sheet}
          sections={segment.sections}
          responses={filtered}
          airports={data.airports}
          unmapped={segment.unmapped}
        />
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>PT Gapura Angkasa · Survei kepuasan pelanggan JOUMPA</span>
          <span>Data diperbarui otomatis tiap 2 menit selama halaman terbuka</span>
        </div>
      </footer>

      {presenting && (
        <PresentationMode
          meta={meta}
          sections={segment.sections}
          responses={filtered}
          airports={data.airports}
          filterText={filterText}
          onClose={closePresenting}
        />
      )}
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} data={data} initialScope={currentScope} />
      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} data={data} initialScope={currentScope} />
    </div>
  );
}
