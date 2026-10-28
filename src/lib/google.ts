import { JWT } from "google-auth-library";
import { getServiceAccount, getSheetId } from "./credentials";

export const SHEETS_READ = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const SHEETS_WRITE = "https://www.googleapis.com/auth/spreadsheets";

/** Header otorisasi dan URL dasar Google Sheets API. Scope tulis hanya dipakai untuk registri link cabang. */
export async function sheetsApi(scope: string = SHEETS_READ) {
  const account = getServiceAccount();
  const client = new JWT({ email: account.client_email, key: account.private_key, scopes: [scope] });
  const { token } = await client.getAccessToken();
  return {
    headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
    base: `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}`,
  };
}
