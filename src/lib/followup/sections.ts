/**
 * Menentukan kategori isu sebagai BAGIAN KUESIONER (Reservasi, Keberangkatan, Kedatangan, dst.).
 * Urutan keputusan:
 *  1. menjawab kendala atau teks berisi keluhan → bagian penanganan kendala
 *  2. ada butir bernilai rendah → bagian dengan butir rendah terbanyak (seri: rata-rata skor terendah)
 *  3. index di bawah standar tanpa butir rendah → bagian dengan rata-rata skor terendah
 *  4. hanya kritik atau saran → bagian yang paling cocok dengan kata kunci di teks
 */
import { normText } from "./classify";
import { KENDALA_CATEGORY, LOW_ITEM_MAX } from "./types";
import { OTHER_SECTION, type Segment } from "../survey-config";

export interface SectionSpan {
  short: string;
  from: number; // indeks skor pertama (termasuk)
  to: number; // indeks skor terakhir (tidak termasuk)
}

export function spansOf(sections: { short: string; statements: unknown[] }[]): SectionSpan[] {
  let at = 0;
  return sections.map((s) => {
    const span = { short: s.short, from: at, to: at + s.statements.length };
    at = span.to;
    return span;
  });
}

interface Hint {
  re: RegExp;
  b2c: (ctx: { arrival: boolean; transfer: boolean }) => string;
  b2b: string;
}

const dep = (c: { arrival: boolean; transfer: boolean }) => (c.transfer ? "Transit / Transfer" : c.arrival ? "Kedatangan" : "Keberangkatan");

const HINTS: Hint[] = [
  { re: /\b(reservasi|booking|pesan\w*|pemesanan|konfirmasi|confirm\w*|website|aplikasi|app|formulir|kuota|overbook\w*|jms)\b/, b2c: () => "Reservasi", b2b: "Reservasi & koordinasi" },
  { re: /\b(respon\w*|balas\w*|chat|komunikasi|update|informasi|info|notifikasi|jadwal|telepon|telfon|whatsapp|hotline|real ?time|kabar|hubungi|menghubungi|communicat\w+)\b/, b2c: () => "Reservasi", b2b: "Komunikasi real-time" },
  { re: /\b(invoice|tagihan|penagihan|laporan|report|administrasi|dokumen\w*)\b/, b2c: () => "Kepuasan keseluruhan", b2b: "Pelaporan & administrasi" },
  { re: /\b(security|screening|keamanan|x-?ray|customs)\b/, b2c: () => "Keamanan", b2b: "Operasional & SLA" },
  { re: /\b(petugas|staf|staff|personel|personil|kru|manning|seragam|driver|sopir|jemput\w*|pickup|porter|buddy|buggy|pendamping\w*|dedicated|shift|shif)\b/, b2c: dep, b2b: "Operasional & SLA" },
  { re: /\b(fast ?track|fasttrack|fastrack|imigrasi|immigration|antri\w*|antrean|queue|bagasi|baggage|check-?in|counter|gate|lounge|ruang tunggu|fasilitas|mobil|kendaraan|limousine|transport\w*)\b/, b2c: dep, b2b: "Operasional & SLA" },
  { re: /\b(harga|tarif|biaya|paket|diskon|promo\w*|cabang|bandara lain|kota lain|perluas\w*|airlines?|maskapai)\b/, b2c: () => "Kepuasan keseluruhan", b2b: "Hubungan kemitraan" },
];

/** Bagian paling cocok untuk teks tanpa data skor; bila tak ada kata kunci, bagian umum segmen itu. */
export function sectionFromText(segment: Segment, text: string, services: string): string {
  const n = normText(text);
  const ctx = {
    arrival: /\b(kedatangan|arrival|datang|jemput\w*|conveyor)\b/.test(n),
    transfer: /transfer/i.test(services) && !/meet & greet/i.test(services),
  };
  for (const h of HINTS) if (h.re.test(n)) return segment === "b2c" ? h.b2c(ctx) : h.b2b;
  return segment === "b2c" ? "Kepuasan keseluruhan" : "Hubungan kemitraan";
}

export function pickSection(input: {
  segment: Segment;
  spans: SectionSpan[];
  scores: (number | null)[];
  index: number | null;
  belowKpi: boolean;
  kendala: boolean;
  text: string;
  services: string;
}): string {
  const { segment, spans } = input;
  const exists = (label: string) => spans.some((s) => s.short === label);
  const safe = (label: string) => (exists(label) ? label : OTHER_SECTION.short);

  if (input.kendala && exists(KENDALA_CATEGORY[segment])) return KENDALA_CATEGORY[segment];

  const stats = spans
    .map((s) => {
      const part = input.scores.slice(s.from, s.to).filter((v): v is number => v !== null);
      return {
        short: s.short,
        n: part.length,
        low: part.filter((v) => v <= LOW_ITEM_MAX).length,
        avg: part.length ? part.reduce((a, b) => a + b, 0) / part.length : Infinity,
      };
    })
    .filter((s) => s.n > 0);

  const lows = stats.filter((s) => s.low > 0).sort((a, b) => b.low - a.low || a.avg - b.avg);
  if (lows.length) return safe(lows[0].short);

  if (input.belowKpi && stats.length) return safe([...stats].sort((a, b) => a.avg - b.avg)[0].short);

  return safe(sectionFromText(segment, input.text, input.services));
}
