import type { Metadata } from "next";
import { LoadError } from "@/components/LoadError";
import { Presentation } from "@/components/Presentation";
import { parseScope } from "@/lib/filters";
import { getDashboardData, toClientData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan JOUMPA CSS Survey",
  robots: { index: false, follow: false },
};

export default async function PresentasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseScope(await searchParams);
  try {
    const data = await getDashboardData();
    return <Presentation data={toClientData(data)} query={query} />;
  } catch (err) {
    console.error("Gagal memuat data presentasi:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
