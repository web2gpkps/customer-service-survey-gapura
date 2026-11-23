import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * GOOGLE_SERVICE_ACCOUNT in .env is a multi-line JSON wrapped in double quotes
 * that also contain double quotes, which dotenv cannot parse (it stops at the
 * first inner quote). Prefer process.env when it is valid JSON (e.g. on a
 * hosting platform), otherwise read the raw .env file and extract the object.
 */
function readRawEnvValue(key: string): string | undefined {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(/*turbopackIgnore: true*/ process.cwd(), file);
    if (!existsSync(full)) continue;
    const raw = readFileSync(full, "utf8");
    const json = raw.match(new RegExp(`^${key}\\s*=\\s*['"]?(\\{[\\s\\S]*?\\n?\\})\\s*['"]?\\s*$`, "m"));
    if (json) return json[1];
    const plain = raw.match(new RegExp(`^${key}\\s*=\\s*['"]?([^'"\\n]+)['"]?\\s*$`, "m"));
    if (plain) return plain[1].trim();
  }
  return undefined;
}

function tryParse(value: string | undefined): ServiceAccount | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.client_email && parsed?.private_key) return parsed;
  } catch {
    // fall through
  }
  return undefined;
}

export function getServiceAccount(): ServiceAccount {
  const account =
    tryParse(process.env.GOOGLE_SERVICE_ACCOUNT) ?? tryParse(readRawEnvValue("GOOGLE_SERVICE_ACCOUNT"));
  if (!account) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT tidak ditemukan atau bukan JSON service account yang valid.");
  }
  return { ...account, private_key: account.private_key.replace(/\\n/g, "\n") };
}

/** Sheet "Tracking Follow Up Index CSS JOUMPA" (terpisah dari sheet survei). Service account harus berstatus Editor di sini. */
export function getTrackerSheetId(): string {
  const id = process.env.TRACKER_SHEET_ID?.trim() || readRawEnvValue("TRACKER_SHEET_ID");
  if (!id) throw new Error("TRACKER_SHEET_ID belum diatur di .env.");
  return id;
}

export function getSheetId(): string {
  const fromEnv = process.env.GOOGLE_SHEET_ID?.trim();
  const id = fromEnv || readRawEnvValue("GOOGLE_SHEET_ID");
  if (!id) throw new Error("GOOGLE_SHEET_ID belum diatur di .env.");
  return id;
}
