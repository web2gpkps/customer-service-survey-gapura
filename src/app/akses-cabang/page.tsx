import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { LoadError } from "@/components/LoadError";
import { requireAdmin } from "@/lib/admin";
import { loadSampling } from "@/lib/sampling";
import { publicOrigin } from "@/lib/site-url";
import { getDashboardData, toClientData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share akses cabang · JOUMPA CSS Survey",
  robots: { index: false, follow: false },
};

export default async function AksesCabangPage() {
  await requireAdmin("/akses-cabang");
  try {
    const [data, sampling] = await Promise.all([getDashboardData(), loadSampling()]);
    return <Dashboard data={toClientData(data)} initialTab="b2c" akses={{ mode: "admin", sampling, shareOrigin: publicOrigin() }} />;
  } catch (err) {
    console.error("Gagal memuat halaman akses cabang:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
