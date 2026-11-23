"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, LogOut, RefreshCw, RotateCcw, Search } from "lucide-react";
import { logoutFollowup, syncNow } from "@/app/tindak-lanjut/actions";
import {
  categoriesFor,
  CLASSES,
  PRIORITIES,
  ROLE_LABEL,
  STATUSES,
  TARGET_DAYS,
  canEdit,
  type FollowupItem,
  type Role,
  type Segment,
  type Status,
} from "@/lib/followup/types";
import type { FollowupView } from "@/lib/followup/view";
import { formatDate, formatDateTime } from "@/lib/format";
import { SEGMENT_META } from "@/lib/survey-config";
import { FollowupDrawer, type Selection } from "./FollowupDrawer";
import { MultiSelect } from "../MultiSelect";
import { Segmented } from "../ui";
import {
  PRIORITY_TONE,
  STATUS_TONE,
  byNewest,
  byUrgency,
  daysUntil,
  formatIdx,
  isClosed,
  isOverdue,
  todayWib,
} from "./shared";

const POLL_MS = 60_000;
const PAGE = 50;

type Mode = "perlu" | "apresiasi";
type Quick = "terlambat" | "belum" | "dekat";

interface Filters {
  status: string[];
  priority: string[];
  klass: string[];
  category: string[];
  station: string[];
  q: string;
  quick: Quick | null;
}
const EMPTY: Filters = { status: [], priority: [], klass: [], category: [], station: [], q: "", quick: null };
const hasFilters = (f: Filters) => f.q.trim() !== "" || f.quick !== null || [f.status, f.priority, f.klass, f.category, f.station].some((a) => a.length);

export function FollowupApp({ initial, role }: { initial: FollowupView; role: Role }) {
  const editable = canEdit(role);
  const [view, setView] = useState(initial);
  const etag = useRef(`"${initial.version}"`);
  const [segment, setSegment] = useState<Segment>("b2c");
  const [mode, setMode] = useState<Mode>("perlu");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<"urgensi" | "terbaru">("urgensi");
  const [limit, setLimit] = useState(PAGE);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState("");
  const [today, setToday] = useState(todayWib());

  /* ── polling ringan: 304 bila tidak berubah, berhenti saat tab disembunyikan ── */
  useEffect(() => {
    let timer: number | undefined;
    let delay = POLL_MS;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/tindak-lanjut/state", { headers: { "If-None-Match": etag.current }, cache: "no-store" });
          if (res.status === 200) {
            const next = (await res.json()) as FollowupView;
            etag.current = res.headers.get("ETag") ?? etag.current;
            setView(next);
          } else if (res.status === 401) {
            window.location.href = "/tindak-lanjut/masuk";
            return;
          }
          delay = POLL_MS;
        } catch {
          delay = Math.min(delay * 2, 5 * 60_000); // gangguan jaringan: jarang-jarangkan
        }
        setToday(todayWib());
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        timer = window.setTimeout(tick, 1_500);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const items = useMemo(() => view.items.filter((i) => i.segment === segment), [view.items, segment]);
  const appreciation = useMemo(() => view.appreciation.filter((a) => a.segment === segment), [view.appreciation, segment]);

  const countBy = useMemo(() => {
    const c: Record<Segment, number> = { b2c: 0, b2b: 0 };
    for (const i of view.items) if (!isClosed(i.status)) c[i.segment]++;
    return c;
  }, [view.items]);

  const options = useMemo(
    () => ({
      stations: [...new Set(items.map((i) => i.station))].filter(Boolean).sort(),
    }),
    [items],
  );

  const matches = useCallback(
    (i: FollowupItem, skip?: "status") => {
      const f = filters;
      if (skip !== "status" && f.status.length && !f.status.includes(i.status)) return false;
      if (f.priority.length && !f.priority.includes(i.priority)) return false;
      if (f.klass.length && !f.klass.includes(i.klass)) return false;
      if (f.category.length && !f.category.includes(i.category)) return false;
      if (f.station.length && !f.station.includes(i.station)) return false;
      if (f.quick === "terlambat" && !isOverdue(i, today)) return false;
      if (f.quick === "belum" && (isClosed(i.status) || i.action.trim())) return false;
      if (f.quick === "dekat" && (isClosed(i.status) || !i.target || daysUntil(i.target, today) < 0 || daysUntil(i.target, today) > 3)) return false;
      const q = f.q.trim().toLowerCase();
      if (q && !`${i.id} ${i.station} ${i.summary} ${i.quote} ${i.pic} ${i.action} ${i.context} ${i.category}`.toLowerCase().includes(q)) return false;
      return true;
    },
    [filters, today],
  );

  const scoped = useMemo(() => items.filter((i) => matches(i, "status")), [items, matches]);
  const shown = useMemo(() => {
    const list = items.filter((i) => matches(i));
    return list.sort(sort === "urgensi" ? (a, b) => byUrgency(a, b, today) : byNewest);
  }, [items, matches, sort, today]);

  const statusCounts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    for (const i of scoped) c[i.status]++;
    return c;
  }, [scoped]);
  const quickCounts = useMemo(
    () => ({
      terlambat: items.filter((i) => isOverdue(i, today)).length,
      belum: items.filter((i) => !isClosed(i.status) && !i.action.trim()).length,
      dekat: items.filter((i) => !isClosed(i.status) && i.target && daysUntil(i.target, today) >= 0 && daysUntil(i.target, today) <= 3).length,
    }),
    [items, today],
  );

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((p) => ({ ...p, [k]: v }));
    setLimit(PAGE);
  };

  const applySaved = (saved: FollowupItem) => {
    setView((v) => ({ ...v, items: v.items.map((i) => (i.segment === saved.segment && i.id === saved.id ? { ...saved, history: "" } : i)) }));
    setSelection((s) => (s?.kind === "item" && s.item.id === saved.id && s.item.segment === saved.segment ? { kind: "item", item: saved } : s));
  };

  const refreshNow = async () => {
    const res = await fetch("/api/tindak-lanjut/state", { cache: "no-store" });
    if (res.ok) {
      setView((await res.json()) as FollowupView);
      etag.current = res.headers.get("ETag") ?? etag.current;
    }
  };

  const total = items.length;
  const open = items.filter((i) => !isClosed(i.status)).length;

  return (
    <div className="min-h-dvh">
      <header className="runway border-b border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-4 pt-5 pb-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Image src="/logo-joumpa-header.webp" alt="JOUMPA Airport VIP Service" width={879} height={226} priority className="h-9 w-auto shrink-0 sm:h-11" />
            <div className="h-10 w-px shrink-0 bg-line-strong" aria-hidden />
            <div className="min-w-0">
              <p className="eyebrow">Index CSS JOUMPA · {ROLE_LABEL[role]}</p>
              <h1 className="text-lg leading-tight font-extrabold tracking-tight text-ink sm:text-2xl">Tindak lanjut feedback</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="mr-1 text-right text-xs leading-snug text-muted" aria-live="polite">
              Data Realtime
              <br />
              <span className="font-medium text-ink-2">per {formatDateTime(new Date(view.generatedAt).toISOString())}</span>
              {view.syncError && (
                <>
                  <br />
                  <span className="font-semibold text-crit">Sinkron ke Sheet bermasalah</span>
                </>
              )}
            </p>
            {editable && (
              <button
                onClick={() =>
                  startSync(async () => {
                    const res = await syncNow();
                    setSyncMsg(res.error ? "Gagal menyinkronkan." : res.ran ? (res.added ? `${res.added} item baru ditambahkan.` : "Sudah paling baru.") : "Baru saja disinkronkan.");
                    await refreshNow();
                    window.setTimeout(() => setSyncMsg(""), 4000);
                  })
                }
                disabled={syncing}
                aria-label="Sinkronkan sekarang"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2 disabled:opacity-60"
              >
                <RefreshCw aria-hidden className={`size-4 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden lg:inline">{syncing ? "Menyinkronkan…" : "Sinkronkan"}</span>
              </button>
            )}
            <Link
              href="/"
              aria-label="Kembali ke CSS JOUMPA"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2"
            >
              <ArrowLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">Kembali ke CSS JOUMPA</span>
            </Link>
            <form action={logoutFollowup}>
              <button aria-label="Keluar" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-2">
                <LogOut aria-hidden className="size-4" />
                <span className="hidden lg:inline">Keluar</span>
              </button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
          <div role="tablist" aria-label="Segmen survei" className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            {(["b2c", "b2b"] as Segment[]).map((id) => {
              const active = id === segment;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSegment(id);
                    setFilters(EMPTY);
                    setLimit(PAGE);
                  }}
                  className={`relative flex min-h-16 items-center gap-3 rounded-t-xl border border-b-0 px-3 py-3 text-left transition-colors sm:min-w-64 sm:px-5 ${
                    active ? "border-line bg-page" : "border-transparent hover:bg-sunken"
                  }`}
                >
                  <span className={`grid h-9 min-w-12 place-items-center rounded-lg px-2 font-mono text-sm font-semibold ${active ? "bg-ink text-white" : "bg-sunken text-ink-2 ring-1 ring-line"}`}>
                    {SEGMENT_META[id].label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${active ? "text-ink" : "text-ink-2"}`}>{SEGMENT_META[id].audience}</span>
                    <span className="block text-xs text-muted">
                      <span className="num font-semibold text-ink-2">{countBy[id]}</span> belum selesai
                    </span>
                  </span>
                  {active && <span className="absolute inset-x-0 -top-px h-[3px] rounded-t-xl bg-brand" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pt-6 pb-16 sm:px-6 lg:px-8">
        {/* Status: batang proporsi + penyaring */}
        <section aria-label="Ringkasan status" className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{SEGMENT_META[segment].audience}</p>
              <p className="mt-0.5 text-sm text-muted">
                <span className="num text-2xl font-extrabold tracking-tight text-ink">{open}</span> dari <span className="num">{total}</span> item belum selesai
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Penyaring cepat">
              {(
                [
                  ["terlambat", "Terlambat", quickCounts.terlambat],
                  ["belum", "Belum ada tindakan", quickCounts.belum],
                  ["dekat", "Jatuh tempo 3 hari", quickCounts.dekat],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  aria-pressed={filters.quick === key}
                  onClick={() => setF("quick", filters.quick === key ? null : key)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    filters.quick === key ? "border-brand bg-brand-wash text-ink" : "border-line-strong bg-card text-ink-2 hover:border-ink-2"
                  }`}
                >
                  {label}
                  <span className={`num rounded-md px-1.5 text-xs ${key === "terlambat" && n > 0 ? "bg-crit-wash text-crit" : "bg-sunken text-ink-2"}`}>{n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-sunken ring-1 ring-line" aria-hidden>
            {STATUSES.map((s) => {
              const n = statusCounts[s];
              const sum = scoped.length || 1;
              return n ? <span key={s} className={`${STATUS_TONE[s].dot} grow-x`} style={{ width: `${(n / sum) * 100}%` }} /> : null;
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {STATUSES.map((s) => {
              const on = filters.status.includes(s);
              return (
                <button
                  key={s}
                  aria-pressed={on}
                  onClick={() => setF("status", on ? filters.status.filter((x) => x !== s) : [...filters.status, s])}
                  className={`flex min-h-14 flex-col-reverse items-start justify-end gap-1 rounded-lg border px-3 py-2 text-left transition-colors sm:flex-row sm:items-center sm:justify-start sm:gap-3 ${
                    on ? "border-brand bg-brand-wash" : "border-line bg-card hover:border-line-strong"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5 sm:flex-1">
                    <span className={`size-2.5 shrink-0 rounded-full ${STATUS_TONE[s].dot}`} aria-hidden />
                    <span className="min-w-0 text-sm font-semibold text-ink-2">{s}</span>
                  </span>
                  <span className="num text-xl font-extrabold tracking-tight text-ink">{statusCounts[s]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Aturan */}
        <details className="card mt-4 px-5 py-3 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-ink">
            Aturan klasifikasi dan prioritas otomatis
            <ChevronDown aria-hidden className="size-4 text-muted" />
          </summary>
          <div className="mt-3 grid gap-5 pb-2 text-sm text-ink-2 lg:grid-cols-2">
            <div>
              <p className="font-semibold text-ink">Perlu ditindaklanjuti bila salah satu terpenuhi</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>Index jawaban di bawah 4,50 (rata-rata semua butir dari satu responden)</li>
                <li>Menjawab pernah mengalami kendala, atau teks berisi keluhan</li>
                <li>Skor rekomendasi 6 atau kurang</li>
                <li>Ada kritik atau saran di kolom &quot;perlu diperbaiki&quot; atau saran tambahan</li>
              </ul>
              <p className="mt-2 text-muted">Selain itu dibaca apresiasi dan masuk tab Apresiasi. Bila salah baca, buka jawabannya lalu jadikan tindak lanjut.</p>
            </div>
            <div>
              <p className="font-semibold text-ink">Skala prioritas dan batas waktu</p>
              <dl className="mt-1.5 space-y-2">
                {(
                  [
                    ["Tinggi", `${TARGET_DAYS.Tinggi} hari`, "Kendala atau keluhan, skor rekomendasi 6 atau kurang, index di bawah 4,00, atau dua butir atau lebih bernilai 3 atau kurang."],
                    ["Sedang", `${TARGET_DAYS.Sedang} hari`, "Index 4,00 sampai 4,49 tanpa tanda di atas, satu butir bernilai 3 atau kurang, atau hanya kritik dan saran."],
                    ["Rendah", `${TARGET_DAYS.Rendah} hari`, "Tidak dipakai otomatis; Management bisa menurunkan prioritas secara manual."],
                  ] as const
                ).map(([p, d, text]) => (
                  <div key={p} className="flex gap-3">
                    <dt className="flex w-24 shrink-0 items-start gap-2 font-semibold text-ink">
                      <span className={`mt-1.5 size-2.5 rounded-full ${PRIORITY_TONE[p].mark}`} aria-hidden />
                      {p}
                    </dt>
                    <dd>
                      <span className="font-semibold text-ink">{d}.</span> {text}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </details>

        {/* Penyaring */}
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <Segmented
            label="Tampilan"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setLimit(PAGE);
            }}
            options={[
              { value: "perlu", label: `Perlu ditindaklanjuti (${total})` },
              { value: "apresiasi", label: `Apresiasi (${appreciation.length})` },
            ]}
          />
          {mode === "perlu" && (
            <>
              <div className="relative min-w-52 flex-1 basis-56 sm:max-w-80">
                <span className="eyebrow block">Cari</span>
                <Search aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-4 text-muted" />
                <input
                  type="search"
                  value={filters.q}
                  onChange={(e) => setF("q", e.target.value)}
                  placeholder="ID, bandara, PIC, isi feedback"
                  aria-label="Cari item tindak lanjut"
                  className="mt-1 min-h-10 w-full rounded-lg border border-line-strong bg-card pr-3 pl-9 text-sm"
                />
              </div>
              <MultiSelect label="Prioritas" values={filters.priority} onChange={(v) => setF("priority", v)} allLabel="Semua prioritas" options={PRIORITIES.map((p) => ({ value: p, label: p }))} className="flex-1 basis-36 sm:max-w-44" />
              <MultiSelect label="Klasifikasi" values={filters.klass} onChange={(v) => setF("klass", v)} allLabel="Semua klasifikasi" options={CLASSES.map((p) => ({ value: p, label: p }))} className="flex-1 basis-40 sm:max-w-56" />
              <MultiSelect label="Kategori" values={filters.category} onChange={(v) => setF("category", v)} allLabel="Semua kategori" options={categoriesFor(segment).map((p) => ({ value: p, label: p }))} className="flex-1 basis-40 sm:max-w-60" />
              <MultiSelect label="Bandara" values={filters.station} onChange={(v) => setF("station", v)} allLabel="Semua bandara" options={options.stations.map((s) => ({ value: s, label: s }))} className="flex-1 basis-36 sm:max-w-44" />
              <div className="flex min-h-10 items-center gap-3 sm:ml-auto">
                <label className="flex items-center gap-2 text-sm text-muted">
                  Urutkan
                  <select value={sort} onChange={(e) => setSort(e.target.value as "urgensi" | "terbaru")} className="select !min-h-10 !w-auto !py-1.5">
                    <option value="urgensi">Paling mendesak</option>
                    <option value="terbaru">Terbaru</option>
                  </select>
                </label>
                {hasFilters(filters) && (
                  <button onClick={() => { setFilters(EMPTY); setLimit(PAGE); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand hover:bg-brand-wash">
                    <RotateCcw aria-hidden className="size-3.5" /> Hapus filter
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {view.pending > 0 && (
          <p className="mt-4 rounded-lg bg-warn-wash px-4 py-2.5 text-sm text-warn" role="status">
            {view.pending} jawaban baru sedang diproses ke tracker dan akan muncul dalam beberapa saat.
          </p>
        )}

        {mode === "perlu" ? (
          <section aria-label="Daftar tindak lanjut" className="mt-4">
            <p className="mb-2 text-sm text-muted" aria-live="polite">
              <span className="num font-bold text-ink">{shown.length}</span> dari <span className="num">{total}</span> item
            </p>
            {shown.length === 0 ? (
              <div className="card px-6 py-12 text-center">
                <p className="text-base font-bold text-ink">{total === 0 ? "Belum ada item tindak lanjut" : "Tidak ada item yang cocok"}</p>
                <p className="mt-1 text-sm text-muted">
                  {total === 0 ? "Item muncul otomatis setelah ada jawaban survei yang perlu ditindaklanjuti." : "Ubah atau hapus filter untuk melihat item lain."}
                </p>
              </div>
            ) : (
              <ul className="card divide-y divide-line overflow-hidden">
                <li className="hidden grid-cols-[1rem_6.5rem_4rem_minmax(0,1fr)_10.5rem_7rem_8.5rem] gap-x-4 bg-sunken px-4 py-2 text-xs font-semibold text-muted lg:grid" aria-hidden>
                  <span />
                  <span>ID</span>
                  <span>Bandara</span>
                  <span>Ringkasan feedback</span>
                  <span>Status</span>
                  <span>PIC</span>
                  <span>Target</span>
                </li>
                {shown.slice(0, limit).map((i) => {
                  const late = isOverdue(i, today);
                  const days = i.target ? daysUntil(i.target, today) : null;
                  return (
                    <li key={`${i.segment}-${i.id}`}>
                      <button
                        onClick={() => setSelection({ kind: "item", item: i })}
                        className="grid w-full grid-cols-[1rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3.5 text-left transition-colors hover:bg-sunken lg:grid-cols-[1rem_6.5rem_4rem_minmax(0,1fr)_10.5rem_7rem_8.5rem] lg:items-start lg:gap-x-4"
                      >
                        <span className="row-span-6 mt-1 flex flex-col items-center lg:row-span-1" title={`Prioritas ${i.priority}`}>
                          <span className={`h-5 w-1.5 rounded-full ${PRIORITY_TONE[i.priority]?.mark ?? "bg-line-strong"}`} aria-hidden />
                          <span className="sr-only">Prioritas {i.priority}</span>
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-ink">
                          {i.id}
                          <span className="block text-xs font-normal text-muted lg:mt-0.5">{formatDate(i.date)}</span>
                        </span>
                        <span className="hidden text-sm font-semibold text-ink lg:block">{i.station}</span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-sm leading-snug text-ink">{i.summary || i.quote || "Tanpa ringkasan"}</span>
                          <span className="mt-1 block text-xs text-muted">
                            <span className={`font-semibold ${PRIORITY_TONE[i.priority]?.text ?? ""}`}>{i.priority}</span> · {i.klass} · {i.category}
                            <span className="lg:hidden"> · {i.station}</span>
                          </span>
                        </span>
                        <span className={`flex items-center gap-2 text-sm font-semibold ${STATUS_TONE[i.status].text}`}>
                          <span className={`size-2 shrink-0 rounded-full ${STATUS_TONE[i.status].dot}`} aria-hidden />
                          {i.status}
                        </span>
                        <span className="truncate text-sm text-ink-2" title={i.pic}>
                          <span className="text-muted lg:hidden">PIC </span>
                          {i.pic || "-"}
                        </span>
                        <span className={`text-sm ${late ? "font-semibold text-crit" : "text-ink-2"}`}>
                          <span className="font-normal text-muted lg:hidden">Target </span>
                          {i.target ? formatDate(i.target) : "-"}
                          {!isClosed(i.status) && days !== null && (
                            <span className="block text-xs">{late ? `Terlambat ${-days} hari` : days <= 3 ? (days === 0 ? "Hari ini" : `${days} hari lagi`) : ""}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {shown.length > limit && (
              <div className="mt-4 text-center">
                <button onClick={() => setLimit((l) => l + PAGE)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-5 text-sm font-semibold text-ink hover:border-ink-2">
                  Tampilkan {Math.min(PAGE, shown.length - limit)} lagi
                </button>
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Daftar apresiasi" className="mt-4">
            <p className="mb-2 max-w-3xl text-sm text-muted">
              Jawaban dengan index 4,50 ke atas, tanpa keluhan dan tanpa kritik. Bila ada yang sebenarnya perlu ditindaklanjuti, klik jawabannya lalu jadikan tindak lanjut.
            </p>
            {appreciation.length === 0 ? (
              <div className="card px-6 py-12 text-center">
                <p className="text-base font-bold text-ink">Tidak ada apresiasi yang menunggu</p>
              </div>
            ) : (
              <ul className="card divide-y divide-line overflow-hidden">
                {appreciation.slice(0, limit).map((a) => (
                  <li key={`${a.segment}-${a.responseId}`}>
                    <button onClick={() => setSelection({ kind: "apresiasi", item: a })} className="grid w-full grid-cols-[5.5rem_3.5rem_minmax(0,1fr)_6rem] items-center gap-x-4 px-4 py-3 text-left hover:bg-sunken">
                      <span className="text-xs text-muted">{formatDate(a.date)}</span>
                      <span className="text-sm font-semibold text-ink">{a.station}</span>
                      <span className="truncate text-sm text-ink-2">{a.summary || "Tanpa komentar tertulis"}</span>
                      <span className="num text-right text-xs text-muted">
                        {formatIdx(a.index)} · {a.nps ?? "-"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {appreciation.length > limit && (
              <div className="mt-4 text-center">
                <button onClick={() => setLimit((l) => l + PAGE)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-5 text-sm font-semibold text-ink hover:border-ink-2">
                  Tampilkan {Math.min(PAGE, appreciation.length - limit)} lagi
                </button>
              </div>
            )}
          </section>
        )}

        {syncMsg && (
          <p role="status" className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
            {syncMsg}
          </p>
        )}
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          <span>PT Gapura Angkasa · Tindak lanjut feedback JOUMPA</span>
          <span>Tersimpan di Google Sheet Tracking Follow Up Index CSS JOUMPA</span>
        </div>
      </footer>

      {selection && (
        <FollowupDrawer
          key={selection.kind === "item" ? `${selection.item.segment}-${selection.item.id}` : `a-${selection.item.responseId}`}
          selection={selection}
          role={role}
          onClose={() => setSelection(null)}
          onSaved={applySaved}
          onPromoted={() => {
            setSelection(null);
            setMode("perlu");
            void refreshNow();
          }}
        />
      )}
    </div>
  );
}
