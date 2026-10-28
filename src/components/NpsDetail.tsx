"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { npsBreakdown, npsGroupId, type NpsRow, type Response } from "@/lib/scoring";
import type { Segment } from "@/lib/survey-config";
import { Modal } from "./ScopePicker";
import { Segmented, stationLabel } from "./ui";

type Dimension = "station" | "group";
type Sort = "n" | "high" | "low";

const PREVIEW_ROWS = 10;
const OTHER: Record<Dimension, Dimension> = { station: "group", group: "station" };
const COLUMNS = 7;

/** Dimensi kedua tiap segmen: B2C per jenis layanan, B2B per instansi/perusahaan. */
const GROUP_META: Record<Segment, { noun: string; tab: string; keysOf: (r: Response) => string[] }> = {
  b2c: { noun: "jenis layanan", tab: "Jenis layanan", keysOf: (r) => r.services },
  b2b: { noun: "instansi", tab: "Instansi / perusahaan", keysOf: (r) => (r.institution ? [r.institution] : []) },
};

const signed = (score: number | null) => (score === null ? "–" : score > 0 ? `+${score}` : String(score));

/** Tombol di kartu NPS yang membuka rincian promotor, pasif, dan detraktor per bandara serta jenis layanan/instansi. */
export function NpsDetailButton({
  responses,
  airports,
  segment,
}: {
  responses: Response[];
  airports: Record<string, string>;
  segment: Segment;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3 text-xs font-semibold text-ink hover:border-ink-2"
      >
        <ListChecks aria-hidden className="size-4" /> Lihat rincian per bandara &amp; {GROUP_META[segment].noun}
      </button>
      {open && <NpsDetailDialog responses={responses} airports={airports} segment={segment} onClose={() => setOpen(false)} />}
    </>
  );
}

function NpsDetailDialog({
  responses,
  airports,
  segment,
  onClose,
}: {
  responses: Response[];
  airports: Record<string, string>;
  segment: Segment;
  onClose: () => void;
}) {
  const group = GROUP_META[segment];
  const [dimension, setDimension] = useState<Dimension>("station");
  const [sort, setSort] = useState<Sort>("n");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const keysOf = (dim: Dimension) => (dim === "station" ? (r: Response) => (r.station ? [r.station] : []) : group.keysOf);
  const nounOf = (dim: Dimension) => (dim === "station" ? "bandara" : group.noun);
  // Kode bandara ditampilkan dengan nama lengkapnya bila tersedia di Helper_Kode_Cabang.
  const build = (list: Response[], dim: Dimension) =>
    sortRows(
      npsBreakdown(list, keysOf(dim)).map((row) =>
        dim === "station" && row.id ? { ...row, label: stationLabel(row.label.toUpperCase(), airports) } : row,
      ),
      sort,
    );

  const rows = useMemo(() => build(responses, dimension), [responses, dimension, sort, airports, segment]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS);
  const other = OTHER[dimension];

  const detail = useMemo(() => {
    if (openId === null) return [];
    const subset = responses.filter((r) => {
      const keys = keysOf(dimension)(r);
      return openId === "" ? keys.length === 0 : keys.some((k) => npsGroupId(k) === openId);
    });
    return build(subset, other);
  }, [openId, responses, dimension, other, sort, airports, segment]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Rincian Net Promoter Score"
      description="Siapa yang merekomendasikan: promotor (skor 9–10), pasif (7–8), dan detraktor (0–6). Mengikuti filter yang sedang dipilih."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Kelompokkan berdasarkan"
          value={dimension}
          onChange={(v) => {
            setDimension(v);
            setShowAll(false);
            setOpenId(null);
          }}
          options={[
            { value: "station", label: "Bandara" },
            { value: "group", label: group.tab },
          ]}
        />
        <Segmented
          label="Urutan"
          value={sort}
          onChange={setSort}
          options={[
            { value: "n", label: "Jawaban terbanyak" },
            { value: "high", label: "NPS tertinggi" },
            { value: "low", label: "NPS terendah" },
          ]}
        />
      </div>
      <p className="mt-3 text-xs text-muted">Klik salah satu baris untuk melihat {nounOf(other)} di dalamnya.</p>

      {rows.length === 0 ? (
        <p className="py-10 text-sm text-muted">Belum ada jawaban NPS untuk pilihan ini.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Net Promoter Score per {nounOf(dimension)}</caption>
            <NpsHead noun={nounOf(dimension)} />
            <tbody>
              {visible.map((row) => {
                const isOpen = openId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setOpenId(isOpen ? null : row.id)}
                      className="cursor-pointer border-b border-line hover:bg-sunken/60"
                    >
                      <th scope="row" className="px-2 py-2.5 text-left font-medium text-ink">
                        <button
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Tutup" : "Buka"} rincian ${row.label}`}
                          className="flex items-start gap-2 text-left"
                        >
                          <ChevronDown
                            aria-hidden
                            className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${isOpen ? "" : "-rotate-90"}`}
                          />
                          <span>
                            <span className="block max-w-[22rem] leading-snug">{row.label}</span>
                            {row.n < 5 && <span className="text-xs font-normal text-muted">data masih sedikit</span>}
                          </span>
                        </button>
                      </th>
                      <NpsCells row={row} />
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line bg-sunken/50">
                        <td colSpan={COLUMNS} className="px-2 py-3 pl-8">
                          <p className="mb-2 text-xs font-semibold text-ink-2">
                            {row.label}: per {nounOf(other)}
                          </p>
                          <table className="w-full min-w-[600px] border-collapse text-sm">
                            <caption className="sr-only">
                              Net Promoter Score {row.label} per {nounOf(other)}
                            </caption>
                            <NpsHead noun={nounOf(other)} />
                            <tbody>
                              {detail.map((sub) => (
                                <tr key={sub.id} className="border-b border-line last:border-b-0">
                                  <th scope="row" className="px-2 py-2 text-left font-medium text-ink">
                                    <span className="block max-w-[22rem] leading-snug">{sub.label}</span>
                                    {sub.n < 5 && <span className="text-xs font-normal text-muted">data masih sedikit</span>}
                                  </th>
                                  <NpsCells row={sub} />
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length > PREVIEW_ROWS && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 min-h-11 w-full rounded-lg text-sm font-semibold text-brand hover:bg-brand-wash"
            >
              {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
            </button>
          )}
          <p className="mt-3 text-xs text-muted">
            Nama dikelompokkan tanpa membedakan huruf besar/kecil. Baris &quot;Tidak diisi&quot; adalah jawaban yang
            kolomnya kosong di sheet.
            {segment === "b2c" && " Satu responden bisa memakai lebih dari satu jenis layanan, jadi jumlah per jenis layanan bisa lebih besar dari total."}
          </p>
        </div>
      )}
    </Modal>
  );
}

function sortRows(list: NpsRow[], sort: Sort): NpsRow[] {
  const byScore = (a: NpsRow, b: NpsRow) => (a.score ?? -101) - (b.score ?? -101);
  if (sort === "high") return [...list].sort((a, b) => byScore(b, a) || b.n - a.n);
  if (sort === "low") return [...list].sort((a, b) => byScore(a, b) || b.n - a.n);
  return list;
}

function NpsHead({ noun }: { noun: string }) {
  return (
    <thead>
      <tr className="border-b border-line text-left">
        <th scope="col" className="px-2 py-2">
          <span className="eyebrow capitalize">{noun}</span>
        </th>
        <th scope="col" className="w-20 px-2 py-2 text-right">
          <span className="eyebrow">Jawaban</span>
        </th>
        <th scope="col" className="w-24 px-2 py-2 text-right">
          <span className="eyebrow">Promotor</span>
        </th>
        <th scope="col" className="w-16 px-2 py-2 text-right">
          <span className="eyebrow">Pasif</span>
        </th>
        <th scope="col" className="w-24 px-2 py-2 text-right">
          <span className="eyebrow">Detraktor</span>
        </th>
        <th scope="col" className="w-48 px-2 py-2">
          <span className="eyebrow">Sebaran</span>
        </th>
        <th scope="col" className="w-16 px-2 py-2 text-right">
          <span className="eyebrow">NPS</span>
        </th>
      </tr>
    </thead>
  );
}

function NpsCells({ row }: { row: NpsRow }) {
  return (
    <>
      <td className="num px-2 py-2.5 text-right font-semibold text-ink">{row.n}</td>
      <td className="num px-2 py-2.5 text-right text-good">{row.promoters}</td>
      <td className="num px-2 py-2.5 text-right text-ink-2">{row.passives}</td>
      <td className="num px-2 py-2.5 text-right text-crit">{row.detractors}</td>
      <td className="px-2 py-2.5">
        <div
          className="flex h-3 overflow-hidden rounded-full bg-sunken"
          role="img"
          aria-label={`${row.promoters} promotor, ${row.passives} pasif, ${row.detractors} detraktor`}
        >
          <span className="bg-good-mark" style={{ width: `${(row.promoters / row.n) * 100}%` }} />
          <span className="bg-lk3" style={{ width: `${(row.passives / row.n) * 100}%` }} />
          <span className="bg-crit-mark" style={{ width: `${(row.detractors / row.n) * 100}%` }} />
        </div>
      </td>
      <td className="num px-2 py-2.5 text-right text-base font-extrabold text-ink">{signed(row.score)}</td>
    </>
  );
}
