import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { LoadError } from "@/components/LoadError";
import { requireAdmin } from "@/lib/admin";
import { getSamplingData } from "@/lib/sampling";
import { listLinks } from "@/lib/share-links";
import { getDashboardData, toClientData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share akses cabang · JOUMPA CSS Survey",
  robots: { index: false, follow: false },
};

export default async function AksesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin("/akses");
  const { tab } = await searchParams;
  try {
    const [data, sampling, links] = await Promise.all([
      getDashboardData(),
      getSamplingData(),
      // Registri boleh gagal dibaca tanpa merusak halaman; pesan galatnya muncul saat membuat link.
      listLinks({ fresh: true }).catch(() => []),
    ]);
    const stationOptions = [
      ...new Set([
        ...Object.keys(sampling.branches),
        ...data.segments.b2c.responses.map((r) => r.station),
        ...data.segments.b2b.responses.map((r) => r.station),
      ]),
    ]
      .filter((s) => /^[A-Z]{3}$/.test(s))
      .sort();
    return (
      <Dashboard
        data={toClientData(data)}
        initialTab={tab === "b2b" ? "b2b" : "b2c"}
        akses={{ mode: "admin", sampling, links, stationOptions }}
      />
    );
  } catch (err) {
    console.error("Gagal memuat halaman akses cabang:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
