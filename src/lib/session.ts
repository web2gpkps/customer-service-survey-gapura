/** Token sesi bertanda tangan HMAC-SHA256. Memakai Web Crypto supaya jalan di proxy (Edge) dan di server Node. */

export const ADMIN_COOKIE = "joumpa_admin";

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const key = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export function authSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/** Token = base64url(payload).base64url(tanda tangan). Payload memuat waktu kedaluwarsa `exp` (ms). */
export async function signSession(payload: { exp: number }, secret: string): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret, "sign"), enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return false;
  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return false;
  // crypto.subtle.verify membandingkan tanda tangan dengan waktu konstan.
  const ok = await crypto.subtle.verify("HMAC", await key(secret, "verify"), sigBytes, enc.encode(body));
  if (!ok) return false;
  const bodyBytes = fromBase64Url(body);
  if (!bodyBytes) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(bodyBytes)) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

/** Bandingkan dua string tanpa bocor panjang kecocokan lewat waktu respons. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
