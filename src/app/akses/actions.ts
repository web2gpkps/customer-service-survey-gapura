"use server";

import { requireAdmin } from "@/lib/admin";
import { getDashboardData } from "@/lib/sheets";
import { getSamplingData } from "@/lib/sampling";
import type { ShareLink } from "@/lib/share-link-types";
import { createLink, listLinks, updateLink } from "@/lib/share-links";

export type LinkResult = { ok: true; links: ShareLink[] } | { ok: false; error: string };

const message = (err: unknown) => (err instanceof Error ? err.message : "Terjadi kesalahan.");

async function knownStations(): Promise<Set<string>> {
  const [data, sampling] = await Promise.all([getDashboardData(), getSamplingData()]);
  return new Set([
    ...Object.keys(sampling.branches),
    ...data.segments.b2c.responses.map((r) => r.station),
    ...data.segments.b2b.responses.map((r) => r.station),
  ]);
}

/** null = tanpa batas; selain itu 1–365 hari dari sekarang. */
const cleanDays = (days: number | null) => (days === null ? null : Math.min(Math.max(Math.round(days), 1), 365));

export async function buatLink(input: { station: string; label: string; days: number | null }): Promise<LinkResult> {
  await requireAdmin("/akses");
  try {
    const station = input.station.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(station) || !(await knownStations()).has(station)) return { ok: false, error: "Cabang tidak dikenal." };
    await createLink({ station, label: input.label, days: cleanDays(input.days) });
    return { ok: true, links: await listLinks({ fresh: true }) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function ubahLink(
  token: string,
  change: { active?: boolean; extendDays?: number | null },
): Promise<LinkResult> {
  await requireAdmin("/akses");
  try {
    const expiresAt =
      change.extendDays === undefined
        ? undefined
        : change.extendDays === null
          ? null
          : new Date(Date.now() + cleanDays(change.extendDays)! * 86_400_000).toISOString();
    await updateLink(token, { active: change.active, expiresAt });
    return { ok: true, links: await listLinks({ fresh: true }) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}
