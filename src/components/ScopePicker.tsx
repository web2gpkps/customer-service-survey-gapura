"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  CONTENT_OPTIONS,
  KPI_OPTIONS,
  applyFilters,
  institutionOptions,
  type ContentKey,
  type Filters,
  type KpiValue,
  type ReportScope,
} from "@/lib/filters";
import type { DashboardData } from "@/lib/sheets";
import { SEGMENT_IDS, SEGMENT_META, type Segment } from "@/lib/survey-config";
import { MultiSelect } from "./MultiSelect";
import { Segmented, formatMonth, stationLabel } from "./ui";

/** Pilihan segmen, filter per segmen, dan konten laporan. */
export function ScopePicker({
  data,
  value,
  onChange,
  contentNote,
}: {
  data: DashboardData;
  value: ReportScope;
  onChange: (next: ReportScope) => void;
  contentNote?: string;
}) {
  const scopeKey = value.segments.length === 2 ? "all" : value.segments[0];

  const setFilter = <K extends keyof Filters>(seg: Segment, key: K, v: Filters[K]) =>
    onChange({ ...value, filters: { ...value.filters, [seg]: { ...value.filters[seg], [key]: v } } });

  const toggleContent = (key: ContentKey) => {
    const on = value.content.includes(key);
    if (on && value.content.length === 1) return;
    onChange({
      ...value,
      content: CONTENT_OPTIONS.map((c) => c.key).filter((k) => (k === key ? !on : value.content.includes(k))),
    });
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="eyebrow">Segmen</span>
        <Segmented
          label="Segmen"
          value={scopeKey}
          onChange={(v) => onChange({ ...value, segments: v === "all" ? [...SEGMENT_IDS] : [v as Segment] })}
          options={[
            { value: "b2c", label: "B2C saja" },
            { value: "b2b", label: "B2B saja" },
            { value: "all", label: "B2C dan B2B" },
          ]}
        />
      </div>

      {value.segments.map((seg) => (
        <SegmentFilters
          key={seg}
          seg={seg}
          data={data}
          filters={value.filters[seg]}
          onChange={(k, v) => setFilter(seg, k, v)}
        />
      ))}

      <fieldset className="grid gap-2">
        <legend className="eyebrow mb-2">Konten</legend>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {CONTENT_OPTIONS.map((c) => {
            const checked = value.content.includes(c.key);
            return (
              <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink">
                <input
                  name={`report-content-${c.key}`}
                  type="checkbox"
                  checked={checked}
                  disabled={checked && value.content.length === 1}
                  onChange={() => toggleContent(c.key)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                {c.label}
              </label>
            );
          })}
        </div>
        {contentNote && <p className="text-xs text-muted">{contentNote}</p>}
      </fieldset>
    </div>
  );
}

function SegmentFilters({
  seg,
  data,
  filters,
  onChange,
}: {
  seg: Segment;
  data: DashboardData;
  filters: Filters;
  onChange: <K extends keyof Filters>(key: K, v: Filters[K]) => void;
}) {
  const all = data.segments[seg].responses;
  const options = useMemo(
    () => ({
      months: [...new Set(all.map((r) => r.date.slice(0, 7)))].filter(Boolean).sort().reverse(),
      stations: [...new Set(all.map((r) => r.station))].filter(Boolean).sort(),
      services: [...new Set(all.flatMap((r) => r.services))].sort(),
      institutions: institutionOptions(all),
    }),
    [all],
  );
  const count = applyFilters(all, filters).length;

  return (
    <fieldset className="rounded-xl border border-line bg-sunken p-3.5">
      <legend className="sr-only">Filter {SEGMENT_META[seg].label}</legend>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink">
          {SEGMENT_META[seg].label} · {SEGMENT_META[seg].audience}
        </span>
        <span className={`num text-xs ${count ? "text-muted" : "font-semibold text-crit"}`}>{count} respons</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MultiSelect
          compact
          label="Periode"
          values={filters.month}
          onChange={(v) => onChange("month", v)}
          allLabel="Semua periode"
          options={options.months.map((m) => ({ value: m, label: formatMonth(m) }))}
        />
        <MultiSelect
          compact
          label="Bandara"
          values={filters.station}
          onChange={(v) => onChange("station", v)}
          allLabel="Semua bandara"
          options={options.stations.map((s) => ({ value: s, label: stationLabel(s, data.airports) }))}
        />
        <MultiSelect
          compact
          label="Jenis layanan"
          values={filters.service}
          onChange={(v) => onChange("service", v)}
          allLabel="Semua layanan"
          options={options.services.map((s) => ({ value: s, label: s }))}
        />
        {seg === "b2b" && options.institutions.length > 0 && (
          <MultiSelect
            compact
            label="Instansi"
            values={filters.institution}
            onChange={(v) => onChange("institution", v)}
            allLabel="Semua instansi"
            options={options.institutions}
          />
        )}
        <MultiSelect
          compact
          label="KPI"
          values={filters.kpi}
          onChange={(v) => onChange("kpi", v as KpiValue[])}
          allLabel="Semua status KPI"
          options={KPI_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
    </fieldset>
  );
}

/** Kerangka dialog modal berbasis <dialog>. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-auto max-h-[calc(100dvh-2rem)] ${wide ? "w-[min(980px,calc(100vw-2rem))]" : "w-[min(640px,calc(100vw-2rem))]"} overflow-hidden rounded-2xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:flex open:flex-col`}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="shrink-0 border-t border-line bg-sunken/60 px-5 py-4 sm:px-6">{footer}</div>}
    </dialog>
  );
}

/** State cakupan yang di-reset tiap kali dialog dibuka. */
export function useScopeState(open: boolean, initial: () => ReportScope) {
  const [scope, setScope] = useState<ReportScope>(initial);
  const init = useRef(initial);
  init.current = initial;
  useEffect(() => {
    if (open) setScope(init.current());
  }, [open]);
  return [scope, setScope] as const;
}
