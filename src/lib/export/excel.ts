import ExcelJS from "exceljs";
import type { ReportScope } from "../filters";
import { formatDateTime } from "../format";
import { buildSegmentReport } from "../report";
import { CATEGORIES, KPI_TARGET, categorize, round2, type Tally } from "../scoring";
import type { ServerDashboardData, ServerSegmentData } from "../sheets";

const FONT = "Arial";
const INK = "FF15191D";
const MUTED = "FF646A71";
const SUNKEN = "FFF3F2EE";
const BRAND_WASH = "FFE8F4ED";
const STATUS_FILL = { good: "FFE6F4EA", warning: "FFFDF1D8", critical: "FFFDECEB" } as const;
const STATUS_TEXT = { good: "FF0B7A3B", warning: "FF8A5300", critical: "FFB42318" } as const;

/** Header kolom berisi data pribadi responden. Sengaja tidak mencakup "Telepon" agar kolom kanal tidak ikut terhapus. */
const PERSONAL_DATA_HEADER = /nama penumpang|nomor\s*hp|\bno\.?\s*hp\b|whatsapp|^\d+\.\s*(alamat\s*)?e-?mail\b/i;

/** 0 → "A", 26 → "AA". */
function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sel teks yang isinya angka murni disimpan sebagai angka, seperti di Google Sheets. */
function cellValue(raw: string | undefined): string | number | null {
  if (raw === undefined || raw === "") return null;
  if (/^-?\d{1,10}(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

export async function buildExcel(data: ServerDashboardData, scope: ReportScope): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JOUMPA CSS Survey Dashboard";
  wb.created = new Date(data.fetchedAt);

  // 1. Salinan sheet Tally (header & urutan kolom sama persis, baris sesuai filter)
  const tallyRowCount = new Map<string, number>();
  for (const seg of scope.segments) {
    const segment = data.segments[seg];
    const report = buildSegmentReport(data, seg, scope.filters[seg]);
    const ws = wb.addWorksheet(segment.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
    // Kolom data pribadi (nama, no. HP, email) dikosongkan; posisi kolom tetap agar rumus rekap valid.
    const personal = segment.headers.map((h) => PERSONAL_DATA_HEADER.test(h));
    ws.addRow(segment.headers.map((h, c) => (personal[c] ? "[data pribadi tidak diekspor]" : h)));
    const rows = report.responses.map((r) => r.rowIndex).sort((a, b) => a - b);
    for (const i of rows) {
      const raw = segment.rows[i] ?? [];
      ws.addRow(segment.headers.map((_, c) => (personal[c] ? null : cellValue(raw[c]?.trim() ? raw[c] : undefined))));
    }
    ws.columns.forEach((col, i) => {
      col.width = Math.min(40, Math.max(12, (segment.headers[i] ?? "").length > 60 ? 28 : 16));
      col.font = { name: FONT, size: 10 };
    });
    ws.getRow(1).font = { name: FONT, size: 10, bold: true };
    ws.getRow(1).alignment = { wrapText: true, vertical: "top" };
    tallyRowCount.set(seg, rows.length);
  }

  // 2. Rekap dengan rumus yang membaca sheet Tally di atas
  for (const seg of scope.segments) {
    addRecapSheet(wb, data.segments[seg], data, scope, seg, tallyRowCount.get(seg) ?? 0);
  }

  // 3. Standar KPI
  addStandardSheet(wb);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addRecapSheet(
  wb: ExcelJS.Workbook,
  segment: ServerSegmentData,
  data: ServerDashboardData,
  scope: ReportScope,
  seg: ReportScope["segments"][number],
  rowCount: number,
) {
  const report = buildSegmentReport(data, seg, scope.filters[seg]);
  const { meta, result } = report;
  const ws = wb.addWorksheet(`Rekap ${meta.label}`, { views: [{ state: "frozen", ySplit: 10 }] });
  ws.properties.defaultRowHeight = 16;
  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 70 },
    ...Array.from({ length: 5 }, () => ({ width: 6 })),
    { width: 7 },
    { width: 10 },
    { width: 12 },
    { width: 11 },
    { width: 18 },
    { width: 24 },
  ];

  const src = quoteSheet(segment.sheet);
  const last = Math.max(2, rowCount + 1);
  const range = (col: number) => `${src}!$${colLetter(col)}$2:$${colLetter(col)}$${last}`;

  const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...extra });

  ws.getCell("A1").value = `REKAP INDEX KEPUASAN ${meta.label} (${meta.audience.toUpperCase()})`;
  ws.getCell("A1").font = font({ size: 14, bold: true });
  ws.getCell("A2").value =
    `Dihitung dengan rumus dari sheet "${segment.sheet}" di file ini. Filter: ${report.filterText}. ` +
    `Data Google Sheets per ${formatDateTime(data.fetchedAt)}.`;
  ws.getCell("A2").font = font({ color: { argb: MUTED } });

  // Ringkasan (B4 = standar KPI, dipakai semua rumus kategori/status)
  const kpiCell = "$C$4";
  const summary: [string, ExcelJS.CellValue, string?][] = [
    ["Standar KPI", KPI_TARGET, "0.00"],
    ["Index keseluruhan", null, "0.00"],
    ["Kategori", null],
    ["Status", null],
    ["Jumlah responden", { formula: `COUNTA(${src}!$A$2:$A$${last})`, result: rowCount }],
  ];
  summary.forEach(([label, value, fmt], i) => {
    const r = 4 + i;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = font({ bold: true });
    const cell = ws.getCell(`C${r}`);
    cell.value = value;
    cell.font = font({ bold: true });
    cell.alignment = { horizontal: "left" };
    if (fmt) cell.numFmt = fmt;
  });
  ws.getCell("C4").font = font({ bold: true, color: { argb: "FF0000FF" } });
  ws.getCell("C4").note = "Standar minimum index kepuasan JOUMPA (skala 1-5), ditetapkan manajemen. Ubah angka ini bila standar berubah.";

  // Header tabel
  const HEAD = 10;
  const headers = ["No", "Bagian", "Pernyataan", "1", "2", "3", "4", "5", "n", "Total Skor", "Skor Maksimum", "Index (1-5)", "Kategori", "Status KPI"];
  ws.getRow(HEAD).values = headers;
  ws.getRow(HEAD).eachCell((c) => {
    c.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(HEAD).height = 28;

  const categoryFormula = (r: number) =>
    `IF(L${r}="","",IF(ROUND(L${r},2)<=1,"Sangat Tidak Puas",IF(ROUND(L${r},2)<=2,"Tidak Puas",` +
    `IF(ROUND(L${r},2)<=3,"Cukup / Netral",IF(ROUND(L${r},2)<${kpiCell},"Puas","Sangat Puas")))))`;
  const statusFormula = (r: number) =>
    `IF(L${r}="","",IF(ROUND(L${r},2)>=${kpiCell},"Memenuhi Standar KPI",` +
    `IF(ROUND(L${r},2)>3,"Perlu Peningkatan","Belum Memenuhi Standar")))`;

  const writeCalcCells = (r: number, t: Tally) => {
    const cat = categorize(t.index);
    ws.getCell(`I${r}`).value = { formula: `SUM(D${r}:H${r})`, result: t.n };
    ws.getCell(`J${r}`).value = { formula: `D${r}*1+E${r}*2+F${r}*3+G${r}*4+H${r}*5`, result: t.total };
    ws.getCell(`K${r}`).value = { formula: `I${r}*5`, result: t.max };
    ws.getCell(`L${r}`).value = {
      formula: `IFERROR(J${r}/K${r}*5,"")`,
      result: t.index === null ? "" : t.index,
    };
    ws.getCell(`L${r}`).numFmt = "0.00";
    ws.getCell(`M${r}`).value = { formula: categoryFormula(r), result: cat?.label ?? "" };
    ws.getCell(`N${r}`).value = { formula: statusFormula(r), result: cat?.status ?? "" };
  };

  let r = HEAD + 1;
  let statementIndex = 0;
  const subtotalRows: number[] = [];

  for (const sec of result.sections) {
    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = `${sec.code}. ${sec.title}`;
    ws.getCell(`A${r}`).font = font({ bold: true });
    ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUNKEN } };
    r++;
    const first = r;
    for (const st of sec.statements) {
      const cols = segment.statementCols[statementIndex++] ?? [];
      ws.getCell(`A${r}`).value = st.no;
      ws.getCell(`B${r}`).value = sec.code;
      ws.getCell(`C${r}`).value = st.text;
      for (let k = 1; k <= 5; k++) {
        // Ambil kolom pertama yang terisi (form B2B punya dua kolom untuk satu pernyataan)
        const terms = cols.map((c, j) => {
          const blanks = cols.slice(0, j).map((p) => `(${range(p)}="")*`).join("");
          return `${blanks}(LEFT(${range(c)},1)="${k}")`;
        });
        ws.getCell(r, 3 + k).value = cols.length
          ? { formula: `SUMPRODUCT(${terms.join("+")})`, result: st.counts[k - 1] }
          : 0;
      }
      writeCalcCells(r, st);
      r++;
    }
    const lastStatement = r - 1;
    ws.getCell(`A${r}`).value = `Subtotal ${sec.code}. ${sec.title}`;
    ws.mergeCells(`A${r}:C${r}`);
    for (let k = 0; k < 5; k++) {
      const col = colLetter(3 + k);
      ws.getCell(`${col}${r}`).value = {
        formula: `SUM(${col}${first}:${col}${lastStatement})`,
        result: sec.counts[k],
      };
    }
    writeCalcCells(r, sec);
    ws.getRow(r).font = font({ bold: true });
    subtotalRows.push(r);
    r += 2;
  }

  // Index keseluruhan = gabungan semua subtotal
  const overall = r;
  ws.getCell(`A${overall}`).value = "INDEX KESELURUHAN";
  ws.mergeCells(`A${overall}:C${overall}`);
  for (let k = 0; k < 5; k++) {
    const col = colLetter(3 + k);
    ws.getCell(`${col}${overall}`).value = {
      formula: subtotalRows.map((sr) => `${col}${sr}`).join("+") || "0",
      result: result.overall.counts[k],
    };
  }
  writeCalcCells(overall, result.overall);
  ws.getRow(overall).font = font({ bold: true });
  ws.getRow(overall).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_WASH } }));

  const overallCat = categorize(result.overall.index);
  ws.getCell("C5").value = {
    formula: `L${overall}`,
    result: result.overall.index === null ? "" : round2(result.overall.index),
  };
  ws.getCell("C6").value = { formula: `M${overall}`, result: overallCat?.label ?? "" };
  ws.getCell("C7").value = { formula: `N${overall}`, result: overallCat?.status ?? "" };

  // Font, perataan, dan pewarnaan status
  for (let row = HEAD + 1; row <= overall; row++) {
    ws.getRow(row).eachCell({ includeEmpty: false }, (c) => {
      c.font = { ...font(), ...c.font, name: FONT, size: 10 };
      if (Number(c.col) >= 4) c.alignment = { horizontal: Number(c.col) >= 13 ? "left" : "center", vertical: "middle" };
    });
    ws.getCell(`C${row}`).alignment = { wrapText: true, vertical: "middle" };
  }
  const statusRef = `N${HEAD + 1}:N${overall}`;
  ws.addConditionalFormatting({
    ref: `${statusRef} C7`,
    rules: (["good", "warning", "critical"] as const).map((tone, priority) => ({
      type: "containsText",
      operator: "containsText",
      text: { good: "Memenuhi Standar KPI", warning: "Perlu Peningkatan", critical: "Belum Memenuhi" }[tone],
      priority: priority + 1,
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: STATUS_FILL[tone] } },
        font: { color: { argb: STATUS_TEXT[tone] }, bold: true },
      },
    })),
  });

  ws.getCell(`A${overall + 2}`).value =
    "Catatan: skor 1-5 dihitung dari karakter pertama sel di sheet Tally (contoh \"5 SP\" = 5). " +
    "Sel kosong tidak dihitung. Kategori dan status memakai index yang dibulatkan 2 desimal dan standar KPI di sel C4.";
  ws.getCell(`A${overall + 2}`).font = font({ italic: true, color: { argb: MUTED } });
}

function addStandardSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Standar KPI");
  ws.columns = [{ width: 18 }, { width: 22 }, { width: 44 }];
  const f = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...extra });

  ws.getCell("A1").value = "STANDAR INDEX KEPUASAN JOUMPA";
  ws.getCell("A1").font = f({ size: 14, bold: true });
  ws.getCell("A2").value = "Standar minimum index kepuasan ditetapkan 4,50 pada skala Likert 1-5, berlaku untuk B2C dan B2B.";
  ws.getCell("A2").font = f({ color: { argb: MUTED } });

  ws.getRow(4).values = ["Rentang Index", "Kategori", "Status"];
  ws.getRow(4).eachCell((c) => {
    c.font = f({ bold: true, color: { argb: "FFFFFFFF" } });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  });
  CATEGORIES.forEach((c, i) => {
    const row = ws.getRow(5 + i);
    row.values = [
      c.range,
      c.label,
      c.tone === "warning" ? "Perlu Peningkatan / Belum Memenuhi Standar" : c.status,
    ];
    row.eachCell((cell) => (cell.font = f()));
    row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[c.tone] } };
    row.getCell(3).font = f({ bold: true, color: { argb: STATUS_TEXT[c.tone] } });
  });

  const notes = [
    "Cara menghitung",
    "Index (1-5) = Total Skor / Skor Maksimum x 5",
    "Total Skor = jumlah (jumlah responden x skor 1-5)",
    "Skor Maksimum = jumlah jawaban x 5",
    "Index bagian dan index keseluruhan memakai total skor semua pernyataan di dalamnya.",
  ];
  notes.forEach((t, i) => {
    ws.getCell(`A${12 + i}`).value = t;
    ws.getCell(`A${12 + i}`).font = f({ bold: i === 0 });
  });
}
