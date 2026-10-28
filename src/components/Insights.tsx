"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Quote } from "lucide-react";
import {
  CATEGORIES,
  KPI_TARGET,
  categorize,
  formatIndex,
  formatSigned,
  type Response,
  type SurveyResult,
} from "@/lib/scoring";
import { lowestStatements, pickComments, type CommentKey } from "@/lib/report";
import type { SegmentMeta } from "@/lib/survey-config";
import { Distribution } from "./StatementDetail";
import { CardHeader, Segmented, StatusBadge, formatDate, toneMark, toneText } from "./ui";

/* ── Prioritas perbaikan ───────────────────────────────────────── */

export function Priority({ result }: { result: SurveyResult }) {
  return (
    <section className="card h-full">
      <CardHeader
        eyebrow="Prioritas perbaikan"
        title="Lima pernyataan dengan skor terendah"
        description="Hanya pernyataan yang belum mencapai 4,50. Yang paling rendah ada di atas."
      />
      <PriorityList result={result} />
    </section>
  );
}

export function PriorityList({ result, limit = 5 }: { result: SurveyResult; limit?: number }) {
  const lowest = lowestStatements(result, limit);
  const sectionTitle = Object.fromEntries(result.sections.map((s) => [s.code, s.short]));

  if (lowest.length === 0) {
    return (
      <div className="flex items-center gap-3 px-6 py-10 text-good">
        <CircleCheck aria-hidden className="size-6" />
        <p className="font-semibold">Semua pernyataan sudah mencapai standar KPI 4,50.</p>
      </div>
    );
  }
  return (
    <ol>
      {lowest.map((st, i) => {
        const c = categorize(st.index)!;
        return (
          <li key={st.no} className="flex gap-4 border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6">
            <span className="num w-5 shrink-0 pt-0.5 font-mono text-sm font-semibold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-medium text-ink">{st.text}</p>
              <p className="mt-1 text-xs text-muted">
                <span className="font-mono font-semibold text-ink-2">{st.sectionCode}</span> · {sectionTitle[st.sectionCode]}{" "}
                · butir {st.no} · n={st.n}
              </p>
              <div className="mt-2 max-w-sm">
                <Distribution counts={st.counts} n={st.n} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-xl leading-none font-extrabold text-ink">{formatIndex(st.index)}</p>
              <p className={`num mt-1 text-xs font-semibold ${toneText(c.tone)}`}>{formatSigned(st.index! - KPI_TARGET)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Profil responden ──────────────────────────────────────────── */

function countBy(values: string[]) {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

type ProfileKey = "station" | "service" | "channel" | "institution";

export function Profile({
  meta,
  responses,
  airports,
}: {
  meta: SegmentMeta;
  responses: Response[];
  airports: Record<string, string>;
}) {
  const [key, setKey] = useState<ProfileKey>("station");
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    if (key === "service") return countBy(responses.flatMap((r) => r.services));
    if (key === "channel") return countBy(responses.flatMap((r) => r.channels));
    if (key === "institution") return countBy(responses.map((r) => r.institution));
    return countBy(responses.map((r) => r.station));
  }, [key, responses]);
  const dimensions: { value: ProfileKey; label: string }[] = [
    { value: "station", label: "Bandara" },
    { value: "service", label: "Layanan" },
    { value: "channel", label: "Kanal" },
    ...(meta.id === "b2b" ? [{ value: "institution" as const, label: "Instansi" }] : []),
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const issues = responses.filter((r) => r.hadIssue).length;
  const answeredIssue = responses.filter((r) => r.hadIssue !== null).length;

  return (
    <section className="card h-full">
      <CardHeader
        eyebrow="Profil responden"
        title={`${meta.audience} yang mengisi survei`}
        description={
          rows.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="font-semibold text-brand hover:underline">
              {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
            </button>
          )
        }
        action={
          <Segmented
            label="Dimensi profil"
            value={key}
            onChange={(v) => {
              setKey(v);
              setShowAll(false);
            }}
            options={dimensions}
          />
        }
      />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 px-5 py-4 sm:px-6">
        {(showAll ? rows : rows.slice(0, 8)).map(([label, count]) => (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink" title={label}>
                {key === "station" ? (
                  <>
                    <b className="font-mono">{label}</b>
                    {airports[label] && <span className="text-muted"> · {airports[label].split(",")[0]}</span>}
                  </>
                ) : (
                  label
                )}
              </span>
              <span className="num shrink-0 text-ink-2">
                <b className="text-ink">{count}</b>{" "}
                <span className="text-muted">({Math.round((count / responses.length) * 100)}%)</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sunken">
              <div className="grow-x h-2 rounded-full bg-ink-2" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted">Kolom ini kosong di sheet.</li>}
      </ul>
      {rows.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="min-h-11 w-full border-t border-line text-sm font-semibold text-brand hover:bg-brand-wash"
        >
          {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
        </button>
      )}
      {answeredIssue > 0 && (
        <p className="mx-5 mb-5 rounded-lg bg-sunken px-3 py-2.5 text-sm text-ink-2 sm:mx-6">
          <b className="num text-ink">{issues}</b> dari <span className="num">{answeredIssue}</span> responden (
          {Math.round((issues / answeredIssue) * 100)}%) mengaku mengalami kendala. Pertanyaan soal penanganan kendala
          hanya dijawab oleh mereka.
        </p>
      )}
    </section>
  );
}

/* ── Voice of Customer ───────────────────────────────────────────── */

type VoiceKey = CommentKey;

export function Voices({ responses, airports }: { responses: Response[]; airports: Record<string, string> }) {
  const [key, setKey] = useState<VoiceKey>("improve");
  const [showAll, setShowAll] = useState(false);
  const items = useMemo(() => pickComments(responses, key), [responses, key]);
  const visible = showAll ? items : items.slice(0, 6);

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <CardHeader
        eyebrow="Voice of Customer"
        title="Respondent Customer Feedback"
        description={
          items.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="font-semibold text-brand hover:underline">
              {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${items.length})`}
            </button>
          )
        }
        action={
          <Segmented
            label="Jenis masukan"
            value={key}
            onChange={(v) => {
              setKey(v);
              setShowAll(false);
            }}
            options={[
              { value: "improve", label: "Perlu diperbaiki" },
              { value: "best", label: "Paling berkesan" },
              { value: "suggestion", label: "Saran" },
            ]}
          />
        }
      />
      {items.length === 0 ? (
        <p className="px-6 py-10 text-sm text-muted">Belum ada yang menulis jawaban untuk pertanyaan ini.</p>
      ) : (
        <ul className="grid flex-1 content-start gap-px bg-line sm:grid-cols-2">
          {visible.map(({ r, text }) => (
            <li key={r.id} className="bg-card px-5 py-4 sm:px-6">
              <Quote aria-hidden className="size-4 text-brand" strokeWidth={2.5} />
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{text}</p>
              <p className="mt-2 text-xs text-muted">
                {formatDate(r.date)}
                {r.station && (
                  <>
                    {" · "}
                    <span className="font-mono font-semibold text-ink-2" title={airports[r.station]}>
                      {r.station}
                    </span>
                  </>
                )}
                {r.services[0] && <> · {r.services[0]}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="min-h-11 border-t border-line text-sm font-semibold text-brand hover:bg-brand-wash"
        >
          {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${items.length})`}
        </button>
      )}
    </section>
  );
}

/* ── Standar & metodologi ──────────────────────────────────────── */

export function Methodology({ label, sheet, overall }: { label?: string; sheet?: string; overall?: number | null }) {
  const current = categorize(overall ?? null);
  return (
    <section className="card grid grid-cols-[minmax(0,1fr)] lg:grid-cols-12">
      <div className="min-w-0 border-b border-line lg:col-span-7 lg:border-r lg:border-b-0">
        <CardHeader
          eyebrow="Standar KPI"
          title="Arti angka index"
          description={
            <>
              Standar minimum index kepuasan JOUMPA adalah <b className="text-ink">4,50</b> pada skala 1 sampai 5. Angka ini
              berlaku untuk survei B2C maupun B2B.
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-5 py-2.5 sm:px-6">
                  <span className="eyebrow">Rentang index</span>
                </th>
                <th className="px-3 py-2.5">
                  <span className="eyebrow">Kategori</span>
                </th>
                <th className="hidden px-5 py-2.5 sm:table-cell sm:px-6">
                  <span className="eyebrow">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => {
                const isCurrent = current?.label === c.label;
                return (
                  <tr key={c.label} className={`border-t border-line ${isCurrent ? "bg-brand-wash/60" : ""}`}>
                    <td className="num px-5 py-3 font-mono font-semibold whitespace-nowrap text-ink sm:px-6">
                      <span className="inline-flex items-center gap-2">
                        <span className={`size-2 rounded-full ${toneMark(c.tone)}`} aria-hidden />
                        {c.range}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-ink">
                      {c.label}
                      {isCurrent && label && (
                        <span className="ml-2 inline-block rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white">
                          KPI CSS {label} Saat Ini
                        </span>
                      )}
                      <span className="mt-1.5 block sm:hidden">
                        <StatusBadge category={c} />
                      </span>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell sm:px-6">
                      <StatusBadge category={c} />
                      {c.tone === "warning" && (
                        <span className="mt-1 block text-xs text-muted">Belum memenuhi standar</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="min-w-0 lg:col-span-5">
        <CardHeader eyebrow="Metodologi" title="Cara menghitung index" />
        <div className="grid gap-4 px-5 py-5 text-sm leading-relaxed text-ink-2 sm:px-6">
          <div className="rounded-lg border border-line bg-sunken px-4 py-3 font-mono text-[13px] text-ink">
            Index = (Total skor ÷ Skor maksimum) × 5
          </div>
          <ul className="grid gap-2">
            <li>Total skor adalah jumlah semua skor yang diberikan responden (1 sampai 5).</li>
            <li>Skor maksimum adalah jumlah jawaban dikali 5.</li>
            <li>Index bagian dan index keseluruhan memakai total skor dari semua pernyataan di dalamnya.</li>
            <li>Pertanyaan yang tidak dijawab tidak ikut dihitung.</li>
            <li>Index dibulatkan ke 2 angka desimal dulu, baru ditentukan kategori dan statusnya.</li>
          </ul>
          {sheet && (
            <p className="text-xs text-muted">
              Data diambil langsung dari sheet <span className="font-mono">{sheet}</span> di Google Sheets.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
