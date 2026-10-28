import { randomBytes } from "node:crypto";
import { SHEETS_READ, SHEETS_WRITE, sheetsApi } from "./google";
import type { ShareLink } from "./share-link-types";

export { linkState, type LinkState, type ShareLink } from "./share-link-types";

/**
 * Registri link akses cabang, disimpan di tab Google Sheets supaya tidak perlu database.
 * Tab dibuat otomatis saat link pertama dibuat. Service account harus berstatus Editor di spreadsheet.
 *
 * Kolom: Token | Cabang | Label | Dibuat | Kedaluwarsa | Status
 * Token acak 128-bit adalah satu-satunya rahasia di URL. Kedaluwarsa kosong berarti tanpa batas.
 */
const REGISTRY_SHEET = process.env.SHEET_AKSES || "Share Akses Cabang";
const HEADER = ["Token", "Cabang", "Label", "Dibuat", "Kedaluwarsa", "Status"];
const CACHE_TTL_MS = 5_000;

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

let cache: { at: number; links: ShareLink[] } | null = null;

const q = (range: string) => encodeURIComponent(`'${REGISTRY_SHEET}'!${range}`);

async function fail(res: Response, what: string): Promise<never> {
  if (res.status === 403) {
    throw new Error(`${what}: service account belum punya akses Editor ke spreadsheet. Bagikan spreadsheet sebagai Editor ke email service account.`);
  }
  throw new Error(`${what} (Google Sheets API ${res.status}).`);
}

function toLink(row: string[]): ShareLink | null {
  const [token = "", station = "", label = "", createdAt = "", expiresAt = "", status = ""] = row.map((c) => c.trim());
  if (!TOKEN_PATTERN.test(token)) return null;
  return {
    token,
    station: station.toUpperCase(),
    label,
    createdAt,
    expiresAt: expiresAt || null,
    active: status.toLowerCase() !== "mati",
  };
}

/** Semua link, terbaru di atas. Daftar kosong kalau tab registri belum ada. */
export async function listLinks({ fresh = false } = {}): Promise<ShareLink[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.links;
  const { headers, base } = await sheetsApi(SHEETS_READ);
  const res = await fetch(`${base}/values/${q("A2:F")}?valueRenderOption=UNFORMATTED_VALUE`, { headers, cache: "no-store" });
  let links: ShareLink[] = [];
  if (res.status === 400) {
    // Tab belum dibuat: belum ada link.
  } else if (!res.ok) {
    await fail(res, "Daftar link tidak bisa dibaca");
  } else {
    const values = ((await res.json()) as { values?: unknown[][] }).values ?? [];
    links = values.flatMap((r) => toLink(r.map(String)) ?? []).reverse();
  }
  cache = { at: Date.now(), links };
  return links;
}

export async function getLink(token: string): Promise<ShareLink | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  return (await listLinks()).find((l) => l.token === token) ?? null;
}

async function ensureRegistry(headers: Record<string, string>, base: string) {
  const meta = await fetch(`${base}?fields=sheets.properties.title`, { headers, cache: "no-store" });
  if (!meta.ok) await fail(meta, "Spreadsheet tidak bisa dibuka");
  const titles = ((await meta.json()) as { sheets: { properties: { title: string } }[] }).sheets.map((s) => s.properties.title);
  if (titles.includes(REGISTRY_SHEET)) return;

  const add = await fetch(`${base}:batchUpdate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: REGISTRY_SHEET } } }] }),
  });
  if (!add.ok) await fail(add, "Tab registri link tidak bisa dibuat");
  const put = await fetch(`${base}/values/${q("A1:F1")}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADER] }),
  });
  if (!put.ok) await fail(put, "Header registri link tidak bisa ditulis");
}

export async function createLink(input: { station: string; label: string; days: number | null }): Promise<ShareLink> {
  const now = new Date();
  const link: ShareLink = {
    token: randomBytes(16).toString("base64url"),
    station: input.station.toUpperCase(),
    label: input.label.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
    createdAt: now.toISOString(),
    expiresAt: input.days ? new Date(now.getTime() + input.days * 86_400_000).toISOString() : null,
    active: true,
  };
  const { headers, base } = await sheetsApi(SHEETS_WRITE);
  await ensureRegistry(headers, base);
  const res = await fetch(`${base}/values/${q("A:F")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [[link.token, link.station, link.label, link.createdAt, link.expiresAt ?? "", "Aktif"]],
    }),
  });
  if (!res.ok) await fail(res, "Link tidak bisa disimpan");
  cache = null;
  return link;
}

/** Matikan/aktifkan link atau ubah kedaluwarsanya (`null` = tanpa batas). */
export async function updateLink(token: string, change: { active?: boolean; expiresAt?: string | null }) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("Token tidak valid.");
  const { headers, base } = await sheetsApi(SHEETS_WRITE);
  const col = await fetch(`${base}/values/${q("A:A")}`, { headers, cache: "no-store" });
  if (!col.ok) await fail(col, "Daftar link tidak bisa dibaca");
  const tokens = ((await col.json()) as { values?: string[][] }).values ?? [];
  const index = tokens.findIndex((r) => r[0]?.trim() === token);
  if (index < 1) throw new Error("Link tidak ditemukan.");
  const row = index + 1;

  const data: { range: string; values: string[][] }[] = [];
  if (change.expiresAt !== undefined) data.push({ range: `'${REGISTRY_SHEET}'!E${row}`, values: [[change.expiresAt ?? ""]] });
  if (change.active !== undefined) data.push({ range: `'${REGISTRY_SHEET}'!F${row}`, values: [[change.active ? "Aktif" : "Mati"]] });
  if (!data.length) return;

  const res = await fetch(`${base}/values:batchUpdate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  if (!res.ok) await fail(res, "Link tidak bisa diubah");
  cache = null;
}
