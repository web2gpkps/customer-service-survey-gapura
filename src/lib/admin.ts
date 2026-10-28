import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, authSecret, verifySession } from "./session";

export { ADMIN_COOKIE };

export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

export async function isAdmin(): Promise<boolean> {
  const secret = authSecret();
  if (!secret) return false;
  return verifySession((await cookies()).get(ADMIN_COOKIE)?.value, secret);
}

/** Dipakai di halaman dan server action admin; proxy saja tidak cukup sebagai pengaman. */
export async function requireAdmin(next = "/") {
  if (!(await isAdmin())) redirect(`/login?next=${encodeURIComponent(next)}`);
}
