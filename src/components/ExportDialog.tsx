"use client";

import { FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { exportUrl, type ReportScope } from "@/lib/filters";
import type { DashboardData } from "@/lib/sheets";
import { Modal, ScopePicker, useScopeState } from "./ScopePicker";

export function ExportDialog({
  open,
  onClose,
  data,
  initialScope,
}: {
  open: boolean;
  onClose: () => void;
  data: DashboardData;
  initialScope: () => ReportScope;
}) {
  const [scope, setScope] = useScopeState(open, initialScope);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export data"
      description="File dibuat dari data Google Sheets terbaru sesuai pilihan di bawah."
      footer={<ExportButtons scope={scope} />}
    >
      <ScopePicker
        data={data}
        value={scope}
        onChange={setScope}
        contentNote="Pilihan konten berlaku untuk PDF. Excel selalu berisi salinan sheet Tally dan rekap lengkapnya."
      />
    </Modal>
  );
}

export function ExportButtons({ scope, compact = false }: { scope: ReportScope; compact?: boolean }) {
  const cls = compact
    ? "flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm font-semibold text-ink hover:bg-sunken"
    : "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:border-ink-2";
  return (
    <div className={compact ? "grid" : "flex flex-col gap-2 sm:flex-row"}>
      <a href={exportUrl(scope, "pdf")} download className={cls}>
        <FileText aria-hidden className="size-4 text-crit" />
        <span>
          PDF
          <span className="ml-1.5 font-normal text-muted">laporan A4</span>
        </span>
      </a>
      <a href={exportUrl(scope, "pdf-slide")} download className={cls}>
        <Presentation aria-hidden className="size-4 text-crit" />
        <span>
          PDF
          <span className="ml-1.5 font-normal text-muted">landscape 16:9</span>
        </span>
      </a>
      <a href={exportUrl(scope, "xlsx")} download className={cls}>
        <FileSpreadsheet aria-hidden className="size-4 text-good" />
        <span>
          Excel
          <span className="ml-1.5 font-normal text-muted">sheet Tally + rekap</span>
        </span>
      </a>
    </div>
  );
}
