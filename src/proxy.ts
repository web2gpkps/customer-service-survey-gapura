import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, authSecret, verifySession } from "@/lib/session";

/**
 * Semua halaman dan API dikunci untuk admin kecuali:
 * - /login
 * - /akses/<token>   halaman cabang; tokennya dicek di halaman itu sendiri
 * - /presentasi      laporan hanya-baca dari tombol Bagikan
 *
 * Pengecekan di sini hanya penjaga awal. Halaman dan server action admin tetap memanggil requireAdmin().
 */
const isPublicPath = (p: string) =>
  p === "/login" ||
  (p.startsWith("/akses/") && p.length > "/akses/".length) ||
  p === "/presentasi" ||
  p.startsWith("/presentasi/");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = authSecret();
  const ok = secret ? await verifySession(request.cookies.get(ADMIN_COOKIE)?.value, secret) : false;
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) return new NextResponse("Perlu login admin.", { status: 401 });

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Lewati aset statis Next dan file di /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-gapura\\.(?:png|webp)).*)"],
};
