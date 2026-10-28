"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_SESSION_MS } from "@/lib/admin";
import { authSecret, safeEqual, signSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

// Pembatas percobaan di memori: 8 kali gagal per 10 menit per IP (per instance di Vercel).
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 8;
const fails = new Map<string, number[]>();

function recentFails(ip: string) {
  const now = Date.now();
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(ip, list);
  return list;
}

/**
 * Hanya path internal dengan karakter biasa. Daftar putih ini juga menolak tab, newline, dan backslash,
 * yang oleh browser bisa dibaca sebagai "//situs-lain".
 */
const safeNext = (next: string) => (/^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : "/");

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const secret = authSecret();
  const expected = process.env.ADMIN_PASSWORD;
  if (!secret || !expected) {
    return { error: "ADMIN_PASSWORD dan AUTH_SECRET (minimal 16 karakter) belum diatur di environment server." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (recentFails(ip).length >= MAX_FAILS) return { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." };

  const password = String(form.get("password") ?? "");
  if (!(await safeEqual(password, expected))) {
    recentFails(ip).push(Date.now());
    return { error: "Password salah." };
  }

  const token = await signSession({ exp: Date.now() + ADMIN_SESSION_MS }, secret);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MS / 1000,
  });
  redirect(safeNext(String(form.get("next") ?? "/")));
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}
