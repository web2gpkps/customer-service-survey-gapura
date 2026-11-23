"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Mail, MessageCircle, Share2, Trash2, Unlink } from "lucide-react";
import { createReportLink, deleteInactiveReportLinks, deleteReportLink, listReportLinks, revokeReportLink } from "@/app/actions";
import { applyFilters, scopeToSearch, type ReportScope } from "@/lib/filters";
import type { ShareLink } from "@/lib/share-store";
import type { DashboardData } from "@/lib/sheets";
import { SEGMENT_META } from "@/lib/survey-config";
import { Modal, ScopePicker, useScopeState } from "./ScopePicker";
import { formatDateTime } from "./ui";

const DURATIONS = [
  { days: 7, label: "7 hari" },
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
  { days: 0, label: "Tanpa batas" },
];

export function ShareDialog({
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
  const [days, setDays] = useState(30);
  const [origin, setOrigin] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [created, setCreated] = useState("");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === "function");
  }, []);
  useEffect(() => {
    if (open) listReportLinks().then(setLinks).catch(() => {});
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setLinks(await listReportLinks());
    } catch {
      setError("Gagal memproses link. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const url = created ? `${origin}/p/${created}` : "";
  const title = `JOUMPA CSS Survey ${scope.segments.map((s) => SEGMENT_META[s].label).join(" & ")}`;
  const message = `${title}: index kepuasan pelanggan terbaru.\n${url}`;
  const empty = scope.segments.every((s) => applyFilters(data.segments[s].responses, scope.filters[s]).length === 0);

  const writeClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      (document.getElementById("share-url") as HTMLInputElement | null)?.select();
      document.execCommand("copy");
    }
  };
  const copy = async () => {
    await writeClipboard(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const copyLink = async (code: string) => {
    await writeClipboard(`${origin}/p/${code}`);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode(""), 2000);
  };
  const isDead = (l: ShareLink) => !!l.revokedAt || (!!l.expiresAt && Date.parse(l.expiresAt) <= Date.now());
  const inactiveCount = links.filter(isDead).length;
  const actionClass =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-3.5 text-sm font-semibold hover:border-ink-2";
  const off = url ? "" : "pointer-events-none opacity-50";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bagikan laporan"
      description="Pilih data yang mau dibagikan lalu buat link. Cakupan data dikunci di server dan tidak bisa diubah penerima. Link bisa diputus dan punya masa berlaku. Angkanya ikut berubah saat Google Sheets diperbarui."
      footer={
        <div className="grid gap-3">
          <div className="flex gap-2">
            <input
              id="share-url"
              readOnly
              value={url}
              placeholder="Pilih data dan masa berlaku lalu klik Buat link"
              aria-label="Link laporan"
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 font-mono text-xs text-ink-2"
            />
            <button
              onClick={url ? copy : () => run(async () => setCreated((await createReportLink(scopeToSearch(scope), days)).code))}
              disabled={busy || (!url && empty)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-2 disabled:opacity-60"
            >
              {url ? copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
              {url ? (copied ? "Tersalin" : "Salin") : busy ? "Membuat…" : "Buat link"}
            </button>
          </div>
          {error && <p className="text-xs font-semibold text-crit">{error}</p>}
          {empty && <p className="text-xs font-semibold text-crit">Pilihan ini tidak punya respons sama sekali.</p>}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a href={url ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} aria-disabled={!url} target="_blank" rel="noopener noreferrer" className={`${actionClass} ${off}`}>
              <MessageCircle aria-hidden className="size-4" /> WhatsApp
            </a>
            <a href={url ? `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}` : undefined} aria-disabled={!url} className={`${actionClass} ${off}`}>
              <Mail aria-hidden className="size-4" /> Email
            </a>
            {canNativeShare && url && (
              <button onClick={() => navigator.share({ title, url }).catch(() => {})} className={actionClass}>
                <Share2 aria-hidden className="size-4" /> Aplikasi lain
              </button>
            )}
            <a
              href={url || undefined}
              aria-disabled={!url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-brand hover:bg-brand-wash sm:ml-auto ${off}`}
            >
              Buka laporan <ExternalLink aria-hidden className="size-4" />
            </a>
          </div>
        </div>
      }
    >
      <ScopePicker data={data} value={scope} onChange={(s) => { setScope(s); setCreated(""); }} />
      <fieldset className="mt-5 grid gap-2">
        <legend className="eyebrow">Masa berlaku link</legend>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.days}
              aria-pressed={days === d.days}
              onClick={() => { setDays(d.days); setCreated(""); }}
              className={`min-h-11 rounded-lg border px-3.5 text-sm font-semibold ${days === d.days ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink hover:border-ink-2"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>
      <section className="mt-5 grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Link laporan yang pernah dibuat</p>
          {inactiveCount > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`Hapus ${inactiveCount} link yang sudah tidak aktif dari daftar?`)) run(async () => void (await deleteInactiveReportLinks()));
              }}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs font-semibold text-crit hover:border-crit disabled:opacity-60"
            >
              <Trash2 aria-hidden className="size-3.5" /> Hapus semua yang tidak aktif ({inactiveCount})
            </button>
          )}
        </div>
        {links.length === 0 && <p className="text-sm text-muted">Belum ada link.</p>}
        <ul className="grid gap-2">
          {links.map((l) => {
            const expired = !!l.expiresAt && Date.parse(l.expiresAt) <= Date.now();
            const dead = isDead(l);
            const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs font-semibold disabled:opacity-60";
            return (
              <li key={l.code} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className={`truncate font-mono text-xs ${dead ? "text-muted line-through" : "text-ink"}`}>/p/{l.code}</p>
                  <p className="text-xs text-muted">
                    Dibuat {formatDateTime(l.createdAt)} · {l.expiresAt ? `${expired ? "kedaluwarsa" : "berlaku sampai"} ${formatDateTime(l.expiresAt)}` : "tanpa batas waktu"}
                    {l.revokedAt ? " · diputus" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!dead && (
                    <button onClick={() => copyLink(l.code)} className={`${btn} text-ink hover:border-ink-2`}>
                      {copiedCode === l.code ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />} {copiedCode === l.code ? "Tersalin" : "Salin link"}
                    </button>
                  )}
                  {!dead && (
                    <button onClick={() => run(async () => void (await revokeReportLink(l.code)))} disabled={busy} className={`${btn} text-crit hover:border-crit`}>
                      <Unlink aria-hidden className="size-3.5" /> Putus
                    </button>
                  )}
                  {dead && (
                    <button onClick={() => run(async () => void (await deleteReportLink(l.code)))} disabled={busy} className={`${btn} text-crit hover:border-crit`}>
                      <Trash2 aria-hidden className="size-3.5" /> Hapus
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </Modal>
  );
}
