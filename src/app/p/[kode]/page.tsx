import type { Metadata } from "next";
import { headers } from "next/headers";
import { LoadError } from "@/components/LoadError";
import { Presentation } from "@/components/Presentation";
import { clientIp, isGuessBlocked, recordMiss } from "@/lib/guess-limit";
import { isReportLink, lockToScope, scopeOf } from "@/lib/report-link";
import { getLink, isDead } from "@/lib/share-store";
import { getDashboardData, toClientData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan JOUMPA CSS Survey",
  robots: { index: false, follow: false },
  // Kode ada di URL; jangan bocor lewat header Referer ke situs lain.
  referrer: "no-referrer",
};

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <div className="card p-8">
        <p className="eyebrow">JOUMPA CSS Survey</p>
        <h1 className="mt-2 text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-ink-2">{children}</p>
      </div>
    </main>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;

  const ip = clientIp(await headers());
  if (isGuessBlocked(ip)) return <Notice title="Terlalu banyak percobaan">Coba lagi dalam beberapa menit.</Notice>;

  let link;
  try {
    link = await getLink(kode);
  } catch (err) {
    console.error("Penyimpanan link bermasalah:", err);
    return <Notice title="Halaman belum bisa dibuka">Layanan sedang bermasalah sementara. Coba muat ulang beberapa saat lagi.</Notice>;
  }

  // Link salah, jenis lain (link cabang), diputus, atau kedaluwarsa menampilkan pesan yang sama.
  if (!isReportLink(link) || isDead(link)) {
    recordMiss(ip);
    return <Notice title="Link ini tidak berlaku">Link sudah diputus, kedaluwarsa, atau tidak ditemukan. Minta link baru ke admin.</Notice>;
  }

  const scope = scopeOf(link);
  try {
    const data = lockToScope(toClientData(await getDashboardData()), scope);
    return <Presentation data={data} query={scope} exportBase={`/api/laporan-export/${encodeURIComponent(kode)}`} />;
  } catch (err) {
    console.error("Gagal memuat data laporan:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
