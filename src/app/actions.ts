"use server";

import { requireAdmin } from "@/lib/admin";
import { parseScope, scopeToSearch } from "@/lib/filters";
import { clearSamplingCache } from "@/lib/sampling";
import { createLink, deleteAllInactiveLinks, deleteInactiveLink, listLinks, revokeLink, type ShareLink } from "@/lib/share-store";
import { clearSheetCache } from "@/lib/sheets";

export async function refreshData() {
  await requireAdmin();
  clearSheetCache();
  clearSamplingCache();
}

const BRANCH_DAYS = [7, 30, 90, 0] as const;

/** Link akses cabang: berlaku untuk semua cabang. days = 0 berarti tanpa batas waktu. */
export async function createBranchLink(days: number): Promise<ShareLink> {
  await requireAdmin("/akses-cabang");
  if (!(BRANCH_DAYS as readonly number[]).includes(days)) throw new Error("Masa berlaku tidak valid.");
  return createLink(days ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined);
}

export async function listBranchLinks(): Promise<ShareLink[]> {
  await requireAdmin("/akses-cabang");
  return listLinks();
}

export async function revokeBranchLink(code: string): Promise<boolean> {
  await requireAdmin("/akses-cabang");
  return revokeLink(String(code));
}

export async function deleteBranchLink(code: string): Promise<boolean> {
  await requireAdmin("/akses-cabang");
  return deleteInactiveLink(String(code));
}

export async function deleteInactiveBranchLinks(): Promise<number> {
  await requireAdmin("/akses-cabang");
  return deleteAllInactiveLinks("cabang");
}

/* ── Link laporan (tombol Bagikan di halaman utama) ── */

/** Link laporan hanya-baca. Cakupan data dikunci di server saat link dibuat; days = 0 berarti tanpa batas waktu. */
export async function createReportLink(search: string, days: number): Promise<ShareLink> {
  await requireAdmin("/");
  if (!(BRANCH_DAYS as readonly number[]).includes(days)) throw new Error("Masa berlaku tidak valid.");
  // Dinormalkan lewat parser yang sama dengan halaman: hanya nilai yang dikenal yang tersimpan.
  const scope = scopeToSearch(parseScope(new URLSearchParams(String(search).slice(0, 8_000))));
  return createLink(days ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined, { kind: "laporan", scope });
}

export async function listReportLinks(): Promise<ShareLink[]> {
  await requireAdmin("/");
  return listLinks("laporan");
}

export async function revokeReportLink(code: string): Promise<boolean> {
  await requireAdmin("/");
  return revokeLink(String(code));
}

export async function deleteReportLink(code: string): Promise<boolean> {
  await requireAdmin("/");
  return deleteInactiveLink(String(code));
}

export async function deleteInactiveReportLinks(): Promise<number> {
  await requireAdmin("/");
  return deleteAllInactiveLinks("laporan");
}
