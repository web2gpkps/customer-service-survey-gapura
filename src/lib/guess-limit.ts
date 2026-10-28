// Pembatas tebak-tebakan kode link: banyak kode salah dari satu IP dalam waktu singkat = diblokir sementara.
// In-memory (per instance). Kode link sudah 72 bit acak, ini lapisan tambahan terhadap pemindaian otomatis.

const WINDOW_MS = 10 * 60_000;
const MAX_MISSES = 20;
// Halaman dan route API dibundel terpisah; globalThis menjaga satu penghitung yang sama untuk keduanya.
const globalStore = globalThis as unknown as { __guessMisses?: Map<string, number[]> };
const misses = (globalStore.__guessMisses ??= new Map<string, number[]>());

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

const recent = (ip: string, now: number) => (misses.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

export function isGuessBlocked(ip: string): boolean {
  return recent(ip, Date.now()).length >= MAX_MISSES;
}

export function recordMiss(ip: string): void {
  const now = Date.now();
  const list = recent(ip, now);
  list.push(now);
  misses.set(ip, list);
  if (misses.size > 5_000) for (const [key, times] of misses) if (!times.some((t) => now - t < WINDOW_MS)) misses.delete(key);
}
