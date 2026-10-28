import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// Penyimpanan link akses cabang (sama dengan Airline). Produksi memakai Upstash Redis (REST); tanpa kredensial
// Upstash, pengembangan lokal memakai berkas JSON (.data/). Di Vercel berkas tidak bisa ditulis, jadi tanpa
// Upstash pembuatan link gagal dengan pesan jelas, bukan diam-diam hilang.

export interface ShareLink {
  code: string;
  createdAt: string;
  revokedAt?: string;
  /** Link berhenti berlaku setelah waktu ini; kosong = tanpa batas. */
  expiresAt?: string;
}

export const isExpired = (link: ShareLink, now = Date.now()) => !!link.expiresAt && Date.parse(link.expiresAt) <= now;
export const isDead = (link: ShareLink, now = Date.now()) => !!link.revokedAt || isExpired(link, now);

export const CODE_PATTERN = /^[A-Za-z0-9_-]{10,16}$/;
const LIST_LIMIT = 200;
// Awalan kunci supaya Redis yang sama bisa dipakai bersama proyek lain tanpa tercampur.
const PREFIX = "joumpa:";

export class ShareStoreError extends Error {}

interface Store {
  create(link: ShareLink): Promise<void>;
  get(code: string): Promise<ShareLink | null>;
  list(): Promise<ShareLink[]>;
  update(link: ShareLink): Promise<void>;
  remove(code: string): Promise<void>;
}

// ---------- Upstash Redis (REST) ----------

function upstashStore(url: string, token: string): Store {
  const call = async (path: string, body: unknown): Promise<unknown> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(4_000),
        });
        if (!res.ok) throw new Error(`Upstash ${res.status}`);
        return await res.json();
      } catch (err) {
        lastError = err;
      }
    }
    throw new ShareStoreError(`Penyimpanan link tidak merespons: ${lastError instanceof Error ? lastError.message : lastError}`);
  };
  const command = async (...args: string[]) => {
    const out = (await call("", args)) as { result?: unknown; error?: string };
    if (out.error) throw new ShareStoreError(out.error);
    return out.result;
  };
  const key = (code: string) => `${PREFIX}share:link:${code}`;
  const index = `${PREFIX}share:index`;
  const parse = (raw: unknown): ShareLink | null => {
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as ShareLink;
    } catch {
      return null;
    }
  };

  return {
    async create(link) {
      const out = (await call("/pipeline", [
        ["SET", key(link.code), JSON.stringify(link), "NX"],
        ["LPUSH", index, link.code],
      ])) as { result?: unknown; error?: string }[];
      if (out.some((o) => o.error) || out[0]?.result !== "OK") throw new ShareStoreError("Gagal menyimpan link.");
    },
    async get(code) {
      return parse(await command("GET", key(code)));
    },
    async list() {
      const codes = (await command("LRANGE", index, "0", String(LIST_LIMIT - 1))) as string[];
      if (!codes?.length) return [];
      const raws = (await command("MGET", ...codes.map(key))) as unknown[];
      return raws.map(parse).filter((l): l is ShareLink => l !== null);
    },
    async update(link) {
      await command("SET", key(link.code), JSON.stringify(link));
    },
    async remove(code) {
      await call("/pipeline", [
        ["DEL", key(code)],
        ["LREM", index, "0", code],
      ]);
    },
  };
}

// ---------- Berkas JSON (khusus lokal) ----------

function fileStore(): Store {
  const file = path.join(process.cwd(), ".data", "share-links.json");
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };
  const load = async (): Promise<ShareLink[]> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as ShareLink[];
    } catch {
      return [];
    }
  };
  const save = async (links: ShareLink[]) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(links, null, 2), "utf8");
  };
  return {
    create: (link) => serial(async () => save([link, ...(await load())])),
    get: async (code) => (await load()).find((l) => l.code === code) ?? null,
    list: async () => (await load()).slice(0, LIST_LIMIT),
    update: (link) => serial(async () => save((await load()).map((l) => (l.code === link.code ? link : l)))),
    remove: (code) => serial(async () => save((await load()).filter((l) => l.code !== code))),
  };
}

let store: Store | null = null;
function getStore(): Store {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return (store = upstashStore(url, token));
  if (process.env.VERCEL) throw new ShareStoreError("Penyimpanan link belum dikonfigurasi (Upstash Redis).");
  return (store = fileStore());
}

// ---------- API ----------

// Salinan terakhir yang diketahui. Bila Upstash sempat gangguan, link yang sebelumnya sah tetap terbuka
// sampai 10 menit; link yang sudah diputus tetap tertutup. Di luar itu kegagalan = tertutup (aman).
const STALE_OK_MS = 10 * 60_000;
const globalCache = globalThis as unknown as { __joumpaLastKnown?: Map<string, { link: ShareLink; at: number }> };
const lastKnown = (globalCache.__joumpaLastKnown ??= new Map());
const remember = (link: ShareLink) => {
  lastKnown.set(link.code, { link, at: Date.now() });
  if (lastKnown.size > 500) lastKnown.delete(lastKnown.keys().next().value as string);
};

export async function createLink(expiresAt?: string): Promise<ShareLink> {
  const link: ShareLink = { code: randomBytes(9).toString("base64url"), createdAt: new Date().toISOString(), ...(expiresAt && { expiresAt }) };
  await getStore().create(link);
  remember(link);
  return link;
}

/** Mengembalikan null bila link tidak ada. Melempar ShareStoreError bila penyimpanan tidak bisa dihubungi. */
export async function getLink(code: string): Promise<ShareLink | null> {
  if (!CODE_PATTERN.test(code)) return null;
  try {
    const link = await getStore().get(code);
    if (link) remember(link);
    return link;
  } catch (err) {
    const cached = lastKnown.get(code);
    if (cached && Date.now() - cached.at < STALE_OK_MS) return cached.link;
    throw err instanceof ShareStoreError ? err : new ShareStoreError("Penyimpanan link bermasalah.");
  }
}

export async function listLinks(): Promise<ShareLink[]> {
  return getStore().list();
}

export async function revokeLink(code: string): Promise<boolean> {
  if (!CODE_PATTERN.test(code)) return false;
  const s = getStore();
  const link = await s.get(code);
  if (!link) return false;
  if (!link.revokedAt) {
    link.revokedAt = new Date().toISOString();
    await s.update(link);
  }
  remember(link);
  return true;
}

/** Menghapus link yang sudah tidak aktif (diputus atau kedaluwarsa). Link yang masih aktif tidak pernah dihapus di sini. */
export async function deleteInactiveLink(code: string): Promise<boolean> {
  if (!CODE_PATTERN.test(code)) return false;
  const s = getStore();
  const link = await s.get(code);
  if (!link || !isDead(link)) return false;
  await s.remove(code);
  lastKnown.delete(code);
  return true;
}

export async function deleteAllInactiveLinks(): Promise<number> {
  let removed = 0;
  for (const l of (await listLinks()).filter((l) => isDead(l))) if (await deleteInactiveLink(l.code)) removed++;
  return removed;
}
