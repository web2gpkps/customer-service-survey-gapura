import type { Metadata } from "next";
import { after } from "next/server";
import { FollowupApp } from "@/components/followup/FollowupApp";
import { LoadError } from "@/components/LoadError";
import { requireRole } from "@/lib/followup/auth";
import { lastSync, syncTracker } from "@/lib/followup/sync";
import { loadView } from "@/lib/followup/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tindak Lanjut · JOUMPA CSS Survey",
  robots: { index: false, follow: false },
};

const STALE_MS = 5 * 60_000;

export default async function Page() {
  const role = await requireRole();
  try {
    // Data masih baru: sinkronkan di belakang layar. Sudah lama tidak sinkron: tunggu dulu agar yang tampil terkini.
    const last = lastSync();
    if (!last || Date.now() - last.at > STALE_MS) await syncTracker({ minIntervalMs: 60_000 });
    else after(async () => void (await syncTracker({ minIntervalMs: 60_000 })));
    const view = await loadView();
    return <FollowupApp initial={view} role={role} />;
  } catch (err) {
    console.error("Gagal memuat halaman tindak lanjut:", err);
    return <LoadError message={err instanceof Error ? err.message : String(err)} />;
  }
}
