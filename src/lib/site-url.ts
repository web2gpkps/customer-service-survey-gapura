/**
 * Alamat publik yang dipakai di link yang dibagikan. Alamat deployment Vercel (…-hash-tim.vercel.app) dilindungi
 * login Vercel, jadi link harus memakai domain production. Urutan: SITE_URL (manual) lalu domain production Vercel.
 * Mengembalikan undefined bila tidak diketahui (lokal): pemanggil memakai alamat halaman yang sedang dibuka.
 */
export function publicOrigin(): string | undefined {
  const manual = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (manual && /^https?:\/\/[^\s/]+$/i.test(manual)) return manual;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (host && /^[a-z0-9.-]+$/i.test(host)) return `https://${host}`;
  return undefined;
}
