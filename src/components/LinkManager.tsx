"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Link2, Power, PowerOff } from "lucide-react";
import { buatLink, ubahLink, type LinkResult } from "@/app/akses/actions";
import { linkState, type LinkState, type ShareLink } from "@/lib/share-link-types";
import { Modal } from "./ScopePicker";
import { formatDateTime, stationLabel } from "./ui";

const DURATIONS = [
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
  { value: "90", label: "90 hari" },
  { value: "none", label: "Tanpa batas" },
] as const;

const STATE_STYLE: Record<LinkState, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-good-wash text-good" },
  expired: { label: "Kedaluwarsa", cls: "bg-warn-wash text-warn" },
  disabled: { label: "Dimatikan", cls: "bg-crit-wash text-crit" },
};

const toDays = (v: string) => (v === "none" ? null : Number(v));

export function LinkManager({
  open,
  onClose,
  initialLinks,
  stations,
  airports,
}: {
  open: boolean;
  onClose: () => void;
  initialLinks: ShareLink[];
  stations: string[];
  airports: Record<string, string>;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [station, setStation] = useState(stations[0] ?? "");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<string>("30");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, startTransition] = useTransition();

  useEffect(() => setOrigin(window.location.origin), []);

  const run = (task: () => Promise<LinkResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setLinks(result.links);
        setError("");
        after?.();
      } else {
        setError(result.error);
      }
    });

  const urlOf = (l: ShareLink) => `${origin}/akses/${l.token}`;

  const copy = async (l: ShareLink) => {
    try {
      await navigator.clipboard.writeText(urlOf(l));
    } catch {
      const el = document.getElementById(`link-${l.token}`) as HTMLInputElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(l.token);
    window.setTimeout(() => setCopied((c) => (c === l.token ? "" : c)), 2000);
  };

  const fieldCls = "min-h-10 w-full rounded-lg border border-line-strong bg-card px-3 text-sm";

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Kelola link akses cabang"
      description="Tiap link hanya membuka dashboard satu cabang. Pemegang link tidak bisa membuka halaman utama, export, atau cabang lain."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (station) run(() => buatLink({ station, label, days: toDays(days) }), () => setLabel(""));
        }}
        className="grid gap-3 rounded-xl border border-line bg-sunken p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_auto] sm:items-end"
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">Cabang</span>
          <select value={station} onChange={(e) => setStation(e.target.value)} className="select" required>
            {stations.map((s) => (
              <option key={s} value={s}>
                {stationLabel(s, airports)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="eyebrow">Label (opsional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="mis. Kepala cabang"
            className={fieldCls}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="eyebrow">Berlaku</span>
          <select value={days} onChange={(e) => setDays(e.target.value)} className="select">
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !station}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          <Link2 aria-hidden className="size-4" />
          Buat link
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-crit-wash px-3 py-2 text-sm font-semibold text-crit">
          {error}
        </p>
      )}

      <h3 className="eyebrow mt-6 mb-2">Link yang sudah dibuat ({links.length})</h3>
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          Belum ada link. Pilih cabang di atas lalu klik Buat link.
        </p>
      ) : (
        <ul className="grid gap-3">
          {links.map((l) => {
            const state = linkState(l);
            const style = STATE_STYLE[state];
            return (
              <li key={l.token} className="rounded-xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-bold text-ink">{stationLabel(l.station, airports)}</span>
                  {l.label && <span className="text-sm text-ink-2">· {l.label}</span>}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.cls}`}>{style.label}</span>
                  <span className="text-xs text-muted sm:ml-auto">
                    {l.expiresAt ? `Berlaku sampai ${formatDateTime(l.expiresAt)}` : "Tanpa batas waktu"}
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    id={`link-${l.token}`}
                    readOnly
                    value={urlOf(l)}
                    aria-label={`Link ${l.station}`}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-sunken px-3 font-mono text-xs text-ink-2"
                  />
                  <button
                    onClick={() => copy(l)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-semibold text-white hover:bg-ink-2"
                  >
                    {copied === l.token ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                    {copied === l.token ? "Tersalin" : "Salin"}
                  </button>
                  <a
                    href={urlOf(l)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Buka link di tab baru"
                    className="grid min-h-10 w-10 shrink-0 place-items-center rounded-lg border border-line-strong text-ink-2 hover:border-ink-2"
                  >
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={() => run(() => ubahLink(l.token, { active: !l.active }))}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-60 ${
                      l.active
                        ? "border-crit/40 text-crit hover:bg-crit-wash"
                        : "border-brand/40 text-brand hover:bg-brand-wash"
                    }`}
                  >
                    {l.active ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}
                    {l.active ? "Matikan link" : "Aktifkan lagi"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Atur masa berlaku
                    <select
                      disabled={busy}
                      value=""
                      onChange={(e) => e.target.value && run(() => ubahLink(l.token, { extendDays: toDays(e.target.value) }))}
                      className="select !min-h-9 !w-auto !py-1 text-xs"
                      aria-label={`Atur masa berlaku link ${l.station}`}
                    >
                      <option value="">Mulai dari sekarang…</option>
                      {DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="ml-auto text-xs text-muted">Dibuat {formatDateTime(l.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">
        Link yang dimatikan atau kedaluwarsa berhenti bekerja dalam hitungan detik. Siapa pun yang punya link bisa membukanya, jadi bagikan hanya ke
        orang cabang yang bersangkutan.
      </p>
    </Modal>
  );
}
