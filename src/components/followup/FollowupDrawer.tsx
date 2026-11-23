"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CircleCheck,
  FileImage,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  LoaderCircle,
  Paperclip,
  Presentation,
  Phone,
  TriangleAlert,
  X,
} from "lucide-react";
import { getItemDetail, promoteResponse, updateFollowupItem, type ItemDetail } from "@/app/tindak-lanjut/actions";
import {
  CLASSES,
  PRIORITIES,
  STATUSES,
  canEdit,
  categoriesFor,
  parseEvidence,
  type AppreciationItem,
  type FollowupItem,
  type Role,
  type Status,
} from "@/lib/followup/types";
import {
  ALL_EVIDENCE_EXTS,
  EVIDENCE_GROUPS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_TITLE_MAX,
  acceptFor,
  extOf,
  formatBytes,
  groupOfExt,
  type EvidenceGroup,
} from "@/lib/followup/evidence-shared";
import { formatDate } from "@/lib/format";
import { PRIORITY_TONE, STATUS_TONE, daysUntil, formatIdx, isClosed } from "./shared";

export type Selection =
  | { kind: "item"; item: FollowupItem }
  | { kind: "apresiasi"; item: AppreciationItem };

interface Draft {
  status: Status;
  pic: string;
  action: string;
  target: string;
  done: string;
  contacted: boolean;
  klass: string;
  priority: string;
  category: string;
}

const draftOf = (i: FollowupItem): Draft => ({
  status: i.status,
  pic: i.pic,
  action: i.action,
  target: i.target,
  done: i.done,
  contacted: i.contacted,
  klass: i.klass,
  priority: i.priority,
  category: i.category,
});

interface Staged {
  key: string;
  file: File;
  title: string;
  error?: string; // alasan gagal pada percobaan terakhir
}

type Popup =
  | { kind: "ok"; title: string; text: string }
  | { kind: "gagal"; text: string; reasons: string[] };

const FIELD = "min-h-10 w-full rounded-lg border border-line-strong bg-card px-3 text-sm text-ink";
const GROUP_ICON: Record<EvidenceGroup, typeof FileText> = { dokumen: FileText, gambar: FileImage, ppt: Presentation, excel: FileSpreadsheet };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FollowupDrawer({
  selection,
  role,
  onClose,
  onSaved,
  onPromoted,
}: {
  selection: Selection;
  role: Role;
  onClose: () => void;
  onSaved: (item: FollowupItem) => void;
  onPromoted: () => void;
}) {
  const editable = canEdit(role);
  const isItem = selection.kind === "item";
  const item = isItem ? selection.item : null;
  const segment = selection.item.segment;
  const responseId = selection.item.responseId;
  const itemId = item?.id ?? "";

  const [detail, setDetail] = useState<ItemDetail | null | "loading">("loading");
  const [draft, setDraft] = useState<Draft | null>(item ? draftOf(item) : null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [promoteClass, setPromoteClass] = useState<string>("Saran Perbaikan");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading">("idle");
  const [popup, setPopup] = useState<Popup | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const popupOpen = useRef(false);
  popupOpen.current = popup !== null;
  const itemRef = useRef(item);
  itemRef.current = item;

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Saat popup terbuka, Esc tidak menutup apa pun: pengguna harus memakai tombol di popup.
      if (e.key === "Escape" && !popupOpen.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (popup?.kind === "ok") okRef.current?.focus();
  }, [popup]);

  useEffect(() => {
    let alive = true;
    setDetail("loading");
    getItemDetail(segment, responseId, itemId).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [segment, responseId, itemId]);

  // Item di daftar berubah (polling atau disimpan): formulir mengikuti bila belum ada ketikan yang belum disimpan.
  const baseline = item ? JSON.stringify(draftOf(item)) : "";
  const lastBaseline = useRef(baseline);
  useEffect(() => {
    if (!item || baseline === lastBaseline.current) return;
    setDraft((d) => (d && JSON.stringify(d) !== lastBaseline.current ? d : draftOf(item)));
    lastBaseline.current = baseline;
  }, [baseline, item]);

  const dirty = item && draft ? JSON.stringify(draft) !== baseline : false;
  const busy = phase !== "idle" || pending;
  const canSave = (dirty || staged.length > 0) && !busy;

  /* ── evidence: pilih berkas ── */
  const pickFiles = (files: FileList | null, group: EvidenceGroup) => {
    if (!files?.length) return;
    const notes: string[] = [];
    const next: Staged[] = [];
    for (const file of Array.from(files)) {
      const ext = extOf(file.name);
      if (!ALL_EVIDENCE_EXTS.includes(ext) || groupOfExt(ext) !== group) notes.push(`${file.name}: jenis berkas tidak sesuai pilihan ${EVIDENCE_GROUPS[group].label}.`);
      else if (file.size > EVIDENCE_MAX_BYTES) notes.push(`${file.name}: ukuran melebihi ${formatBytes(EVIDENCE_MAX_BYTES)}.`);
      else if (file.size === 0) notes.push(`${file.name}: berkas kosong.`);
      else next.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, title: "" });
    }
    const room = EVIDENCE_MAX_FILES - staged.length;
    if (next.length > room) notes.push(`Maksimal ${EVIDENCE_MAX_FILES} berkas sekali simpan.`);
    setStaged((cur) => [...cur, ...next.slice(0, Math.max(0, room))]);
    setMessage(notes.length ? notes.join(" ") : null);
    setEvidenceOpen(true);
  };

  /** Kirim berkas yang masih tertunda; mengembalikan daftar yang gagal beserta alasannya. */
  const uploadStaged = async (list: Staged[]): Promise<{ failed: Staged[]; saved: FollowupItem | null }> => {
    if (!item) return { failed: list, saved: null };
    const body = new FormData();
    body.set("segment", item.segment);
    body.set("id", item.id);
    body.set("titles", JSON.stringify(list.map((s) => s.title.trim())));
    for (const s of list) body.append("file", s.file, s.file.name);
    try {
      const res = await fetch("/api/tindak-lanjut/evidence", { method: "POST", body });
      const out = (await res.json().catch(() => null)) as {
        results?: { index: number; ok: boolean; error?: string }[];
        item?: FollowupItem;
        error?: string;
      } | null;
      if (!res.ok || !out?.results) {
        const why = out?.error ?? "Layanan unggah tidak merespons.";
        return { failed: list.map((s) => ({ ...s, error: why })), saved: null };
      }
      const failed = list.flatMap((s, i) => {
        const r = out.results!.find((x) => x.index === i);
        return r && !r.ok ? [{ ...s, error: r.error ?? "Unggahan gagal." }] : [];
      });
      return { failed, saved: out.item ?? null };
    } catch {
      return { failed: list.map((s) => ({ ...s, error: "Koneksi terputus saat mengunggah." })), saved: null };
    }
  };

  const finishUpload = (failed: Staged[], saved: FollowupItem | null, tindakLanjutSaved: boolean, uploadedCount: number) => {
    if (saved) {
      onSaved(saved);
      setDraft(draftOf(saved));
      lastBaseline.current = JSON.stringify(draftOf(saved));
    }
    if (failed.length) {
      setStaged(failed);
      setEvidenceOpen(true);
      setPopup({
        kind: "gagal",
        text: tindakLanjutSaved
          ? "Perubahan tindak lanjut sudah tersimpan, tetapi evidence berikut belum berhasil diunggah."
          : "Evidence berikut belum berhasil diunggah.",
        reasons: failed.map((f) => `${f.file.name}: ${f.error ?? "Unggahan gagal."}`),
      });
      return;
    }
    setStaged([]);
    setPopup({
      kind: "ok",
      title: uploadedCount && tindakLanjutSaved ? "Tindak Lanjut & Evidence tersimpan" : uploadedCount ? "Evidence tersimpan" : "Tindak Lanjut tersimpan",
      text: uploadedCount ? "Perubahan sudah masuk ke Google Sheet dan berkas evidence sudah tersimpan di Google Drive." : "Perubahan sudah masuk ke Google Sheet.",
    });
    getItemDetail(segment, responseId, itemId).then(setDetail);
  };

  const save = () => {
    if (!item || !draft) return;
    if (staged.some((s) => !s.title.trim())) {
      setEvidenceOpen(true);
      setMessage("Isi judul evidence untuk setiap berkas sebelum menyimpan.");
      return;
    }
    setMessage(null);
    const patch: Record<string, unknown> = {};
    const base = draftOf(item);
    for (const k of Object.keys(draft) as (keyof Draft)[]) if (draft[k] !== base[k]) patch[k] = draft[k];

    start(async () => {
      let tindakLanjutSaved = false;
      if (Object.keys(patch).length) {
        setPhase("saving");
        const res = await updateFollowupItem(item.segment, item.id, patch, item.updatedAt);
        if (!res.ok) {
          if (res.item) {
            onSaved(res.item);
            setDraft(draftOf(res.item));
            lastBaseline.current = JSON.stringify(draftOf(res.item));
          }
          setMessage(res.error);
          setPhase("idle");
          return;
        }
        tindakLanjutSaved = true;
        onSaved(res.item);
        setDraft(draftOf(res.item));
        lastBaseline.current = JSON.stringify(draftOf(res.item));
      }
      if (staged.length) {
        setPhase("uploading");
        const { failed, saved } = await uploadStaged(staged);
        setPhase("idle");
        finishUpload(failed, saved, tindakLanjutSaved, staged.length - failed.length);
      } else {
        setPhase("idle");
        finishUpload([], null, tindakLanjutSaved, 0);
      }
    });
  };

  const retryUpload = () => {
    const todo = staged;
    setPopup(null);
    start(async () => {
      setPhase("uploading");
      const { failed, saved } = await uploadStaged(todo);
      setPhase("idle");
      finishUpload(failed, saved, false, todo.length - failed.length);
    });
  };

  const promote = () => {
    start(async () => {
      const res = await promoteResponse(segment, responseId, promoteClass);
      if (res.ok) onPromoted();
      else setMessage(res.error ?? "Gagal menyimpan.");
    });
  };

  const d = detail === "loading" ? null : detail;
  const r = d?.response ?? null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setMessage(null);
    setDraft((cur) => (cur ? { ...cur, [k]: v } : cur));
  };
  const days = item?.target ? daysUntil(item.target) : null;
  const history = (d?.history ?? "").split("\n").filter(Boolean).reverse();
  const who = segment === "b2c" ? "Penumpang" : "Responden";
  const evidence = item ? parseEvidence(item.evidence) : [];
  const fileInputs = useRef<Partial<Record<EvidenceGroup, HTMLInputElement | null>>>({});

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detail tindak lanjut">
      <button aria-label="Tutup detail" onClick={() => !popup && onClose()} className="absolute inset-0 bg-ink/40" tabIndex={-1} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col bg-page shadow-2xl">
        <header className="border-b border-line bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">
                {isItem ? `${item!.id} · ${formatDate(item!.date)} · ${item!.station}` : `Apresiasi · ${formatDate(selection.item.date)} · ${selection.item.station}`}
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-ink">{isItem ? item!.klass : "Dibaca sebagai apresiasi"}</h2>
              {item && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${PRIORITY_TONE[item.priority]?.text ?? ""}`}>
                    <span className={`size-2 rounded-full ${PRIORITY_TONE[item.priority]?.mark ?? "bg-line-strong"}`} aria-hidden />
                    Prioritas {item.priority}
                  </span>
                  <span className="text-muted">{item.category}</span>
                </p>
              )}
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Tutup" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong bg-card text-ink-2 hover:border-ink-2">
              <X aria-hidden className="size-4" />
            </button>
          </div>

          {isItem && draft && item && editable && (
            <details className="mt-3 rounded-lg border border-line bg-sunken px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-ink-2">Ubah Status Klasifikasi</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field label="Klasifikasi">
                  <select value={draft.klass} onChange={(e) => set("klass", e.target.value)} className="select">
                    {[...new Set([draft.klass, ...CLASSES])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Prioritas">
                  <select value={draft.priority} onChange={(e) => set("priority", e.target.value)} className="select">
                    {[...new Set([draft.priority, ...PRIORITIES])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kategori (bagian layanan)">
                  <select value={draft.category} onChange={(e) => set("category", e.target.value)} className="select">
                    {[...new Set([draft.category, ...categoriesFor(segment)])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="mt-2 text-xs text-muted">
                Dipakai bila sistem salah membaca. Perubahan disimpan bersama tombol Simpan perubahan di bagian bawah.
                {item.systemClass && item.systemClass !== draft.klass ? ` Bacaan awal sistem: ${item.systemClass}.` : ""}
              </p>
            </details>
          )}
        </header>

        <div className="relative flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {item && (
            <section aria-label="Ringkasan">
              <p className="eyebrow">Versi ringkas</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{item.summary || "Belum ada ringkasan."}</p>
              {item.note && (
                <p className="mt-2 flex gap-2 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {item.note}
                </p>
              )}
            </section>
          )}

          <section aria-label={`Kata ${who.toLowerCase()}`} className="card p-5">
            <p className="eyebrow">Versi lengkap · langsung dari {who.toLowerCase()}</p>
            {detail === "loading" && <p className="mt-3 text-sm text-muted">Memuat jawaban asli…</p>}
            {d === null && detail !== "loading" && <p className="mt-3 text-sm text-crit">Gagal memuat jawaban asli. Tutup lalu buka lagi.</p>}
            {d && !r && (
              <p className="mt-3 text-sm text-muted">
                Jawaban survei asli tidak ditemukan{item && !item.responseId ? " karena baris ini belum terpetakan ke responden" : ""}. Ringkasan di atas
                tetap tersimpan di sheet.
                {item?.quote && <span className="mt-2 block whitespace-pre-line text-ink">{item.quote}</span>}
              </p>
            )}
            {r && (
              <div className="mt-3 space-y-4">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Nama</dt>
                    <dd className="font-semibold text-ink">{r.name || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">No. HP</dt>
                    <dd className="font-semibold text-ink">
                      {r.phone ? (
                        <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                          <Phone aria-hidden className="size-3.5" />
                          {r.phone}
                        </a>
                      ) : (
                        "-"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Email</dt>
                    <dd className="font-semibold text-ink">{r.email || <span className="font-normal text-muted">Tidak ditanyakan di formulir</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Masuk pada</dt>
                    <dd className="text-ink">{r.submittedAt || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{segment === "b2c" ? "Penerbangan" : "Instansi"}</dt>
                    <dd className="text-ink">{r.context || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Layanan</dt>
                    <dd className="text-ink">{r.services || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Kanal</dt>
                    <dd className="text-ink">{r.channels || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Index jawaban · skor rekomendasi</dt>
                    <dd className="num font-semibold text-ink">
                      {formatIdx(r.index)} · {r.nps ?? "-"}
                      <span className="font-normal text-muted"> / 10</span>
                    </dd>
                  </div>
                </dl>

                {[
                  ["Yang perlu diperbaiki", r.improve],
                  ["Saran atau masukan tambahan", r.suggestion],
                  ["Paling berkesan", r.best],
                  ["Pengalaman kendala", r.issueAnswer],
                ]
                  .filter(([, t]) => t.trim())
                  .map(([label, text]) => (
                    <figure key={label} className="border-l-2 border-brand pl-3">
                      <figcaption className="text-xs font-semibold text-ink-2">{label}</figcaption>
                      <blockquote className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-ink">{text}</blockquote>
                    </figure>
                  ))}

                {r.lowItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-2">Butir bernilai 3 atau kurang ({r.lowItems.length})</p>
                    <ul className="mt-1.5 space-y-1 text-sm text-ink">
                      {r.lowItems.map((x) => (
                        <li key={x.no} className="flex gap-2">
                          <span className="num w-7 shrink-0 rounded bg-crit-wash text-center font-semibold text-crit">{x.score}</span>
                          <span>
                            <span className="text-muted">No. {x.no}</span> {x.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {isItem && draft && item && (
            <section aria-label="Tindak lanjut" className="card relative p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">Tindak lanjut management</p>
                {days !== null && !isClosed(item.status) && (
                  <span className={`text-xs font-semibold ${days < 0 ? "text-crit" : days <= 3 ? "text-warn" : "text-muted"}`}>
                    {days < 0 ? `Terlambat ${-days} hari` : days === 0 ? "Jatuh tempo hari ini" : `${days} hari lagi`}
                  </span>
                )}
              </div>

              {editable ? (
                <div className="mt-3 space-y-4">
                  <div role="radiogroup" aria-label="Status" className="grid grid-cols-2 gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        role="radio"
                        aria-checked={draft.status === s}
                        onClick={() => set("status", s)}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold transition-colors ${
                          draft.status === s ? "border-brand bg-brand-wash text-ink" : "border-line-strong bg-card text-ink-2 hover:border-ink-2"
                        }`}
                      >
                        <span className={`size-2.5 shrink-0 rounded-full ${STATUS_TONE[s].dot}`} aria-hidden />
                        {s}
                      </button>
                    ))}
                  </div>

                  <Field label="PIC" hint="Siapa yang bertanggung jawab menindaklanjuti.">
                    <input value={draft.pic} onChange={(e) => set("pic", e.target.value)} maxLength={80} className={FIELD} />
                  </Field>
                  <Field label="Tindakan yang dilakukan">
                    <textarea
                      value={draft.action}
                      onChange={(e) => set("action", e.target.value)}
                      maxLength={2000}
                      rows={4}
                      className={`${FIELD} resize-y py-2 leading-relaxed`}
                      placeholder="Tulis langkah yang sudah atau akan dilakukan"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Target selesai" hint="Kosongkan untuk memakai target bawaan (3 hari Tinggi, 14 hari lainnya).">
                      <input type="date" value={draft.target} onChange={(e) => set("target", e.target.value)} className={FIELD} />
                    </Field>
                    <Field label="Tanggal selesai">
                      <input type="date" value={draft.done} onChange={(e) => set("done", e.target.value)} className={FIELD} />
                    </Field>
                  </div>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink">
                    <input type="checkbox" checked={draft.contacted} onChange={(e) => set("contacted", e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                    {who} sudah dihubungi
                  </label>

                  <details
                    open={evidenceOpen}
                    onToggle={(e) => setEvidenceOpen((e.currentTarget as HTMLDetailsElement).open)}
                    className="rounded-lg border border-line bg-sunken px-3 py-2"
                  >
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2">
                      <Paperclip aria-hidden className="size-4" />
                      Upload Evidence
                      {staged.length > 0 && <span className="num rounded-md bg-brand-wash px-1.5 text-xs text-brand">{staged.length} berkas</span>}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih jenis berkas">
                        {(Object.keys(EVIDENCE_GROUPS) as EvidenceGroup[]).map((g) => {
                          const Icon = GROUP_ICON[g];
                          return (
                            <span key={g}>
                              <input
                                ref={(el) => {
                                  fileInputs.current[g] = el;
                                }}
                                type="file"
                                multiple
                                accept={acceptFor(g)}
                                className="sr-only"
                                tabIndex={-1}
                                onChange={(e) => {
                                  pickFiles(e.target.files, g);
                                  e.target.value = "";
                                }}
                              />
                              <button
                                type="button"
                                disabled={busy || staged.length >= EVIDENCE_MAX_FILES}
                                onClick={() => fileInputs.current[g]?.click()}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm font-semibold text-ink hover:border-ink-2 disabled:opacity-50"
                              >
                                <Icon aria-hidden className="size-4" />
                                {EVIDENCE_GROUPS[g].label}
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted">
                        Maksimal {EVIDENCE_MAX_FILES} berkas, masing-masing sampai {formatBytes(EVIDENCE_MAX_BYTES)}. Nama berkas di Drive otomatis
                        berbentuk ID, tanggal, bandara, lalu judul yang Anda ketik.
                      </p>

                      {staged.length > 0 && (
                        <ul className="space-y-3">
                          {staged.map((s) => {
                            const Icon = GROUP_ICON[groupOfExt(extOf(s.file.name)) ?? "dokumen"];
                            return (
                              <li key={s.key} className="rounded-lg border border-line bg-card p-3">
                                <div className="flex items-center gap-2 text-sm">
                                  <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />
                                  <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={s.file.name}>
                                    {s.file.name}
                                  </span>
                                  <span className="num shrink-0 text-xs text-muted">{formatBytes(s.file.size)}</span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setStaged((cur) => cur.filter((x) => x.key !== s.key))}
                                    aria-label={`Hapus ${s.file.name}`}
                                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink disabled:opacity-50"
                                  >
                                    <X aria-hidden className="size-4" />
                                  </button>
                                </div>
                                <input
                                  value={s.title}
                                  onChange={(e) => setStaged((cur) => cur.map((x) => (x.key === s.key ? { ...x, title: e.target.value, error: undefined } : x)))}
                                  maxLength={EVIDENCE_TITLE_MAX}
                                  disabled={busy}
                                  aria-label={`Judul evidence untuk ${s.file.name}`}
                                  placeholder="Contoh: Foto briefing petugas di loket check-in"
                                  className={`${FIELD} mt-2 placeholder:text-muted/60`}
                                />
                                {s.error && <p className="mt-1.5 text-xs font-semibold text-crit">{s.error}</p>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </details>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={save}
                      disabled={!canSave}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                    >
                      {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                      {phase === "uploading" ? "Mengunggah evidence…" : busy ? "Menyimpan…" : "Simpan perubahan"}
                    </button>
                    {dirty && !busy && (
                      <button onClick={() => item && setDraft(draftOf(item))} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:bg-sunken">
                        Batalkan
                      </button>
                    )}
                    {message && (
                      <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-crit">
                        <TriangleAlert aria-hidden className="size-4" />
                        {message}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">Status</dt>
                    <dd className="flex items-center gap-2 font-semibold text-ink">
                      <span className={`size-2.5 rounded-full ${STATUS_TONE[item.status].dot}`} aria-hidden />
                      {item.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">PIC</dt>
                    <dd className="text-ink">{item.pic || "-"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Tindakan</dt>
                    <dd className="whitespace-pre-line text-ink">{item.action || "Belum ada tindakan tercatat."}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Target selesai</dt>
                    <dd className="text-ink">{item.target ? formatDate(item.target) : "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Tanggal selesai</dt>
                    <dd className="text-ink">{item.done ? formatDate(item.done) : "-"}</dd>
                  </div>
                </dl>
              )}

              {evidence.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-xs font-semibold text-ink-2">Evidence tersimpan ({evidence.length})</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {evidence.map((e, i) => (
                      <li key={`${e.url}-${i}`}>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                          <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                          {e.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {phase === "uploading" && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-[14px] bg-card/85 backdrop-blur-[1px]" role="status" aria-live="polite">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <LoaderCircle aria-hidden className="size-9 animate-spin text-brand" />
                    <p className="text-sm font-semibold text-ink">Mengunggah evidence ke Google Drive…</p>
                    <p className="max-w-60 text-xs text-muted">Mohon tunggu sampai selesai. Jangan menutup panel ini.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {!isItem && (
            <section aria-label="Tandai tindak lanjut" className="card p-5">
              <p className="eyebrow">Salah baca?</p>
              <p className="mt-1.5 text-sm text-ink-2">
                Sistem membaca jawaban ini sebagai apresiasi, jadi tidak masuk daftar tindak lanjut. Bila isinya sebenarnya kritik atau saran,
                jadikan item tindak lanjut.
              </p>
              {editable ? (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field label="Klasifikasi">
                    <select value={promoteClass} onChange={(e) => setPromoteClass(e.target.value)} className="select min-w-52">
                      {CLASSES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <button onClick={promote} disabled={pending} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
                    {pending ? "Menyimpan…" : "Jadikan tindak lanjut"}
                  </button>
                  {message && (
                    <p role="alert" className="w-full text-sm font-semibold text-crit">
                      {message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Peran Anda hanya bisa melihat.</p>
              )}
            </section>
          )}

          {isItem && history.length > 0 && (
            <section aria-label="Riwayat perubahan">
              <p className="eyebrow">Riwayat perubahan</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                {history.map((h, i) => (
                  <li key={i} className="border-l-2 border-line pl-3">
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>

      {popup && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 px-4" role="alertdialog" aria-modal="true" aria-labelledby="popup-title" aria-describedby="popup-text">
          <div className="card relative w-full max-w-md p-6 text-center">
            {popup.kind === "gagal" && (
              <button
                onClick={() => setPopup(null)}
                aria-label="Tutup"
                className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
            {popup.kind === "ok" ? (
              <CircleCheck aria-hidden className="mx-auto size-12 text-good-mark" />
            ) : (
              <TriangleAlert aria-hidden className="mx-auto size-12 text-crit-mark" />
            )}
            <h3 id="popup-title" className="mt-3 text-lg font-extrabold tracking-tight text-ink">
              {popup.kind === "ok" ? popup.title : "Upload Evidence Gagal Tersimpan"}
            </h3>
            <p id="popup-text" className="mt-1.5 text-sm text-ink-2">
              {popup.text}
            </p>
            {popup.kind === "gagal" && (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-crit-wash px-3 py-2 text-left text-xs text-crit">
                {popup.reasons.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-center gap-3">
              {popup.kind === "ok" ? (
                <button ref={okRef} onClick={() => setPopup(null)} className="min-h-11 min-w-28 rounded-lg bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-deep">
                  Oke
                </button>
              ) : (
                <button onClick={retryUpload} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-deep">
                  Upload Ulang
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
