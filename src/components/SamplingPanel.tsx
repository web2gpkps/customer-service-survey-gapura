"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, CircleCheck } from "lucide-react";
import type { Response } from "@/lib/scoring";
import type { B2bCustomer, BranchSampling, SamplingData } from "@/lib/sampling";
import { SEGMENT_META, type Segment } from "@/lib/survey-config";
import { CardHeader, Segmented, stationLabel } from "./ui";

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const pct = (done: number, target: number) => (target > 0 ? Math.round((done / target) * 1000) / 10 : null);
const pctText = (done: number, target: number) => {
  const p = pct(done, target);
  return p === null ? "" : `${nf.format(p)}%`;
};
/** Sel angka dikosongkan kalau belum ada data, seperti kolom isian di PDF panduan. */
const blank0 = (n: number | null | undefined) => (n ? String(n) : "");

/** Terkumpul: kosong bila memang tidak ada target; nol merah bila ada target tapi belum ada respons. */
function Collected({ value, target }: { value: number | null | undefined; target: number | null | undefined }) {
  if (!value && target) return <span className="font-bold text-crit">0</span>;
  return <>{blank0(value)}</>;
}

/** Capaian: panah naik hijau bila target terpenuhi, panah turun merah bila belum. */
function Pct({ done, target }: { done: number; target: number | null | undefined }) {
  if (!target) return null;
  const met = done >= target;
  const Icon = met ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-semibold ${met ? "text-good" : "text-crit"}`}>
      <Icon aria-label={met ? "Target terpenuhi" : "Di bawah target"} className="size-3.5" strokeWidth={2.6} />
      {pctText(done, target) || "0%"}
    </span>
  );
}

const th = "px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase";
const td = "px-3 py-2.5 align-top text-sm text-ink-2";

function Bar({ done, target }: { done: number; target: number }) {
  const p = Math.min(pct(done, target) ?? 0, 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sunken ring-1 ring-line" aria-hidden>
      <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
    </div>
  );
}

function OutsideBadge({ children = "Di luar panduan" }: { children?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-warn-wash px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-warn">
      {children}
    </span>
  );
}

interface Row {
  code: string;
  branch: BranchSampling | null; // null = cabang tidak ada di sheet Target Sampling
  target: number;
  collected: number;
  outside: boolean; // ada respons tapi tidak ada target di panduan
}

type Sort = "code" | "low" | "high";

/**
 * Target sampling per cabang dari sheet "Target Sampling" (isi sama dengan PDF Panduan Target Responden).
 * Tiap cabang berupa baris yang bisa dibuka; data di luar panduan tetap ditampilkan dengan tanda.
 */
export function SamplingPanel({
  sampling,
  segment,
  stations,
  airports,
  responses,
}: {
  sampling: SamplingData;
  segment: Segment;
  stations: string[]; // kosong = semua cabang
  airports: Record<string, string>;
  responses: Response[]; // semua respons segmen ini yang dikirim ke halaman
}) {
  const meta = SEGMENT_META[segment];
  const [sort, setSort] = useState<Sort>("code");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [onlyPending, setOnlyPending] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const countByStation = new Map<string, number>();
    for (const r of responses) countByStation.set(r.station, (countByStation.get(r.station) ?? 0) + 1);

    const codes = new Set([...Object.keys(sampling.branches), ...countByStation.keys()]);
    const list: Row[] = [];
    for (const code of codes) {
      if (!/^[A-Z]{3}$/.test(code)) continue;
      if (stations.length && !stations.includes(code)) continue;
      const branch = sampling.branches[code] ?? null;
      const t = branch ? (segment === "b2b" ? branch.b2b : branch.b2c) : null;
      const collected = t ? t.collected : (countByStation.get(code) ?? 0);
      list.push({ code, branch, target: t?.target ?? 0, collected, outside: !t || (t.target === 0 && collected > 0) });
    }
    const ratio = (r: Row) => (r.target > 0 ? r.collected / r.target : 2);
    return list.sort((a, b) =>
      sort === "low" ? ratio(a) - ratio(b) || a.code.localeCompare(b.code)
      : sort === "high" ? ratio(b) - ratio(a) || a.code.localeCompare(b.code)
      : a.code.localeCompare(b.code),
    );
  }, [sampling, responses, stations, segment, sort]);

  const totals = useMemo(() => {
    let target = 0;
    let done = 0;
    let left = 0;
    let outside = 0;
    for (const r of rows) {
      if (r.target > 0) {
        target += r.target;
        done += r.collected;
        left += Math.max(r.target - r.collected, 0);
      } else outside += r.collected;
    }
    return { target, done, left, outside };
  }, [rows]);

  // Satu cabang saja (akses cabang atau filter satu bandara): langsung terbuka.
  const alwaysOpen = rows.length === 1;
  const isOpen = (code: string) => alwaysOpen || open.has(code);
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.code));
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const unit = segment === "b2b" ? "customer kontrak" : "tamu non-kontrak";

  return (
    <section aria-label={`Target sampling ${meta.label}`} className="card rise overflow-hidden">
      <CardHeader
        eyebrow={`Target sampling · ${meta.label}`}
        title="Target responden per cabang"
        description={
          segment === "b2b"
            ? "Setiap customer kontrak memberikan 1 penilaian lewat PIC atau perwakilannya. Klik cabang untuk melihat rinciannya."
            : "Kumpulkan responden tamu non-kontrak (go show, perorangan, kanal online) sesuai target. Klik cabang untuk melihat rinciannya."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!alwaysOpen && rows.length > 0 && (
              <button
                onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.code)))}
                className="min-h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink hover:border-ink-2"
              >
                {allOpen ? "Tutup semua" : "Buka semua"}
              </button>
            )}
            {!alwaysOpen && (
              <Segmented
                label="Urutkan cabang"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "code", label: "Kode cabang" },
                  { value: "low", label: "Capaian terendah" },
                  { value: "high", label: "Capaian tertinggi" },
                ]}
              />
            )}
          </div>
        }
      />

      <div className="grid gap-4 border-b border-line bg-sunken/60 px-5 py-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] sm:items-end sm:px-6">
        <Stat label="Target" value={nf.format(totals.target)} note={unit} />
        <Stat label="Terkumpul" value={nf.format(totals.done)} note="dari cabang yang punya target" />
        <Stat label="Sisa" value={nf.format(totals.left)} note="belum terpenuhi" />
        <div>
          <p className="eyebrow">Capaian</p>
          <p className="num mt-1 text-3xl leading-none font-extrabold tracking-tight text-ink">
            {pctText(totals.done, totals.target) || "0%"}
          </p>
          <div className="mt-2.5">
            <Bar done={totals.done} target={totals.target} />
          </div>
        </div>
        {totals.outside > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2 sm:col-span-4">
            <OutsideBadge />
            <span>
              <span className="num font-semibold">{totals.outside}</span> respons dari cabang tanpa target di Panduan Target Sampling, tidak ikut dihitung
              ke capaian.
            </span>
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted sm:px-6">Belum ada data cabang untuk ditampilkan.</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const expanded = isOpen(r.code);
            return (
              <li key={r.code} className="border-t border-line first:border-t-0">
                <button
                  onClick={() => !alwaysOpen && toggle(r.code)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Tutup" : "Buka"} rincian ${stationLabel(r.code, airports)}`}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left sm:px-6 md:grid-cols-[auto_minmax(0,1.2fr)_5rem_5rem_minmax(0,1.4fr)_3.5rem] ${
                    alwaysOpen ? "cursor-default" : "hover:bg-sunken/70"
                  }`}
                >
                  <ChevronDown aria-hidden className={`size-4 text-muted transition-transform ${expanded ? "" : "-rotate-90"} ${alwaysOpen ? "invisible" : ""}`} />
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="grid h-6 min-w-10 place-items-center rounded-md bg-sunken px-1.5 font-mono text-xs font-semibold text-ink-2 ring-1 ring-line">
                      {r.code}
                    </span>
                    <span className="font-semibold text-ink">{airports[r.code]?.split(",")[0] ?? r.code}</span>
                    {r.outside && <OutsideBadge />}
                  </span>
                  <span className="num text-right text-sm text-ink-2">
                    <span className="block text-[10px] text-muted uppercase md:hidden">Target</span>
                    {r.target > 0 ? r.target : ""}
                  </span>
                  <span className="num text-right text-sm font-semibold text-ink">
                    <span className="block text-[10px] font-normal text-muted uppercase md:hidden">Terkumpul</span>
                    <Collected value={r.collected} target={r.target} />
                  </span>
                  <span className="col-span-4 col-start-1 md:col-span-1 md:col-start-auto">
                    {r.target > 0 && <Bar done={r.collected} target={r.target} />}
                  </span>
                  <span className="num hidden text-right text-xs md:block">
                    <Pct done={r.collected} target={r.target} />
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-line bg-sunken/40 px-5 py-4 sm:px-6">
                    <BranchDetail
                      row={r}
                      segment={segment}
                      productionLabel={sampling.productionLabel}
                      responses={responses}
                      onlyPending={onlyPending}
                      setOnlyPending={setOnlyPending}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-3xl leading-none font-extrabold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern.replace(/^\(\?i\)/, ""), "i");
  } catch {
    return null;
  }
}

/** Instansi B2B di Tally yang tidak cocok dengan satu pun customer kontrak di panduan. */
function outsideInstitutions(customers: B2bCustomer[], responses: Response[], code: string) {
  const patterns = customers.flatMap((c) => compile(c.pattern) ?? []);
  const counts = new Map<string, number>();
  for (const r of responses) {
    if (r.station !== code) continue;
    const name = r.institution.trim();
    if (name && patterns.some((p) => p.test(name))) continue;
    const label = name || "(tanpa nama instansi)";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function BranchDetail({
  row,
  segment,
  productionLabel,
  responses,
  onlyPending,
  setOnlyPending,
}: {
  row: Row;
  segment: Segment;
  productionLabel: string;
  responses: Response[];
  onlyPending: boolean;
  setOnlyPending: (v: boolean) => void;
}) {
  const { branch } = row;
  const label = segment === "b2b" ? "A. B2B · Customer kontrak (1 penilaian per customer)" : "B. B2C · Tamu non-kontrak (go show, perorangan, kanal online)";

  if (!branch) {
    return (
      <div className="grid gap-2">
        <p className="eyebrow">{label}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <OutsideBadge />
          Cabang {row.code} tidak ada di Panduan Target Sampling, tapi punya <span className="num font-semibold">{row.collected}</span> respons
          {segment === "b2b" ? " B2B" : " B2C"}.
        </p>
        {segment === "b2b" && (
          <OutsideTable items={outsideInstitutions([], responses, row.code)} />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="eyebrow">{label}</p>
      {segment === "b2b" ? (
        <B2bTable branch={branch} productionLabel={productionLabel} responses={responses} onlyPending={onlyPending} setOnlyPending={setOnlyPending} />
      ) : (
        <B2cTable branch={branch} productionLabel={productionLabel} collected={row.collected} />
      )}
    </div>
  );
}

function OutsideTable({ items }: { items: [string, number][] }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-card">
      {items.map(([name, n]) => (
        <li key={name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <span className="font-semibold text-ink">{name}</span>
          <OutsideBadge />
          <span className="num ml-auto text-ink-2">{n} respons</span>
        </li>
      ))}
    </ul>
  );
}

function B2bTable({
  branch,
  productionLabel,
  responses,
  onlyPending,
  setOnlyPending,
}: {
  branch: BranchSampling;
  productionLabel: string;
  responses: Response[];
  onlyPending: boolean;
  setOnlyPending: (v: boolean) => void;
}) {
  const { customers, target, collected } = branch.b2b;
  const extra = useMemo(() => outsideInstitutions(customers, responses, branch.code), [customers, responses, branch.code]);
  const pending = customers.filter((c) => c.collected < c.target).length;
  const rows = onlyPending ? customers.filter((c) => c.collected < c.target) : customers;

  return (
    <>
      <p className="text-sm text-ink-2">
        {customers.length ? `${customers.length} customer kontrak` : "Tidak ada customer kontrak di cabang ini."}
      </p>
      {customers.length > 0 && (
        <>
          <label className="flex min-h-9 w-fit cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            Hanya yang belum terkumpul
            <span className="num text-xs text-muted">({pending})</span>
          </label>
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-line bg-card">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr>
                  <th className={th}>No</th>
                  <th className={th}>Customer kontrak</th>
                  <th className={`${th} text-right`}>{productionLabel}</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Target B2B</th>
                  <th className={`${th} text-right`}>Terkumpul</th>
                  <th className={th}>Nama PIC responden</th>
                  <th className={th}>Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const done = c.collected >= c.target;
                  return (
                    <tr key={c.no}>
                      <td className={`${td} num text-muted`}>{c.no}</td>
                      <td className={`${td} font-semibold text-ink`}>{c.name}</td>
                      <td className={`${td} num text-right`}>{c.production}</td>
                      <td className={td}>{c.status}</td>
                      <td className={`${td} num text-right`}>{c.target}</td>
                      <td className={`${td} num text-right`}>
                        <span className={`inline-flex items-center justify-end gap-1.5 ${done ? "font-bold text-good" : ""}`}>
                          {done && <CircleCheck aria-label="Tercapai" className="size-4" strokeWidth={2.4} />}
                          <Collected value={c.collected} target={c.target} />
                        </span>
                      </td>
                      <td className={td}>{c.pic}</td>
                      <td className={td}>{c.note}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      Semua customer sudah memberikan penilaian.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong bg-sunken font-bold text-ink">
                  <td className={td} colSpan={4}>
                    Total B2B
                  </td>
                  <td className={`${td} num text-right`}>{target}</td>
                  <td className={`${td} num text-right`}>
                    <Collected value={collected} target={target} />
                  </td>
                  <td className={td} colSpan={2}>
                    <Pct done={collected} target={target} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {extra.length > 0 && (
        <Fragment>
          <p className="mt-1 text-sm font-semibold text-ink">
            Respons dari instansi di luar daftar kontrak <OutsideBadge />
          </p>
          <OutsideTable items={extra} />
        </Fragment>
      )}
    </>
  );
}

function B2cTable({ branch, productionLabel, collected }: { branch: BranchSampling; productionLabel: string; collected: number }) {
  const { channels, target, unclassified } = branch.b2c;
  return (
    <>
      <p className="text-sm text-ink-2">
        {channels.length ? `${target} tamu non-kontrak` : "Tidak ada tamu non-kontrak tercatat; tidak ada target B2C."}
      </p>
      {channels.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="bg-sunken">
              <tr>
                <th className={th}>No</th>
                <th className={th}>Kanal non-kontrak</th>
                <th className={`${th} text-right`}>{productionLabel}</th>
                <th className={th}>Jenis</th>
                <th className={`${th} text-right`}>Target B2C</th>
                <th className={`${th} text-right`}>Terkumpul</th>
                <th className={`${th} text-right`}>% capaian</th>
                <th className={th}>Sumber responden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {channels.map((c) => (
                <tr key={c.no}>
                  <td className={`${td} num text-muted`}>{c.no}</td>
                  <td className={`${td} font-semibold text-ink`}>{c.name}</td>
                  <td className={`${td} num text-right`}>{c.production}</td>
                  <td className={td}>{c.kind}</td>
                  <td className={`${td} num text-right`}>{c.target ?? ""}</td>
                  <td className={`${td} num text-right`}>
                    <Collected value={c.collected} target={c.target} />
                  </td>
                  <td className={`${td} num text-right`}>
                    <Pct done={c.collected ?? 0} target={c.target} />
                  </td>
                  <td className={`${td} text-xs`}>{c.source}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong bg-sunken font-bold text-ink">
                <td className={td} colSpan={4}>
                  Total B2C
                </td>
                <td className={`${td} num text-right`}>{target}</td>
                <td className={`${td} num text-right`}>
                  <Collected value={collected} target={target} />
                </td>
                <td className={`${td} num text-right`}>
                  <Pct done={collected} target={target} />
                </td>
                <td className={td} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {target === 0 && collected > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <OutsideBadge />
          <span>
            <span className="num font-semibold">{collected}</span> respons B2C masuk dari cabang ini, padahal panduan tidak menetapkan target B2C.
          </span>
        </p>
      )}
      {unclassified > 0 && (
        <p className="text-xs text-muted">Ada {unclassified} respons yang belum bisa dipetakan ke kanal.</p>
      )}
    </>
  );
}
