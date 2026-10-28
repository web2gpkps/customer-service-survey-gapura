/** Bagian registri link yang aman dipakai di browser (tanpa impor server). */
export interface ShareLink {
  token: string;
  station: string;
  label: string;
  createdAt: string; // ISO
  expiresAt: string | null; // ISO
  active: boolean;
}

export type LinkState = "active" | "expired" | "disabled";

export const linkState = (l: ShareLink, now = Date.now()): LinkState =>
  !l.active ? "disabled" : l.expiresAt && new Date(l.expiresAt).getTime() <= now ? "expired" : "active";
