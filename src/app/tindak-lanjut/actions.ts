"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildCandidates, responseDetail, isIssueYes, type ResponseDetail } from "@/lib/followup/candidates";
import { FOLLOWUP_COOKIE, FOLLOWUP_SESSION_MS, followupSecret, requireEditor, requireRole } from "@/lib/followup/auth";
import { buildSummary } from "@/lib/followup/classify";
import { syncTracker, toNewRow, type SyncStatus } from "@/lib/followup/sync";
import {
  ConflictError,
  ValidationError,
  appendRows,
  nextId,
  readTracker,
  updateItem,
  validatePatch,
} from "@/lib/followup/tracker";
import { CLASSES, ROLE_LABEL, type FollowupItem, type Segment } from "@/lib/followup/types";
import { clientIp } from "@/lib/guess-limit";
import { getDashboardData } from "@/lib/sheets";
import { authSecret, safeEqual, signSession } from "@/lib/session";

/* ── Masuk / keluar ── */

export interface LoginState {
  error?: string;
}

// 8 kali gagal per 10 menit per IP (per instance). Sama dengan login admin.
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 8;
const store = globalThis as unknown as { __followupFails?: Map<string, number[]> };
const fails = (store.__followupFails ??= new Map<string, number[]>());
const recentFails = (ip: string) => {
  const now = Date.now();
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(ip, list);
  return list;
};

const safeNext = (next: string) => (/^\/tindak-lanjut(?!\/\/)[\w\-./?=&%]*$/.test(next) ? next : "/tindak-lanjut");

export async function loginFollowup(_prev: LoginState, form: FormData): Promise<LoginState> {
  const secret = authSecret();
  const fSecret = followupSecret();
  // ADMIN_PASSWORD hanya untuk masuk dashboard CSS JOUMPA. Menu ini punya tiga password sendiri, dan password yang sama
  // dengan ADMIN_PASSWORD diabaikan: password dashboard tidak pernah membuka menu Tindak Lanjut.
  const dashboardPw = process.env.ADMIN_PASSWORD;
  const menuPw = (value: string | undefined) => (value && value !== dashboardPw ? value : undefined);
  const adminPw = menuPw(process.env.FOLLOWUP_ADMIN_PASSWORD);
  const managerPw = menuPw(process.env.FOLLOWUP_MANAGER_PASSWORD);
  const viewerPw = menuPw(process.env.FOLLOWUP_VIEWER_PASSWORD);
  if (!secret || !fSecret || !(adminPw || managerPw || viewerPw)) {
    return {
      error:
        "Password menu belum diatur di environment server. FOLLOWUP_ADMIN_PASSWORD, FOLLOWUP_MANAGER_PASSWORD, dan FOLLOWUP_VIEWER_PASSWORD harus diisi dan berbeda dari ADMIN_PASSWORD (password dashboard).",
    };
  }

  const ip = clientIp(await headers());
  if (recentFails(ip).length >= MAX_FAILS) return { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." };

  const password = String(form.get("password") ?? "");
  // Semua password selalu dibandingkan (tanpa berhenti di yang cocok) supaya waktu respons tidak membocorkan jenisnya.
  const [isAdminPw, isManagerPw, isViewerPw] = await Promise.all([
    adminPw ? safeEqual(password, adminPw) : Promise.resolve(false),
    managerPw ? safeEqual(password, managerPw) : Promise.resolve(false),
    viewerPw ? safeEqual(password, viewerPw) : Promise.resolve(false),
  ]);
  if (!password || !(isAdminPw || isManagerPw || isViewerPw)) {
    recentFails(ip).push(Date.now());
    return { error: "Password salah." };
  }

  const role = isAdminPw ? "admin" : isManagerPw ? "manager" : "viewer";
  (await cookies()).set(FOLLOWUP_COOKIE, await signSession({ exp: Date.now() + FOLLOWUP_SESSION_MS, role }, fSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FOLLOWUP_SESSION_MS / 1000,
  });
  redirect(safeNext(String(form.get("next") ?? "/tindak-lanjut")));
}

export async function logoutFollowup() {
  // Hanya mengakhiri sesi menu ini; sesi dashboard utama (bila ada) tidak disentuh.
  (await cookies()).delete(FOLLOWUP_COOKIE);
  redirect("/tindak-lanjut/masuk");
}

/* ── Data ── */

export type UpdateResult =
  | { ok: true; item: FollowupItem }
  | { ok: false; error: string; conflict?: boolean; item?: FollowupItem };

const SEGMENTS: Segment[] = ["b2c", "b2b"];
const asSegment = (s: unknown): Segment => {
  if (!SEGMENTS.includes(s as Segment)) throw new ValidationError("Segmen tidak valid.");
  return s as Segment;
};
const asId = (s: unknown): string => {
  const id = String(s ?? "");
  if (!/^B2[CB]-\d{1,5}$/.test(id)) throw new ValidationError("ID tidak valid.");
  return id;
};

export async function updateFollowupItem(segment: string, id: string, patch: unknown, version: string): Promise<UpdateResult> {
  try {
    const role = await requireEditor();
    const item = await updateItem(asSegment(segment), asId(id), validatePatch(patch), ROLE_LABEL[role], String(version ?? "").slice(0, 40));
    return { ok: true, item: { ...item, history: "" } };
  } catch (err) {
    if (err instanceof ConflictError) {
      const latest = (await readTracker({ fresh: true }).catch(() => null))?.items.find((i) => i.segment === segment && i.id === id);
      return { ok: false, error: err.message, conflict: true, item: latest ? { ...latest, history: "" } : undefined };
    }
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    if (err instanceof Error && err.message === "Tidak berwenang mengubah data.") return { ok: false, error: err.message };
    console.error("Gagal mengubah item tindak lanjut:", err);
    return { ok: false, error: "Gagal menyimpan ke Google Sheet. Coba lagi." };
  }
}

export interface ItemDetail {
  history: string;
  /** Null bila jawaban survei tidak ditemukan lagi (mis. baris sumber dihapus). */
  response: ResponseDetail | null;
}

/** Versi panjang: jawaban asli penumpang beserta kontaknya. Boleh dibuka semua peran yang sudah masuk. */
export async function getItemDetail(segment: string, responseId: string, id: string): Promise<ItemDetail | null> {
  await requireRole();
  try {
    const seg = asSegment(segment);
    const data = await getDashboardData();
    const snap = await readTracker();
    const item = snap.items.find((i) => i.segment === seg && i.id === String(id));
    return { history: item?.history ?? "", response: responseId ? responseDetail(data, seg, String(responseId).slice(0, 40)) : null };
  } catch (err) {
    console.error("Gagal memuat detail:", err);
    return null;
  }
}

/** Jadikan jawaban yang dibaca apresiasi sebagai item tindak lanjut (sistem salah baca). */
export async function promoteResponse(segment: string, responseId: string, klass: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const role = await requireEditor();
    const seg = asSegment(segment);
    if (!(CLASSES as readonly string[]).includes(klass)) return { ok: false, error: "Klasifikasi tidak dikenal." };
    const data = await getDashboardData();
    const snap = await readTracker({ fresh: true });
    if (snap.items.some((i) => i.segment === seg && i.responseId === responseId)) return { ok: false, error: "Item ini sudah ada di tracker." };
    const c = buildCandidates(data, seg).find((x) => x.responseId === responseId);
    const detail = responseDetail(data, seg, responseId);
    if (!c || !detail) return { ok: false, error: "Jawaban survei tidak ditemukan." };

    const input = {
      index: detail.index,
      nps: detail.nps,
      issueYes: isIssueYes(detail.issueAnswer),
      improve: detail.improve,
      suggestion: detail.suggestion,
      lowItems: detail.lowItems,
    };
    const built = buildSummary({ ...input, klass: klass as (typeof CLASSES)[number] }, { force: true });
    const category = c.category;
    const high = klass === "Pengalaman Kendala" || klass === "Indikasi Kendala";
    const id = nextId(seg, snap.items)();
    await appendRows(seg, [
      { ...toNewRow(seg, id, c, { klass, priority: high ? "Tinggi" : "Sedang", summary: built.summary, quote: built.quote, category }), note: `Ditandai manual oleh ${ROLE_LABEL[role]} (sistem membacanya sebagai apresiasi).` },
    ]);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Error && err.message === "Tidak berwenang mengubah data.") return { ok: false, error: err.message };
    console.error("Gagal menambahkan item:", err);
    return { ok: false, error: "Gagal menyimpan ke Google Sheet." };
  }
}

/** Tombol "Sinkronkan": jeda minimum 5 detik antar-sinkronisasi untuk seluruh pengguna. */
export async function syncNow(): Promise<SyncStatus> {
  await requireEditor();
  return syncTracker({ minIntervalMs: 5_000, fresh: true });
}
