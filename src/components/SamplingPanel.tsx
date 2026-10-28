"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, TriangleAlert } from "lucide-react";
import type { Response } from "@/lib/scoring";
import type { BranchSampling, SamplingData } from "@/lib/sampling";
import { OUTSIDE_REASON_LABEL, classifyOutside, type OutsideGroup } from "@/lib/sampling-shared";
import { SEGMENT_META, type Segment } from "@/lib/survey-config";
import { CardHeader, stationLabel } from "./ui";

const pctOf = (done: number, target: number) => (target > 0 ? done / target : null);
const pctText = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);
const numText = (n: number | null) => (n === null ? "–" : String(n));

/** Panah capaian: hijau naik bila target tercapai (100% atau lebih), merah turun bila belum. */
function Arrow({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return pct >= 1 ? (
    <ArrowUp aria-label="Target tercapai" className="size-3.5 shrink-0 text-good" strokeWidth={3} />
  ) : (
    <ArrowDown aria-label="Belum mencapai target" className="size-3.5 shrink-0 text-crit" strokeWidth={3} />
  );
}

/** Terkumpul: nol ditampilkan merah supaya baris yang belum terisi langsung terlihat. */
function Collected({ value }: { value: number | null }) {
  if (value === null) return <>–</>;
  return <span className={value === 0 ? "font-bold text-crit" : ""}>{value}</span>;
}

function Bar({ pct }: { pct: number | null }) {
  const value = Math.min(1, pct ?? 0);
  return (
    <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
      <div
        className={`h-full rounded-full ${value >= 1 ? "bg-good-mark" : value >= 0.5 ? "bg-warn-mark" : "bg-crit-mark"}`}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}

const sumCount = (groups: OutsideGroup[]) => groups.reduce((a, g) => a + g.count, 0);

interface Block {
  branch: BranchSampling;
  target: number;
  collected: number;
  remaining: number;
  pct: number | null;
  summary: string;
}

function toBlock(branch: BranchSampling, segment: Segment): Block {
  const t = segment === "b2b" ? branch.b2b : branch.b2c;
  const summary =
    segment === "b2b"
      ? branch.b2b.customers.length
        ? `B2B: ${branch.b2b.customers.length} customer kontrak`
        : "B2B: tidak ada customer kontrak di cabang ini"
      : branch.b2c.channels.length
        ? `B2C: ${branch.b2c.target} tamu non-kontrak`
        : "B2C: tidak ada tamu non-kontrak, tidak ada target";
  const collected = t.target > 0 ? t.collected : 0;
  return { branch, target: t.target, collected, remaining: Math.max(0, t.target - collected), pct: pctOf(collected, t.target), summary };
}

/** Baris respons yang tidak masuk panduan sampling cabang ini: tetap ditampilkan, berwarna merah. */
function OutsideRows({ code, groups, colSpan }: { code: string; groups: OutsideGroup[]; colSpan: number }) {
  if (!groups.length) return null;
  return (
    <>
      <tr className="border-t-2 border-warn-mark bg-warn-wash">
        <td colSpan={colSpan} className="py-1.5 pr-3 pl-2 text-xs font-bold text-crit">
          Di luar panduan sampling cabang {code}: {sumCount(groups)} respons (tidak dihitung ke Terkumpul)
        </td>
      </tr>
      {groups.map((g) => (
        <tr key={`${g.label}|${g.reason}`} className="border-t border-line bg-warn-wash align-top text-crit">
          <td className="py-2 pr-3 pl-2 font-medium" colSpan={2}>
            {g.label}
          </td>
          <td className="py-2 pr-3" colSpan={colSpan - 5}>
            {OUTSIDE_REASON_LABEL[g.reason]}
          </td>
          <td className="num py-2 pr-3 text-right font-bold">{g.count}</td>
          <td className="py-2 pr-3" colSpan={2}>
            Di luar Panduan Target Sampling
          </td>
        </tr>
      ))}
    </>
  );
}

function OutsideOnlyBlock({ code, groups, defaultOpen, airports }: { code: string; groups: OutsideGroup[]; defaultOpen: boolean; airports: Record<string, string> }) {
  return (
    <details className="group border-t border-line first:border-t-0" open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 bg-warn-wash px-5 py-3 sm:px-6">
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        <span className="w-12 font-bold text-ink" title={stationLabel(code, airports)}>
          {code || "–"}
        </span>
        <span className="min-w-0 flex-1 basis-48 text-xs font-semibold text-crit">Cabang tidak ada di Panduan Target Sampling</span>
        <span className="num text-sm font-bold text-crit">{sumCount(groups)} respons di luar panduan</span>
      </summary>
      <div className="overflow-x-auto px-5 pb-4 sm:px-6">
        <table className="w-full min-w-[640px] text-left text-sm">
          <tbody>
            <OutsideRows code={code} groups={groups} colSpan={8} />
          </tbody>
        </table>
      </div>
    </details>
  );
}

function BlockTable({
  block,
  segment,
  productionLabel,
  defaultOpen,
  outside,
  airports,
}: {
  block: Block;
  segment: Segment;
  productionLabel: string;
  defaultOpen: boolean;
  outside: OutsideGroup[];
  airports: Record<string, string>;
}) {
  const { branch } = block;
  const empty = segment === "b2b" ? !branch.b2b.customers.length : !branch.b2c.channels.length;
  return (
    <details className="group border-t border-line first:border-t-0" open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-sunken sm:px-6">
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        <span className="w-12 font-bold text-ink" title={stationLabel(branch.code, airports)}>
          {branch.code}
        </span>
        <span className="min-w-0 flex-1 basis-48 text-xs text-muted">
          {block.summary}
          {outside.length > 0 && <b className="ml-2 rounded bg-warn-wash px-1.5 py-0.5 text-crit">+{sumCount(outside)} di luar panduan</b>}
        </span>
        <span className="num text-sm text-ink-2">
          <b className={block.collected === 0 && block.target > 0 ? "text-crit" : "text-ink"}>{block.collected}</b> / {block.target}
        </span>
        <span className="w-24">
          <Bar pct={block.pct} />
        </span>
        <span className="num flex w-14 items-center justify-end gap-1 text-sm font-bold text-ink">
          <Arrow pct={block.pct} />
          {pctText(block.pct)}
        </span>
      </summary>
      <div className="overflow-x-auto px-5 pb-4 sm:px-6">
        {empty ? (
          <p className="py-2 text-sm text-muted">{block.summary.replace(/^B2[BC]: /, "")}.</p>
        ) : segment === "b2b" ? (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Customer kontrak</th>
                <th className="py-2 pr-3 text-right font-semibold">{productionLabel}</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 text-right font-semibold">Target</th>
                <th className="py-2 pr-3 text-right font-semibold">Terkumpul</th>
                <th className="py-2 pr-3 text-right font-semibold">Sisa</th>
                <th className="py-2 pr-3 font-semibold">% capaian</th>
                <th className="py-2 pr-3 font-semibold">Nama PIC responden</th>
                <th className="py-2 font-semibold">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {branch.b2b.customers.map((c) => {
                const pct = pctOf(c.collected, c.target);
                return (
                  <tr key={c.no} className="border-t border-line align-top">
                    <td className="py-2 pr-3 font-medium text-ink">{c.name}</td>
                    <td className="num py-2 pr-3 text-right">{c.production}</td>
                    <td className="py-2 pr-3 text-ink-2">{c.status}</td>
                    <td className="num py-2 pr-3 text-right">{numText(c.target)}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">
                      <Collected value={c.collected} />
                    </td>
                    <td className="num py-2 pr-3 text-right">{Math.max(0, c.target - c.collected)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-20">
                          <Bar pct={pct} />
                        </span>
                        <Arrow pct={pct} />
                        <span className="num text-xs">{pctText(pct)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">{c.pic}</td>
                    <td className="py-2 text-ink-2">{c.note}</td>
                  </tr>
                );
              })}
              <OutsideRows code={branch.code} groups={outside} colSpan={9} />
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-bold">
                <td className="py-2 pr-3" colSpan={3}>
                  Total B2B cabang {branch.code}
                </td>
                <td className="num py-2 pr-3 text-right">{block.target}</td>
                <td className="num py-2 pr-3 text-right">
                  <Collected value={block.target > 0 ? block.collected : null} />
                </td>
                <td className="num py-2 pr-3 text-right">{block.remaining}</td>
                <td className="num py-2 pr-3">
                  <span className="flex items-center gap-1">
                    <Arrow pct={block.pct} />
                    {pctText(block.pct)}
                  </span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Kanal non-kontrak</th>
                <th className="py-2 pr-3 text-right font-semibold">{productionLabel}</th>
                <th className="py-2 pr-3 font-semibold">Jenis</th>
                <th className="py-2 pr-3 text-right font-semibold">Target</th>
                <th className="py-2 pr-3 text-right font-semibold">Terkumpul</th>
                <th className="py-2 pr-3 text-right font-semibold">Sisa</th>
                <th className="py-2 pr-3 font-semibold">% capaian</th>
                <th className="py-2 font-semibold" colSpan={2}>
                  Sumber responden
                </th>
              </tr>
            </thead>
            <tbody>
              {branch.b2c.channels.map((c) => {
                const pct = c.target !== null && c.collected !== null ? pctOf(c.collected, c.target) : null;
                return (
                  <tr key={c.no} className="border-t border-line align-top">
                    <td className="py-2 pr-3 font-medium text-ink">{c.name}</td>
                    <td className="num py-2 pr-3 text-right">{c.production}</td>
                    <td className="py-2 pr-3 text-ink-2">{c.kind}</td>
                    <td className="num py-2 pr-3 text-right">{numText(c.target)}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">
                      <Collected value={c.target === null ? null : (c.collected ?? 0)} />
                    </td>
                    <td className="num py-2 pr-3 text-right">{c.target === null ? "–" : Math.max(0, c.target - (c.collected ?? 0))}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-20">
                          <Bar pct={pct} />
                        </span>
                        <Arrow pct={pct} />
                        <span className="num text-xs">{pctText(pct)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-xs text-ink-2" colSpan={2}>
                      {c.source}
                    </td>
                  </tr>
                );
              })}
              <OutsideRows code={branch.code} groups={outside} colSpan={9} />
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-bold">
                <td className="py-2 pr-3" colSpan={3}>
                  Total B2C cabang {branch.code}
                </td>
                <td className="num py-2 pr-3 text-right">{block.target}</td>
                <td className="num py-2 pr-3 text-right">
                  <Collected value={block.target > 0 ? block.collected : null} />
                </td>
                <td className="num py-2 pr-3 text-right">{block.remaining}</td>
                <td className="num py-2 pr-3">
                  <span className="flex items-center gap-1">
                    <Arrow pct={block.pct} />
                    {pctText(block.pct)}
                  </span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </details>
  );
}

/**
 * Target sampling per cabang dari sheet "Target Sampling" (isi sama dengan PDF Panduan Target Responden).
 * Tampilannya sama dengan panel target sampling di AIRLINE CSS Survey Dashboard.
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
  stations: string[]; // kode bandara terpilih; kosong = semua cabang
  airports: Record<string, string>;
  responses: Response[]; // semua respons segmen ini yang dikirim ke halaman
}) {
  const meta = SEGMENT_META[segment];
  const filtered = stations.length > 0;
  const codes = useMemo(() => new Set(stations), [stations]);

  const allBlocks = useMemo(
    () => Object.values(sampling.branches).sort((a, b) => a.code.localeCompare(b.code)).map((b) => toBlock(b, segment)),
    [sampling.branches, segment],
  );
  const blocks = useMemo(() => (filtered ? allBlocks.filter((b) => codes.has(b.branch.code)) : allBlocks), [allBlocks, codes, filtered]);

  const allOutside = useMemo(() => classifyOutside(sampling.branches, responses, segment), [sampling.branches, responses, segment]);
  const outside = useMemo(() => (filtered ? allOutside.filter((g) => codes.has(g.code)) : allOutside), [allOutside, codes, filtered]);
  const outsideTotal = sumCount(outside);
  const [showOutside, setShowOutside] = useState(false);

  const outsideByCode = useMemo(() => {
    const map = new Map<string, OutsideGroup[]>();
    for (const g of allOutside) map.set(g.code, [...(map.get(g.code) ?? []), g]);
    return map;
  }, [allOutside]);

  // Bandara yang punya respons tetapi tidak punya blok di panduan tetap ditampilkan sebagai blok merah.
  const orphanCodes = useMemo(() => {
    const known = new Set(allBlocks.map((b) => b.branch.code));
    return [...outsideByCode.keys()].filter((c) => !known.has(c) && (!filtered || codes.has(c))).sort();
  }, [outsideByCode, allBlocks, filtered, codes]);

  const sum = useMemo(() => {
    const target = blocks.reduce((a, b) => a + b.target, 0);
    const collected = blocks.reduce((a, b) => a + b.collected, 0);
    return { target, collected, remaining: Math.max(0, target - collected), pct: pctOf(collected, target) };
  }, [blocks]);

  const open = blocks.length + orphanCodes.length <= 3;
  const noun = segment === "b2b" ? "mitra bisnis" : "penumpang";
  const totalResponses = responses.length;

  if (sampling.error) {
    return (
      <section className="card px-5 py-4 text-sm text-ink-2" aria-label="Target sampling">
        <p className="font-bold text-ink">Target sampling</p>
        <p className="mt-1">{sampling.error} Bagian lain dashboard tetap berjalan.</p>
      </section>
    );
  }

  return (
    <section aria-label={`Target sampling ${meta.label}`} className="card overflow-hidden">
      <CardHeader
        eyebrow={`Target sampling · ${meta.label}`}
        title={`Target responden ${noun} per cabang`}
        description={`Sumber: sheet Target Sampling (dihitung dari seluruh respons, tidak terpengaruh filter periode, jenis layanan, dan KPI). ${
          filtered ? "Menampilkan bandara yang dipilih." : "Pilih Bandara di atas untuk melihat satu atau beberapa cabang."
        }`}
      />
      <div className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 sm:grid-cols-4 sm:px-6">
        {[
          ["Target", String(sum.target), ""],
          ["Terkumpul", String(sum.collected), sum.collected === 0 && sum.target > 0 ? "text-crit" : "text-ink"],
          ["Sisa", String(sum.remaining), "text-ink"],
          ["% capaian", pctText(sum.pct), "text-ink"],
        ].map(([label, value, tone]) => (
          <div key={label}>
            <p className="eyebrow">{label}</p>
            <p className={`num flex items-center gap-1.5 text-2xl font-extrabold ${tone || "text-ink"}`}>
              {label === "% capaian" && <Arrow pct={sum.pct} />}
              {value}
            </p>
          </div>
        ))}
      </div>

      {blocks.length === 0 && orphanCodes.length === 0 && (
        <p className="px-5 py-6 text-sm text-muted sm:px-6">Bandara yang dipilih tidak punya blok di Panduan Target Sampling.</p>
      )}
      {blocks.map((b) => (
        <BlockTable
          key={`${b.branch.code}-${open}`}
          block={b}
          segment={segment}
          productionLabel={sampling.productionLabel}
          defaultOpen={open}
          outside={outsideByCode.get(b.branch.code) ?? []}
          airports={airports}
        />
      ))}
      {orphanCodes.map((c) => (
        <OutsideOnlyBlock key={`${c}-${open}`} code={c} groups={outsideByCode.get(c) ?? []} defaultOpen={open} airports={airports} />
      ))}

      {outsideTotal > 0 && (
        <div className="border-t border-warn-mark bg-warn-wash px-5 py-4 sm:px-6" role="note">
          <p className="flex items-start gap-2 text-sm font-bold text-warn">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
            <span>
              Di luar Panduan Target Sampling: {outsideTotal} respons{filtered ? "" : ` dari ${totalResponses}`}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Respons ini tetap masuk perhitungan index dan seluruh dashboard, tetapi tidak dihitung ke kolom Terkumpul di atas.
          </p>
          <button
            type="button"
            onClick={() => setShowOutside((v) => !v)}
            aria-expanded={showOutside}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-warn-mark bg-card px-3 text-xs font-semibold text-crit hover:bg-sunken"
          >
            <ChevronDown aria-hidden className={`size-3.5 transition-transform ${showOutside ? "rotate-180" : ""}`} />
            {showOutside ? "Sembunyikan data" : "Tampilkan data"}
          </button>
          {showOutside && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-semibold">Bandara</th>
                    <th className="py-1.5 pr-3 font-semibold">{segment === "b2b" ? "Isian instansi" : "Responden"}</th>
                    <th className="py-1.5 pr-3 font-semibold">Alasan</th>
                    <th className="py-1.5 text-right font-semibold">Respons</th>
                  </tr>
                </thead>
                <tbody>
                  {outside.map((g) => (
                    <tr key={`${g.code}|${g.label}|${g.reason}`} className="border-t border-line">
                      <td className="py-1.5 pr-3 font-semibold">{g.code || "–"}</td>
                      <td className="py-1.5 pr-3">{g.label}</td>
                      <td className="py-1.5 pr-3 text-ink-2">{OUTSIDE_REASON_LABEL[g.reason]}</td>
                      <td className="num py-1.5 text-right font-semibold">{g.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
