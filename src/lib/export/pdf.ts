import { readFileSync } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { autoTable, type CellInput, type RowInput } from "jspdf-autotable";
import type { ReportScope } from "../filters";
import { formatDate, formatDateTime } from "../format";
import { buildSegmentReport, lowestStatements, pickComments, type SegmentReport } from "../report";
import { CATEGORIES, KPI_TARGET, categorize, formatIndex, meetsKpi, type StatusTone } from "../scoring";
import type { ServerDashboardData } from "../sheets";

export type RGB = [number, number, number];
export const INK: RGB = [21, 25, 29];
export const INK2: RGB = [61, 67, 74];
export const MUTED: RGB = [100, 106, 113];
export const LINE: RGB = [226, 224, 216];
export const SUNKEN: RGB = [243, 242, 238];
export const TONE: Record<StatusTone, { text: RGB; fill: RGB }> = {
  good: { text: [11, 122, 59], fill: [230, 244, 234] },
  warning: { text: [138, 83, 0], fill: [253, 241, 216] },
  critical: { text: [180, 35, 24], fill: [253, 236, 235] },
};

export type PdfLayout = "portrait" | "landscape";

/** A4 tegak, atau slide 16:9 (13,33 x 7,5 inci) seperti PowerPoint. */
const PAGE_SIZE: Record<PdfLayout, { w: number; h: number; scale: number }> = {
  portrait: { w: 210, h: 297, scale: 1 },
  landscape: { w: 338.667, h: 190.5, scale: 1.3 },
};

/** Font standar PDF hanya mengenal WinAnsi; ganti karakter di luar itu. */
export function t(s: string): string {
  return s
    .replace(/[−‒]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[^\x00-\xFF–—‘’“”•…€™]/g, "");
}

export function loadLogo(): string | null {
  try {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "logo-gapura.png");
    return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}

export function buildPdf(data: ServerDashboardData, scope: ReportScope, layout: PdfLayout = "portrait"): Buffer {
  const { w: PAGE_W, h: PAGE_H, scale: S } = PAGE_SIZE[layout];
  const landscape = layout === "landscape";
  const M = 14 * S; // margin mm
  const CONTENT_W = PAGE_W - M * 2;
  const doc = new jsPDF({ unit: "mm", format: landscape ? [PAGE_W, PAGE_H] : "a4", orientation: landscape ? "landscape" : "portrait", compress: true });
  const logo = loadLogo();
  const reports = scope.segments.map((seg) => buildSegmentReport(data, seg, scope.filters[seg]));
  const has = (k: ReportScope["content"][number]) => scope.content.includes(k);
  // Posisi vertikal disimpan di objek: `let y` yang dibaca di dalam closure pernah
  // dipadatkan minifier menjadi `y = 24 + text()` sehingga text() membaca nilai lama.
  const cur = { y: M, first: true };

  const ensure = (h: number) => {
    if (cur.y + h > PAGE_H - 18) {
      doc.addPage();
      cur.y = 24;
    }
  };
  const text = (
    s: string,
    x: number,
    size: number,
    opts: { bold?: boolean; color?: RGB; maxW?: number; align?: "left" | "right" } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size * S);
    doc.setTextColor(...(opts.color ?? INK));
    const lines = doc.splitTextToSize(t(s), opts.maxW ?? CONTENT_W) as string[];
    doc.text(lines, x, cur.y, { align: opts.align ?? "left", baseline: "top" });
    return lines.length * size * S * 0.3528 * 1.25;
  };
  const heading = (s: string, sub?: string) => {
    // Mode slide: tiap bagian laporan mulai di slide baru.
    if (landscape && !cur.first) {
      doc.addPage();
      cur.y = 24;
    }
    cur.first = false;
    ensure(22);
    cur.y += 2;
    cur.y += text(s, M, 13, { bold: true });
    if (sub) cur.y += text(sub, M, 9, { color: MUTED });
    cur.y += 2;
  };
  const table = (opts: Parameters<typeof autoTable>[1]) => {
    autoTable(doc, {
      startY: cur.y,
      margin: { left: M, right: M, top: 24, bottom: 18 },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8.5 * S, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: LINE },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 * S },
      bodyStyles: { lineWidth: { bottom: 0.2 } },
      ...opts,
    });
    cur.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  };
  const status = (tone: StatusTone | undefined, label: string): CellInput =>
    tone
      ? { content: t(label), styles: { textColor: TONE[tone].text, fillColor: TONE[tone].fill, fontStyle: "bold" } }
      : "-";

  /* ── Halaman judul ── */
  if (logo) doc.addImage(logo, "PNG", M, cur.y, 36 * S, 19.5 * S);
  cur.y += 30 * S;
  cur.y += text("LAPORAN SURVEI KEPUASAN PELANGGAN", M, 8.5, { bold: true, color: MUTED });
  cur.y += 1;
  cur.y += text("JOUMPA CSS Survey", M, 26, { bold: true });
  const dates = reports.flatMap((r) => r.responses.map((x) => x.date)).filter(Boolean).sort();
  if (dates.length) {
    cur.y += text(`Respons tanggal ${formatDate(dates[0], true)} sampai ${formatDate(dates[dates.length - 1], true)}`, M, 11, {
      color: INK2,
    });
  }
  cur.y += text(`Data Google Sheets per ${formatDateTime(data.fetchedAt)}`, M, 9, { color: MUTED });
  cur.y += 6;

  // Kartu index per segmen
  const cardW = reports.length > 1 ? (CONTENT_W - 6) / 2 : CONTENT_W / 2;
  const cardH = 46 * S;
  reports.forEach((rep, i) => {
    const x = M + i * (cardW + 6);
    const idx = rep.result.overall.index;
    const cat = categorize(idx);
    doc.setDrawColor(...LINE);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cur.y, cardW, cardH, 2, 2, "FD");
    if (cat) {
      doc.setFillColor(...TONE[cat.tone].text);
      doc.rect(x, cur.y, cardW, 1.2 * S, "F");
    }
    const save = cur.y;
    cur.y = save + 5.5 * S;
    text(`${rep.meta.label} · ${rep.meta.audience}`, x + 5, 10, { bold: true });
    text(`${rep.responses.length} respons`, x + cardW - 5, 8.5, { color: MUTED, align: "right" });
    cur.y = save + 13 * S;
    text(formatIndex(idx), x + 5, 30, { bold: true });
    doc.setFontSize(30 * S);
    const w = doc.getTextWidth(formatIndex(idx));
    cur.y = save + 18.5 * S;
    text(cat?.label ?? "-", x + 8 * S + w, 12, { bold: true, color: cat ? TONE[cat.tone].text : MUTED });
    cur.y = save + 29 * S;
    text(cat?.status ?? "Belum ada data", x + 5, 9, { bold: true, color: cat ? TONE[cat.tone].text : MUTED });
    cur.y = save + 36 * S;
    text(rep.filterText, x + 5, 7.5, { color: MUTED, maxW: cardW - 10 });
    cur.y = save;
  });
  cur.y += cardH + 8 * S;
  cur.y += text(`Standar KPI ${formatIndex(KPI_TARGET)} pada skala 1 sampai 5.`, M, 9, { color: MUTED });

  /* ── Per segmen ── */
  for (const rep of reports) {
    doc.addPage();
    cur.y = 24;
    cur.first = true;
    cur.y += text(`${rep.meta.label} · ${rep.meta.audience}`, M, 18, { bold: true });
    cur.y += text(rep.filterText, M, 9, { color: MUTED });
    cur.y += 3;

    if (!rep.responses.length) {
      cur.y += text("Tidak ada respons untuk pilihan ini.", M, 10, { color: MUTED });
      continue;
    }
    if (has("ringkasan")) summarySection(rep);
    if (has("bagian")) sectionsSection(rep);
    if (has("prioritas")) prioritySection(rep);
    if (has("tren")) trendSection(rep);
    if (has("rincian")) detailSection(rep);
    if (has("responden")) commentsSection(rep);
  }

  if (has("standar")) {
    doc.addPage();
    cur.y = 24;
    cur.first = true;
    heading("Standar KPI dan cara menghitung index", "Standar minimum index kepuasan JOUMPA adalah 4,50, berlaku untuk B2C dan B2B.");
    table({
      head: [["Rentang index", "Kategori", "Status"]],
      body: CATEGORIES.map((c) => [
        t(c.range),
        c.label,
        status(c.tone, c.tone === "warning" ? "Perlu Peningkatan / Belum Memenuhi Standar" : c.status),
      ]),
      columnStyles: { 0: { cellWidth: 40 * S }, 1: { cellWidth: 50 * S } },
    });
    for (const line of [
      "Index (1-5) = Total skor / Skor maksimum x 5",
      "Total skor adalah jumlah semua skor 1 sampai 5 yang diberikan responden.",
      "Skor maksimum adalah jumlah jawaban dikali 5.",
      "Index bagian dan index keseluruhan memakai total skor semua pernyataan di dalamnya.",
      "Pertanyaan yang tidak dijawab tidak ikut dihitung. Index dibulatkan 2 desimal sebelum kategorinya ditentukan.",
    ]) {
      ensure(6);
      cur.y += text(line, M, 9, { color: INK2 });
    }
  }

  /* ── Header & footer tiap halaman ── */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      if (logo) doc.addImage(logo, "PNG", M, 8, 16, 8.7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5 * S);
      doc.setTextColor(...INK);
      doc.text("JOUMPA CSS Survey", M + 20, 13.5);
      doc.setDrawColor(...LINE);
      doc.line(M, 18.5, PAGE_W - M, 18.5);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5 * S);
    doc.setTextColor(...MUTED);
    doc.text(t(`Data Google Sheets per ${formatDateTime(data.fetchedAt)}`), M, PAGE_H - 9);
    doc.text(`${landscape ? "Slide" : "Halaman"} ${p} dari ${pages}`, PAGE_W - M, PAGE_H - 9, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));

  /* ── Bagian-bagian laporan ── */

  function summarySection(rep: SegmentReport) {
    const { result, nps } = rep;
    const idx = result.overall.index;
    const cat = categorize(idx);
    const secWithData = result.sections.filter((s) => s.index !== null);
    const statements = result.sections.flatMap((s) => s.statements).filter((s) => s.index !== null);
    heading("Ringkasan");
    table({
      body: [
        ["Index keseluruhan", { content: `${formatIndex(idx)} / 5,00`, styles: { fontStyle: "bold", fontSize: 11 } }],
        ["Kategori", cat?.label ?? "-"],
        ["Status", status(cat?.tone, cat?.status ?? "-")],
        [
          "Selisih terhadap standar 4,50",
          idx === null ? "-" : `${idx - KPI_TARGET >= 0 ? "+" : "-"}${formatIndex(Math.abs(idx - KPI_TARGET))}`,
        ],
        ["Responden", String(result.respondents)],
        ["Bagian yang lolos KPI", `${secWithData.filter((s) => meetsKpi(s.index)).length} dari ${secWithData.length}`],
        ["Pernyataan di bawah 4,50", `${statements.filter((s) => !meetsKpi(s.index)).length} dari ${statements.length}`],
        [
          "Net Promoter Score",
          nps.score === null
            ? "Belum ada jawaban"
            : `${nps.score > 0 ? "+" : ""}${nps.score} (dari ${nps.n} jawaban: ${nps.promoters} promotor, ${nps.passives} pasif, ${nps.detractors} detraktor)`,
        ],
      ],
      columnStyles: { 0: { cellWidth: 62 * S, textColor: INK2 } },
    });
  }

  function sectionsSection(rep: SegmentReport) {
    heading("Index per bagian layanan", "Standar KPI 4,50.");
    table({
      head: [["Bagian", "Butir", "Jawaban", "Index", "Kategori", "Status KPI"]],
      body: rep.result.sections.map((s) => {
        const c = categorize(s.index);
        return [`${s.code}. ${t(s.title)}`, String(s.statements.length), String(s.n), formatIndex(s.index), c?.label ?? "-", status(c?.tone, c?.status ?? "-")];
      }),
      columnStyles: {
        1: { halign: "center", cellWidth: 14 * S },
        2: { halign: "center", cellWidth: 18 * S },
        3: { halign: "right", cellWidth: 16 * S, fontStyle: "bold" },
        4: { cellWidth: 30 * S },
        5: { cellWidth: 40 * S },
      },
    });
  }

  function prioritySection(rep: SegmentReport) {
    const lowest = lowestStatements(rep.result);
    heading("Pernyataan dengan skor terendah", "Pernyataan yang belum mencapai 4,50, dari yang paling rendah.");
    if (!lowest.length) {
      cur.y += text("Semua pernyataan sudah mencapai standar KPI 4,50.", M, 9.5, { color: TONE.good.text });
      cur.y += 4;
      return;
    }
    table({
      head: [["#", "Pernyataan", "Bagian", "n", "Index", "Selisih"]],
      body: lowest.map((s, i) => [
        String(i + 1),
        t(s.text),
        s.sectionCode,
        String(s.n),
        formatIndex(s.index),
        { content: `-${formatIndex(KPI_TARGET - s.index!)}`, styles: { textColor: TONE[categorize(s.index)!.tone].text } },
      ]),
      columnStyles: {
        0: { cellWidth: 8 * S },
        2: { halign: "center", cellWidth: 16 * S },
        3: { halign: "center", cellWidth: 12 * S },
        4: { halign: "right", cellWidth: 16 * S, fontStyle: "bold" },
        5: { halign: "right", cellWidth: 16 * S },
      },
    });
  }

  function trendSection(rep: SegmentReport) {
    const points = rep.trend.filter((p) => p.index !== null);
    heading("Index per minggu", "Minggu dihitung Senin sampai Minggu berdasarkan tanggal pengisian.");
    if (!points.length) {
      cur.y += text("Belum ada data bertanggal.", M, 9.5, { color: MUTED });
      cur.y += 4;
      return;
    }
    table({
      head: [["Minggu mulai", "Respons", "Index", "Status KPI"]],
      body: points.map((p) => {
        const c = categorize(p.index);
        return [formatDate(p.week, true), String(p.respondents), formatIndex(p.index), status(c?.tone, c?.status ?? "-")];
      }),
      columnStyles: { 1: { halign: "center" }, 2: { halign: "right", fontStyle: "bold" } },
    });
  }

  function detailSection(rep: SegmentReport) {
    heading("Rincian per pernyataan", "Jumlah responden yang memilih skor 1 sampai 5.");
    const body: RowInput[] = [];
    for (const s of rep.result.sections) {
      const c = categorize(s.index);
      body.push([
        {
          content: t(`${s.code}. ${s.title}   ·   index ${formatIndex(s.index)}   ·   ${c?.status ?? "belum ada data"}`),
          colSpan: 10,
          styles: { fillColor: SUNKEN, fontStyle: "bold" },
        },
      ]);
      for (const st of s.statements) {
        const sc = categorize(st.index);
        body.push([
          String(st.no),
          t(st.text),
          ...st.counts.map(String),
          String(st.n),
          formatIndex(st.index),
          sc ? { content: sc.label, styles: { textColor: TONE[sc.tone].text, fontStyle: "bold" } } : "-",
        ]);
      }
    }
    table({
      head: [["No", "Pernyataan", "1", "2", "3", "4", "5", "n", "Index", "Kategori"]],
      body,
      styles: { fontSize: 7.8 * S },
      columnStyles: {
        0: { cellWidth: 8 * S },
        2: { halign: "center", cellWidth: 7 * S },
        3: { halign: "center", cellWidth: 7 * S },
        4: { halign: "center", cellWidth: 7 * S },
        5: { halign: "center", cellWidth: 7 * S },
        6: { halign: "center", cellWidth: 7 * S },
        7: { halign: "center", cellWidth: 8 * S },
        8: { halign: "right", cellWidth: 12 * S, fontStyle: "bold" },
        9: { cellWidth: 26 * S },
      },
    });
  }

  function commentsSection(rep: SegmentReport) {
    const groups: [string, ReturnType<typeof pickComments>][] = [
      ["Yang perlu diperbaiki", pickComments(rep.responses, "improve")],
      ["Yang paling berkesan", pickComments(rep.responses, "best")],
      ["Saran lainnya", pickComments(rep.responses, "suggestion")],
    ];
    if (groups.every(([, items]) => !items.length)) return;
    heading("Kata responden", "Jawaban tertulis, terbaru lebih dulu.");
    for (const [title, items] of groups) {
      if (!items.length) continue;
      ensure(landscape ? 70 : 40);
      table({
        head: [[title, "Tanggal", "Bandara"]],
        body: items.slice(0, 15).map(({ r, text: c }) => [t(c), r.date ? formatDate(r.date) : "-", r.station || "-"]),
        columnStyles: { 1: { cellWidth: 26 * S }, 2: { cellWidth: 18 * S } },
      });
    }
  }
}
