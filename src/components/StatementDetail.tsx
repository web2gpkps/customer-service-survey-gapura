"use client";

import { categorize, formatIndex, type StatementResult } from "@/lib/scoring";
import { toneText } from "./ui";

export const LIKERT = [
  { score: 1, label: "Sangat Tidak Puas", color: "bg-lk1" },
  { score: 2, label: "Tidak Puas", color: "bg-lk2" },
  { score: 3, label: "Cukup / Netral", color: "bg-lk3" },
  { score: 4, label: "Puas", color: "bg-lk4" },
  { score: 5, label: "Sangat Puas", color: "bg-lk5" },
];

export function LikertLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
      <span className="eyebrow">Skala</span>
      {LIKERT.map((l) => (
        <span key={l.score} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <span className={`size-3 rounded-[3px] ${l.color}`} aria-hidden />
          <b className="font-mono">{l.score}</b> {l.label}
        </span>
      ))}
    </div>
  );
}

/** Daftar pernyataan: kartu di layar kecil, tabel di layar md ke atas. */
export function StatementList({ statements }: { statements: StatementResult[] }) {
  return (
    <>
      <ul className="md:hidden">
        {statements.map((st) => {
          const c = categorize(st.index);
          return (
            <li key={st.no} className="border-t border-line px-5 py-3.5 first:border-t-0">
              <p className="flex gap-3 text-sm leading-snug text-ink">
                <span className="num w-5 shrink-0 font-mono text-xs text-muted">{st.no}</span>
                {st.text}
              </p>
              <div className="mt-2.5 pl-8">
                <Distribution counts={st.counts} n={st.n} />
                <p className="num mt-2 flex flex-wrap items-baseline gap-x-3 text-xs text-muted">
                  <span>
                    Index <b className="text-sm font-extrabold text-ink">{formatIndex(st.index)}</b>
                  </span>
                  {c && <span className={`font-semibold ${toneText(c.tone)}`}>{c.label}</span>}
                  <span>n={st.n}</span>
                  <span>
                    Skor 1 s.d. 5: <span className="font-mono text-ink-2">{st.counts.join(" · ")}</span>
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-sunken/60 text-left">
            <tr>
              <th scope="col" className="w-10 py-2 pl-5 sm:pl-6">
                <span className="eyebrow">No</span>
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="eyebrow">Pernyataan</span>
              </th>
              <th scope="col" className="w-[22%] px-3 py-2">
                <span className="eyebrow">Sebaran jawaban</span>
              </th>
              {LIKERT.map((l) => (
                <th key={l.score} scope="col" className="w-9 px-1 py-2 text-center" title={l.label}>
                  <span className="eyebrow">{l.score}</span>
                </th>
              ))}
              <th scope="col" className="w-10 px-2 py-2 text-right">
                <span className="eyebrow">n</span>
              </th>
              <th scope="col" className="w-16 px-3 py-2 text-right">
                <span className="eyebrow">Index</span>
              </th>
              <th scope="col" className="w-44 py-2 pr-5 pl-3 sm:pr-6">
                <span className="eyebrow">Kategori</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {statements.map((st) => {
              const c = categorize(st.index);
              return (
                <tr key={st.no} className="border-t border-line align-middle hover:bg-sunken/50">
                  <td className="num py-3 pl-5 font-mono text-xs text-muted sm:pl-6">{st.no}</td>
                  <td className="px-3 py-3 leading-snug text-ink">{st.text}</td>
                  <td className="px-3 py-3">
                    <Distribution counts={st.counts} n={st.n} />
                  </td>
                  {st.counts.map((count, i) => (
                    <td key={i} className={`num px-1 py-3 text-center ${count ? "text-ink-2" : "text-line-strong"}`}>
                      {count}
                    </td>
                  ))}
                  <td className="num px-2 py-3 text-right font-semibold text-ink">{st.n}</td>
                  <td className="num px-3 py-3 text-right text-base font-extrabold text-ink">{formatIndex(st.index)}</td>
                  <td className="py-3 pr-5 pl-3 sm:pr-6">
                    {c ? (
                      <span className={`font-semibold ${toneText(c.tone)}`}>{c.label}</span>
                    ) : (
                      <span className="text-xs text-muted">Belum ada jawaban</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Distribution({ counts, n }: { counts: number[]; n: number }) {
  if (!n) return <div className="h-3 rounded-full bg-sunken" aria-label="Belum ada jawaban" />;
  const summary = LIKERT.map((l, i) => `${l.label}: ${counts[i]}`).join(", ");
  return (
    <div className="flex h-3 gap-[2px]" role="img" aria-label={summary}>
      {LIKERT.map((l, i) =>
        counts[i] ? (
          <span
            key={l.score}
            tabIndex={0}
            className={`group relative first:rounded-l-full last:rounded-r-full ${l.color} outline-offset-1`}
            style={{ flexGrow: counts[i], flexBasis: 0 }}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-lg group-hover:block group-focus:block">
              {l.score} · {l.label}: <b>{counts[i]}</b> ({Math.round((counts[i] / n) * 100)}%)
            </span>
          </span>
        ) : null,
      )}
    </div>
  );
}
