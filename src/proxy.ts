import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, authSecret, verifySession } from "@/lib/session";

/**
 * Semua halaman dan API dikunci untuk admin kecuali:
 * - /login
 * - /tindak-lanjut dan /api/tindak-lanjut/*   dijaga password bertingkat dan token di dalamnya sendiri
 * - /cabang/<kode>   halaman cabang; kodenya dicek di halaman itu sendiri
 * - /api/cabang-export/<kode>   export untuk pemegang link cabang; kodenya dicek di route itu sendiri
 * - /p/<kode>        laporan hanya-baca dari tombol Bagikan; kodenya dicek di halaman itu sendiri
 * - /api/laporan-export/<kode>   export PDF untuk pemegang link laporan; kodenya dicek di route itu sendiri
 *
 * Pengecekan di sini hanya penjaga awal. Halaman dan server action admin tetap memanggil requireAdmin().
 */
const isPublicPath = (p: string) =>
  p === "/login" ||
  // Menu Tindak Lanjut punya tiga tingkat password sendiri (admin, management, lihat saja); halaman dan API-nya
  // memeriksa peran di dalam. Webhook sinkronisasi dijaga token rahasia di route-nya.
  p === "/tindak-lanjut" ||
  p.startsWith("/tindak-lanjut/") ||
  p.startsWith("/api/tindak-lanjut/") ||
  (p.startsWith("/cabang/") && p.length > "/cabang/".length) ||
  (p.startsWith("/api/cabang-export/") && p.length > "/api/cabang-export/".length) ||
  (p.startsWith("/p/") && p.length > "/p/".length) ||
  (p.startsWith("/api/laporan-export/") && p.length > "/api/laporan-export/".length);

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
  // Lewati aset statis Next dan file di /public. Unggahan evidence juga dilewati: proxy menyangga isi permintaan
  // maksimal 10 MB, padahal unggahan bisa lebih besar. Route itu memeriksa peran dan asal permintaan sendiri.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/tindak-lanjut/evidence|logo-(?:gapura|joumpa)[\\w-]*\\.(?:png|webp)).*)"],
};
