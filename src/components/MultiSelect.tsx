"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export interface MultiOption {
  value: string;
  label: string;
}

const SEARCH_FROM = 7;

/** Filter pilihan ganda: tombol seperti select, dengan kotak pencarian dan checkbox per opsi. */
export function MultiSelect({
  label,
  values,
  onChange,
  options,
  allLabel,
  compact = false,
  className = "",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiOption[];
  allLabel: string;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const selected = useMemo(() => new Set(values), [values]);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options),
    [options, needle],
  );

  const summary =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? values[0])
        : `${values.length} dipilih`;

  const toggle = (value: string) =>
    onChange(selected.has(value) ? values.filter((v) => v !== value) : [...values, value]);
  const selectShown = () => onChange([...new Set([...values, ...shown.map((o) => o.value)])]);

  return (
    <div ref={root} className={`relative flex min-w-0 flex-col gap-1 ${className}`}>
      <span id={`${panelId}-label`} className={compact ? "text-[11px] font-medium text-muted" : "eyebrow"}>
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${panelId}-label`}
        onClick={() => setOpen((v) => !v)}
        className={`select truncate text-left ${compact ? "!min-h-11 !py-1.5 !text-[13px]" : ""} ${values.length ? "!border-brand" : ""}`}
        title={values.length > 1 ? values.join(", ") : undefined}
      >
        {summary}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`Filter ${label}`}
          className="absolute top-full left-0 z-40 mt-1 w-full sm:min-w-72 max-w-[min(92vw,26rem)] rounded-xl border border-line-strong bg-card shadow-lg"
        >
          {options.length >= SEARCH_FROM && (
            <div className="relative border-b border-line p-2">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Cari ${label.toLowerCase()}…`}
                aria-label={`Cari ${label}`}
                className="min-h-10 w-full rounded-lg border border-line-strong bg-card pr-3 pl-9 text-sm text-ink outline-offset-1 placeholder:text-muted"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs">
            <span className="num text-muted">{values.length ? `${values.length} dipilih` : allLabel}</span>
            <span className="flex gap-3 font-semibold text-brand">
              {shown.length > 0 && (
                <button type="button" onClick={selectShown} className="hover:underline">
                  {needle ? "Pilih hasil" : "Pilih semua"}
                </button>
              )}
              {values.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="hover:underline">
                  Hapus pilihan
                </button>
              )}
            </span>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1" role="group" aria-label={label}>
            {shown.map((o) => (
              <li key={o.value}>
                <label className="flex min-h-10 cursor-pointer items-start gap-2.5 px-3 py-2 text-sm text-ink hover:bg-sunken">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 leading-snug">{o.label}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-4 text-sm text-muted">Tidak ada hasil untuk &quot;{query}&quot;.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
