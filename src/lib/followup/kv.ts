/**
 * Penyimpanan kunci-nilai kecil untuk penjaga sinkronisasi (gerbang waktu dan kunci). Memakai Upstash Redis yang sama
 * dengan link cabang bila ada; tanpa itu (pengembangan lokal) memakai memori proses.
 */
const PREFIX = "joumpa:followup:";

const mem = (globalThis as unknown as { __followupKv?: Map<string, { v: string; exp: number }> });
const memory = (mem.__followupKv ??= new Map());

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function command(...args: (string | number)[]): Promise<unknown> {
  const u = upstash()!;
  const res = await fetch(u.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${u.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string };
  if (out.error) throw new Error(out.error);
  return out.result;
}

/** true bila kunci berhasil dibuat (belum ada). Kunci hilang sendiri setelah ttlMs. */
export async function setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
  if (upstash()) {
    try {
      return (await command("SET", PREFIX + key, value, "NX", "PX", ttlMs)) === "OK";
    } catch {
      // Redis gangguan: izinkan lanjut. Pembatas per instance di bawah tetap berlaku lewat memori.
    }
  }
  const now = Date.now();
  const cur = memory.get(key);
  if (cur && cur.exp > now) return false;
  memory.set(key, { v: value, exp: now + ttlMs });
  return true;
}

export async function release(key: string, value: string): Promise<void> {
  if (upstash()) {
    try {
      if ((await command("GET", PREFIX + key)) === value) await command("DEL", PREFIX + key);
    } catch {
      // kunci akan kedaluwarsa sendiri
    }
  }
  if (memory.get(key)?.v === value) memory.delete(key);
}
