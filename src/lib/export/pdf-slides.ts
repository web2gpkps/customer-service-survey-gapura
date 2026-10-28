import { jsPDF } from "jspdf";
import { autoTable, type CellInput, type RowInput } from "jspdf-autotable";
import type { ReportScope } from "../filters";
import { formatDate, formatDateTime } from "../format";
import { buildSegmentReport, lowestStatements, pickComments, type SegmentReport } from "../report";
import { CATEGORIES, KPI_TARGET, categorize, formatIndex, meetsKpi, type StatusTone } from "../scoring";
import type { ServerDashboardData } from "../sheets";
import { INK, INK2, LINE, MUTED, SUNKEN, TONE, loadLogo, t, type RGB } from "./pdf";

/** Ukuran slide PowerPoint widescreen 16:9 (13,333 x 7,5 inci). */
const W = 338.667;
const H = 190.5;
const M = 16;
const CONTENT_W = W - M * 2;
const TOP = 34;
const BOTTOM = H - 14;
const BRAND: RGB = [13, 122, 77];

export function buildSlidesPdf(data: ServerDashboardData, scope: ReportScope): Buffer {
  const doc = new jsPDF({ unit: "mm", format: [W, H], orientation: "landscape", compress: true });
  const logo = loadLogo();
  const reports = scope.segments.map((seg) => buildSegmentReport(data, seg, scope.filters[seg]));
  const has = (k: ReportScope["content"][number]) => scope.content.includes(k);
  const stamp = `Data Google Sheets per ${formatDateTime(data.fetchedAt)}`;
  let first = true;
  let segLabel = ""; // prefiks judul slide: segmen yang sedang dibuat

  const tx = (
    s: string,
    x: number,
    y: number,
    size: number,
    opts: { bold?: boolean; color?: RGB; maxW?: number; align?: "left" | "right" | "center"; maxLines?: number } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? INK));
    let lines = doc.splitTextToSize(t(s), opts.maxW ?? CONTENT_W) as string[];
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(0, opts.maxLines);
      lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s+\S*$/, "")}...`;
    }
    doc.text(lines, x, y, { align: opts.align ?? "left", baseline: "top" });
    return lines.length * size * 0.3528 * 1.25;
  };

  const slide = (title: string, sub?: string) => {
    if (first) first = false;
    else doc.addPage([W, H], "landscape");
    if (logo) doc.addImage(logo, "PNG", W - M - 22, 8, 22, 11.9);
    tx(segLabel ? `${segLabel} · ${title}` : title, M, 9, 22, { bold: true, maxW: CONTENT_W - 30 });
    if (sub) tx(sub, M, 20.5, 10.5, { color: MUTED, maxW: CONTENT_W - 30, maxLines: 2 });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, 28, W - M, 28);
  };

  const pill = (label: string, x: number, y: number, tone: StatusTone | undefined, size = 10) => {
    const colors = tone ? TONE[tone] : { text: MUTED, fill: SUNKEN };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    const w = doc.getTextWidth(t(label)) + 7;
    doc.setFillColor(...colors.fill);
    doc.roundedRect(x, y, w, size * 0.3528 * 1.25 + 3.4, 1.6, 1.6, "F");
    doc.setTextColor(...colors.text);
    doc.text(t(label), x + 3.5, y + 1.7, { baseline: "top" });
    return w;
  };

  const status = (tone: StatusTone | undefined, label: string): CellInput =>
    tone
      ? { content: t(label), styles: { textColor: TONE[tone].text, fillColor: TONE[tone].fill, fontStyle: "bold" } }
      : "-";

  const table = (opts: Parameters<typeof autoTable>[1]) =>
    autoTable(doc, {
      startY: TOP,
      margin: { left: M, right: M, top: TOP, bottom: 16 },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 11, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 }, lineColor: LINE },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
      bodyStyles: { lineWidth: { bottom: 0.25 } },
      ...opts,
    });

  const card = (x: number, y: number, w: number, h: number, accent?: RGB) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
    if (accent) {
      doc.setFillColor(...accent);
      doc.rect(x, y, w, 1.6, "F");
    }
  };

  // 1. Sampul (sekali, memuat kartu index tiap segmen)
  slide("JOUMPA CSS SURVEY DASHBOARD", "Laporan survei kepuasan pelanggan");
  const dates = reports.flatMap((r) => r.responses.map((x) => x.date)).filter(Boolean).sort();
  let y = 48;
  if (dates.length) {
    y += tx(`Respons tanggal ${formatDate(dates[0], true)} sampai ${formatDate(dates[dates.length - 1], true)}`, M, y, 15, { color: INK2, maxW: 150 }) + 3;
  }
  for (const rep of reports) {
    y += tx(`${rep.meta.label}: ${rep.filterText}`, M, y, 11, { color: MUTED, maxW: 150, maxLines: 3 }) + 2;
  }
  tx(stamp, M, y + 2, 10, { color: MUTED });
  const cx = 178;
  const cardH = reports.length > 1 ? 52 : 70;
  reports.forEach((rep, i) => {
    const idx = rep.result.overall.index;
    const cat = categorize(idx);
    const cy = 40 + i * (cardH + 6);
    card(cx, cy, W - M - cx, cardH, cat ? TONE[cat.tone].text : undefined);
    tx(`${rep.meta.label} · ${rep.meta.audience}`, cx + 10, cy + 8, 13, { bold: true });
    tx(`${rep.responses.length} respons`, W - M - 10, cy + 9, 11, { color: MUTED, align: "right" });
    tx(formatIndex(idx), cx + 10, cy + 18, 36, { bold: true, color: cat ? TONE[cat.tone].text : INK });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    tx("/ 5,00", cx + 10 + doc.getTextWidth(t(formatIndex(idx))) + 4, cy + 30, 14, { color: MUTED });
    if (cat) {
      let px = cx + 10;
      px += pill(cat.label, px, cy + cardH - 14, cat.tone, 11) + 4;
      pill(cat.status, px, cy + cardH - 14, cat.tone, 10);
    }
  });
  tx(`Standar KPI ${formatIndex(KPI_TARGET)} pada skala 1 sampai 5`, cx, 40 + reports.length * (cardH + 6), 10, { color: MUTED });

  for (const rep of reports) {
    segLabel = rep.meta.label;

    if (!rep.responses.length) {
      slide("Tidak ada data", rep.filterText);
      tx("Tidak ada respons untuk pilihan ini.", M, TOP + 4, 14, { color: MUTED });
      continue;
    }

    if (has("ringkasan")) summarySlide(rep);
    if (has("bagian")) sectionsSlide(rep);
    if (has("prioritas")) prioritySlide(rep);
    if (has("tren")) trendSlide(rep);
    if (has("rincian")) detailSlides(rep);
    if (has("responden")) commentsSlide(rep);
  }

  segLabel = "";
  if (has("standar")) standardSlide();

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(t(stamp), M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));

  function summarySlide(rep: SegmentReport) {
    const { result, nps } = rep;
    const idx = result.overall.index;
    const cat = categorize(idx);
    const withData = result.sections.filter((s) => s.index !== null);
    const statements = result.sections.flatMap((s) => s.statements).filter((s) => s.index !== null);
    slide("Ringkasan", rep.filterText);

    const gap = 6;
    const tw = (CONTENT_W - gap * 4) / 5;
    const th = 62;
    const ty = 40;
    const tile = (i: number, label: string, value: string, note: string, tone?: StatusTone) => {
      const x = M + i * (tw + gap);
      card(x, ty, tw, th, tone ? TONE[tone].text : undefined);
      tx(label, x + 6, ty + 8, 10, { bold: true, color: MUTED, maxW: tw - 12 });
      tx(value, x + 6, ty + 20, 34, { bold: true, color: tone ? TONE[tone].text : INK, maxW: tw - 12 });
      tx(note, x + 6, ty + 42, 10, { color: INK2, maxW: tw - 12 });
    };
    tile(0, "INDEX KESELURUHAN", formatIndex(idx), `${cat?.label ?? "-"} · ${cat?.status ?? ""}`, cat?.tone);
    tile(1, "RESPONDEN", String(result.respondents), `${rep.meta.audience} yang mengisi survei`);
    const pass = withData.filter((s) => meetsKpi(s.index)).length;
    tile(2, "BAGIAN LOLOS KPI", `${pass}/${withData.length}`, `Bagian dengan index >= ${formatIndex(KPI_TARGET)}`, pass === withData.length ? "good" : "warning");
    const below = statements.filter((s) => !meetsKpi(s.index)).length;
    tile(3, "BUTIR DI BAWAH 4,50", `${below}/${statements.length}`, "Pernyataan yang belum mencapai standar", below === 0 ? "good" : "warning");
    tile(4, "NET PROMOTER SCORE", nps.score === null ? "-" : `${nps.score > 0 ? "+" : ""}${nps.score}`, nps.score === null ? "Belum ada jawaban" : `Dari ${nps.n} jawaban`);

    const gapIdx = idx === null ? "-" : `${idx - KPI_TARGET >= 0 ? "+" : "-"}${formatIndex(Math.abs(idx - KPI_TARGET))}`;
    tx(`Selisih terhadap standar ${formatIndex(KPI_TARGET)}: ${gapIdx}`, M, ty + th + 10, 12, { bold: true });
    if (nps.score !== null) {
      tx("Arti NPS", M, ty + th + 24, 11, { bold: true, color: MUTED });
      tx(
        `${nps.promoters} promotor (skor 9-10): sangat puas, mau merekomendasikan   |   ${nps.passives} pasif (skor 7-8): puas tapi biasa saja   |   ${nps.detractors} detraktor (skor 0-6): kurang puas, berisiko tidak merekomendasikan`,
        M,
        ty + th + 31,
        11,
        { color: INK2 },
      );
    }
  }

  function sectionsSlide(rep: SegmentReport) {
    slide("Index per bagian layanan", `Garis hitam adalah standar KPI ${formatIndex(KPI_TARGET)}. Batang dimulai dari 1,00.`);
    const rows = rep.result.sections;
    const labelW = 92;
    const bx = M + labelW + 4;
    const bw = 108;
    const idxX = bx + bw + 8;
    const catX = idxX + 22;
    const rowH = Math.min(17, (BOTTOM - TOP - 8) / Math.max(rows.length, 1));
    const pos = (v: number) => bx + ((Math.min(Math.max(v, 1), 5) - 1) / 4) * bw;

    for (let k = 1; k <= 5; k++) {
      tx(String(k), pos(k), TOP - 2, 9, { color: MUTED, align: "center" });
    }
    tx("4,5", pos(KPI_TARGET), TOP - 6, 9, { bold: true, align: "center" });
    rows.forEach((s, i) => {
      const y = TOP + 6 + i * rowH;
      const c = categorize(s.index);
      tx(`${s.code}. ${s.title}`, M, y + 1.5, 12, { bold: true, maxW: labelW, maxLines: 2 });
      doc.setFillColor(...SUNKEN);
      doc.roundedRect(bx, y + 1, bw, 6.5, 1, 1, "F");
      if (s.index !== null && c) {
        doc.setFillColor(...TONE[c.tone].text);
        doc.roundedRect(bx, y + 1, Math.max(pos(s.index) - bx, 1), 6.5, 1, 1, "F");
      }
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.5);
      doc.line(pos(KPI_TARGET), y - 0.5, pos(KPI_TARGET), y + 9);
      tx(formatIndex(s.index), idxX, y, 15, { bold: true });
      if (c) pill(c.label, catX, y + 0.5, c.tone, 10);
      tx(`${s.statements.length} butir · ${s.n} jawaban`, W - M, y + 2, 9.5, { color: MUTED, align: "right" });
    });
  }

  function prioritySlide(rep: SegmentReport) {
    const lowest = lowestStatements(rep.result);
    slide("Pernyataan dengan skor terendah", "Pernyataan yang belum mencapai 4,50, dari yang paling rendah.");
    if (!lowest.length) {
      tx("Semua pernyataan sudah mencapai standar KPI 4,50.", M, TOP + 4, 16, { bold: true, color: TONE.good.text });
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
        0: { cellWidth: 12 },
        2: { halign: "center", cellWidth: 24 },
        3: { halign: "center", cellWidth: 20 },
        4: { halign: "right", cellWidth: 26, fontStyle: "bold" },
        5: { halign: "right", cellWidth: 26 },
      },
    });
  }

  function trendSlide(rep: SegmentReport) {
    const points = rep.trend.filter((p) => p.index !== null);
    slide("Index per minggu", "Minggu dihitung Senin sampai Minggu berdasarkan tanggal pengisian.");
    if (!points.length) {
      tx("Belum ada data bertanggal.", M, TOP + 4, 14, { color: MUTED });
      return;
    }
    const values = points.map((p) => p.index as number);
    const lo = Math.max(1, Math.floor((Math.min(...values, KPI_TARGET) - 0.25) * 2) / 2);
    const hi = 5;
    const px = M + 18;
    const pw = CONTENT_W - 18 - 6;
    const py = TOP + 4;
    const ph = BOTTOM - py - 22;
    const yOf = (v: number) => py + ph - ((v - lo) / (hi - lo)) * ph;
    const xOf = (i: number) => (points.length === 1 ? px + pw / 2 : px + (i / (points.length - 1)) * pw);

    doc.setLineWidth(0.2);
    for (let v = lo; v <= hi + 1e-9; v += 0.5) {
      doc.setDrawColor(...LINE);
      doc.line(px, yOf(v), px + pw, yOf(v));
      tx(formatIndex(v), px - 3, yOf(v) - 1.7, 9.5, { color: MUTED, align: "right" });
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([2.5, 2], 0);
    doc.line(px, yOf(KPI_TARGET), px + pw, yOf(KPI_TARGET));
    doc.setLineDashPattern([], 0);
    tx(`Standar KPI ${formatIndex(KPI_TARGET)}`, px + pw, yOf(KPI_TARGET) - 6, 9.5, { bold: true, align: "right" });

    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.9);
    for (let i = 1; i < points.length; i++) {
      doc.line(xOf(i - 1), yOf(values[i - 1]), xOf(i), yOf(values[i]));
    }
    const every = Math.ceil(points.length / 14);
    points.forEach((p, i) => {
      const c = categorize(p.index);
      doc.setFillColor(...(c ? TONE[c.tone].text : MUTED));
      doc.circle(xOf(i), yOf(values[i]), 1.6, "F");
      tx(formatIndex(p.index), xOf(i), yOf(values[i]) - 7, 10, { bold: true, align: "center" });
      if (i % every === 0) {
        tx(formatDate(p.week), xOf(i), py + ph + 4, 9.5, { color: MUTED, align: "center" });
        tx(`${p.respondents} resp.`, xOf(i), py + ph + 10, 8.5, { color: MUTED, align: "center" });
      }
    });
  }

  function detailSlides(rep: SegmentReport) {
    for (const s of rep.result.sections) {
      const c = categorize(s.index);
      slide(`${s.code}. ${s.title}`, `Index ${formatIndex(s.index)} · ${c?.status ?? "belum ada data"} · jumlah responden per skor 1 sampai 5`);
      const body: RowInput[] = s.statements.map((st) => {
        const sc = categorize(st.index);
        return [
          String(st.no),
          t(st.text),
          ...st.counts.map(String),
          String(st.n),
          formatIndex(st.index),
          sc ? { content: sc.label, styles: { textColor: TONE[sc.tone].text, fontStyle: "bold" } } : "-",
        ];
      });
      table({
        head: [["No", "Pernyataan", "1", "2", "3", "4", "5", "n", "Index", "Kategori"]],
        body,
        styles: { fontSize: s.statements.length > 8 ? 9.5 : s.statements.length > 6 ? 10.5 : 12.5, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 } },
        columnStyles: {
          0: { cellWidth: 11 },
          2: { halign: "center", cellWidth: 14 },
          3: { halign: "center", cellWidth: 14 },
          4: { halign: "center", cellWidth: 14 },
          5: { halign: "center", cellWidth: 14 },
          6: { halign: "center", cellWidth: 14 },
          7: { halign: "center", cellWidth: 16 },
          8: { halign: "right", cellWidth: 20, fontStyle: "bold" },
          9: { cellWidth: 38 },
        },
      });
    }
  }

  function commentsSlide(rep: SegmentReport) {
    const groups: [string, ReturnType<typeof pickComments>][] = [
      ["Perlu diperbaiki", pickComments(rep.responses, "improve")],
      ["Paling berkesan", pickComments(rep.responses, "best")],
      ["Saran lainnya", pickComments(rep.responses, "suggestion")],
    ];
    if (groups.every(([, items]) => !items.length)) return;
    slide("Voice of Customer", "Respondent Customer Feedback: jawaban tertulis terbaru.");
    const gap = 8;
    const cw = (CONTENT_W - gap * 2) / 3;
    groups.forEach(([title, items], g) => {
      const x = M + g * (cw + gap);
      doc.setFillColor(...INK);
      doc.roundedRect(x, TOP, cw, 9, 1.5, 1.5, "F");
      tx(`${title} (${items.length})`, x + 4, TOP + 2, 11, { bold: true, color: [255, 255, 255] });
      let y = TOP + 14;
      for (const { r, text } of items) {
        const quote = `"${text.replace(/\s+/g, " ")}"`;
        const lines = Math.min(4, (doc.splitTextToSize(t(quote), cw - 6) as string[]).length);
        const h = lines * 10.5 * 0.3528 * 1.25 + 9;
        if (y + h > BOTTOM) break;
        const used = tx(quote, x + 3, y, 10.5, { maxW: cw - 6, maxLines: 4 });
        tx(`${r.date ? formatDate(r.date) : "-"}${r.station ? ` · ${r.station}` : ""}${r.institution ? ` · ${r.institution}` : ""}`, x + 3, y + used + 1, 8.5, { color: MUTED, maxW: cw - 6, maxLines: 1 });
        y += h + 2;
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.2);
        doc.line(x, y - 1.5, x + cw, y - 1.5);
      }
      if (!items.length) tx("Belum ada jawaban.", x + 3, y, 10.5, { color: MUTED });
    });
  }

  function standardSlide() {
    slide("Standar KPI dan cara menghitung index", `Standar minimum index kepuasan JOUMPA adalah ${formatIndex(KPI_TARGET)} pada skala Likert 1 sampai 5, berlaku untuk B2C dan B2B.`);
    table({
      head: [["Rentang index", "Kategori", "Status"]],
      body: CATEGORIES.map((c) => [
        t(c.range),
        c.label,
        status(c.tone, c.tone === "warning" ? "Perlu Peningkatan / Belum Memenuhi Standar" : c.status),
      ]),
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 70 } },
    });
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    let y = finalY + 8;
    for (const line of [
      "Index (1-5) = Total skor / Skor maksimum x 5",
      "Total skor adalah jumlah semua skor 1 sampai 5 yang diberikan responden. Skor maksimum adalah jumlah jawaban dikali 5.",
      "Pertanyaan yang tidak dijawab tidak ikut dihitung. Index dibulatkan 2 desimal sebelum kategorinya ditentukan.",
    ]) {
      y += tx(line, M, y, 11, { color: INK2 }) + 2;
    }
  }
}
