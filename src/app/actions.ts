"use server";

import { clearSamplingCache } from "@/lib/sampling";
import { clearSheetCache } from "@/lib/sheets";

export async function refreshData() {
  clearSheetCache();
  clearSamplingCache();
}
