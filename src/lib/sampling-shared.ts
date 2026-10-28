// Tipe dan pembantu murni untuk target sampling. Aman diimpor komponen browser (tanpa google-auth-library).
import type { Response } from "./scoring";
import type { BranchSampling } from "./sampling";
import type { Segment } from "./survey-config";

export type OutsideReason = "no-block" | "no-contract" | "customer-unlisted" | "no-target" | "no-station";

export interface OutsideGroup {
  /** Kode bandara; kosong bila respons tidak punya kode. */
  code: string;
  /** Nama customer (B2B) atau jenis responden (B2C). */
  label: string;
  reason: OutsideReason;
  count: number;
}

export const OUTSIDE_REASON_LABEL: Record<OutsideReason, string> = {
  "no-block": "Cabang tidak ada di panduan",
  "no-contract": "Cabang tanpa customer kontrak (target 0)",
  "customer-unlisted": "Customer tidak ada di daftar kontrak cabang",
  "no-target": "Cabang tanpa target B2C (target 0)",
  "no-station": "Kode bandara tidak terbaca",
};

const MAX_PATTERN_LENGTH = 400;

function compile(pattern: string): RegExp | null {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return null;
  try {
    return new RegExp(pattern.replace(/^\(\?i\)/, ""), "i");
  } catch {
    return null;
  }
}

/**
 * Respons yang tidak masuk Panduan Target Sampling, dengan aturan yang sama dengan sheet:
 * - B2B: cabang tidak ada di panduan, cabang tanpa customer kontrak, atau nama instansi tidak cocok dengan satu pun customer kontrak cabang itu.
 * - B2C: cabang tidak ada di panduan, atau cabang yang panduannya tidak menetapkan target B2C.
 * Customer yang merespons lebih dari sekali tidak dianggap di luar panduan.
 */
export function classifyOutside(
  branches: Record<string, BranchSampling>,
  responses: Response[],
  segment: Segment,
): OutsideGroup[] {
  const patterns = new Map<string, RegExp[]>();
  for (const b of Object.values(branches)) patterns.set(b.code, b.b2b.customers.flatMap((c) => compile(c.pattern) ?? []));

  const groups = new Map<string, OutsideGroup>();
  for (const r of responses) {
    const code = /^[A-Z]{3}$/.test(r.station) ? r.station : "";
    const branch = code ? branches[code] : undefined;
    const name = r.institution.replace(/\s+/g, " ").trim();
    let reason: OutsideReason | null = null;
    if (!code) reason = "no-station";
    else if (!branch) reason = "no-block";
    else if (segment === "b2b") {
      if (!branch.b2b.customers.length) reason = "no-contract";
      else if (!name || !(patterns.get(code) ?? []).some((p) => p.test(name))) reason = "customer-unlisted";
    } else if (branch.b2c.target === 0) reason = "no-target";
    if (!reason) continue;

    const label = segment === "b2b" ? name.toUpperCase() || "(tanpa nama instansi)" : "Responden B2C";
    const key = `${code}|${label}|${reason}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { code, label, reason, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code) || b.count - a.count);
}
