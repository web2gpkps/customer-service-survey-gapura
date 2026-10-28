import { Dashboard } from "@/components/Dashboard";
import { LoadError } from "@/components/LoadError";
import { getDashboardData, toClientData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  try {
    const data = await getDashboardData();
    return <Dashboard data={toClientData(data)} initialTab={tab === "b2b" ? "b2b" : "b2c"} />;
  } catch (err) {
    console.error("Gagal memuat data dashboard:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
