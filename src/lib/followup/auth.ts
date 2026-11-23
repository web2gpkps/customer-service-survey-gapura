/**
 * Akses menu Tindak Lanjut: tiga tingkat.
 * - admin   : password admin (akses penuh; sesi yang sama dengan dashboard utama)
 * - manager : FOLLOWUP_MANAGER_PASSWORD, boleh mengisi dan mengubah
 * - viewer  : FOLLOWUP_VIEWER_PASSWORD, hanya melihat
 *
 * Sesi manager/viewer memakai cookie sendiri yang ditandatangani dengan kunci turunan, sehingga cookie ini
 * tidak pernah sah sebagai sesi admin (dan sebaliknya).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authSecret, readSession } from "../session";
import { canEdit, type Role } from "./types";

export const FOLLOWUP_COOKIE = "joumpa_tindak_lanjut";
export const FOLLOWUP_SESSION_MS = 12 * 60 * 60 * 1000;

export const followupSecret = (): string | null => {
  const s = authSecret();
  return s ? `${s}|tindak-lanjut` : null;
};

/**
 * Peran diambil HANYA dari sesi menu ini. Sesi admin dashboard utama tidak otomatis membuka menu: admin pun harus
 * memasukkan salah satu dari tiga password di halaman masuk Tindak Lanjut (lalu sesi menu berlaku 12 jam).
 */
export async function getRole(): Promise<Role | null> {
  const secret = followupSecret();
  if (!secret) return null;
  const session = await readSession<{ exp: number; role?: string }>((await cookies()).get(FOLLOWUP_COOKIE)?.value, secret);
  return session?.role === "admin" || session?.role === "manager" || session?.role === "viewer" ? session.role : null;
}

/** Untuk halaman: tanpa sesi diarahkan ke halaman masuk. */
export async function requireRole(): Promise<Role> {
  const role = await getRole();
  if (!role) redirect("/tindak-lanjut/masuk");
  return role;
}

/** Untuk server action dan route: melempar galat bila tidak berhak mengubah data. */
export async function requireEditor(): Promise<"admin" | "manager"> {
  const role = await getRole();
  if (!canEdit(role)) throw new Error("Tidak berwenang mengubah data.");
  return role;
}
