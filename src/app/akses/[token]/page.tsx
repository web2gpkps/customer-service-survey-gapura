import { headers } from "next/headers";
import Image from "next/image";
import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { LoadError } from "@/components/LoadError";
import { getSamplingData } from "@/lib/sampling";
import { getLink, linkState } from "@/lib/share-links";
import { getDashboardData, toClientData, type DashboardData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard cabang · JOUMPA CSS Survey",
  robots: { index: false, follow: false },
  // Token ada di URL; jangan bocor lewat header Referer ke situs lain.
  referrer: "no-referrer",
};

// Batas tebakan token: 20 link tak dikenal per 10 menit per IP (per instance di Vercel).
const WINDOW_MS = 10 * 60_000;
const MAX_UNKNOWN = 20;
const misses = new Map<string, number[]>();

function recentMisses(ip: string) {
  const now = Date.now();
  const list = (misses.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  misses.set(ip, list);
  if (misses.size > 5_000) for (const [k, ts] of misses) if (!ts.some((t) => now - t < WINDOW_MS)) misses.delete(k);
  return list;
}

const REASON = {
  throttled: "Terlalu banyak percobaan dengan link yang salah. Coba lagi beberapa menit lagi.",
  unknown: "Link tidak dikenali. Periksa kembali link yang Anda terima.",
  disabled: "Link ini sudah dimatikan oleh pengelola.",
  expired: "Masa berlaku link ini sudah habis.",
} as const;

function Denied({ reason }: { reason: keyof typeof REASON }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24">
      <div className="card p-8">
        <Image src="/logo-gapura.webp" alt="Gapura Airport Services" width={1052} height={569} className="h-9 w-auto" />
        <h1 className="mt-6 text-xl font-bold">Link tidak bisa dibuka</h1>
        <p className="mt-2 text-sm text-ink-2">{REASON[reason]}</p>
        <p className="mt-4 text-sm text-muted">Hubungi pengelola dashboard JOUMPA CSS untuk meminta link baru.</p>
      </div>
    </main>
  );
}

/** Kirim ke browser hanya data satu cabang. Cabang lain tidak boleh ikut terkirim. */
function onlyStation(data: DashboardData, code: string): DashboardData {
  const keep = <T extends { station: string }>(rs: T[]) => rs.filter((r) => r.station === code);
  return {
    ...data,
    airports: code in data.airports ? { [code]: data.airports[code] } : {},
    segments: {
      b2c: { ...data.segments.b2c, responses: keep(data.segments.b2c.responses) },
      b2b: { ...data.segments.b2b, responses: keep(data.segments.b2b.responses) },
    },
  };
}

export default async function CabangPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ token }, { tab }] = await Promise.all([params, searchParams]);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (recentMisses(ip).length >= MAX_UNKNOWN) return <Denied reason="throttled" />;

  let link;
  try {
    link = await getLink(token);
  } catch (err) {
    console.error("Gagal memeriksa link cabang:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
  if (!link) {
    recentMisses(ip).push(Date.now());
    return <Denied reason="unknown" />;
  }
  const state = linkState(link);
  if (state !== "active") return <Denied reason={state} />;

  try {
    const [data, sampling] = await Promise.all([getDashboardData(), getSamplingData()]);
    const branch = sampling.branches[link.station];
    return (
      <Dashboard
        data={onlyStation(toClientData(data), link.station)}
        initialTab={tab === "b2b" ? "b2b" : "b2c"}
        akses={{
          mode: "cabang",
          station: link.station,
          expiresAt: link.expiresAt,
          sampling: { ...sampling, branches: branch ? { [link.station]: branch } : {} },
        }}
      />
    );
  } catch (err) {
    console.error("Gagal memuat dashboard cabang:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
