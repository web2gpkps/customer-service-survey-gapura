"use server";

import { requireAdmin } from "@/lib/admin";
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
  return deleteAllInactiveLinks();
}
