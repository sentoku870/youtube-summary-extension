// ============================================================
//  options-migration.js — 旧形式のストレージを新形式へ変換
//  options-logic.js の convertLegacyToConfigs に委譲して I/O だけ担当。
// ============================================================
import { getAll, set, K } from "../infrastructure/storage.js";
import { convertLegacyToConfigs, generateId } from "./options-logic.js";

/**
 * 旧形式（apiConfig_<provider> / apiConfig）のデータを新形式（apiConfigs 配列）に変換。
 * DOMContentLoaded 時に options.js から呼ばれる。
 */
export async function migrateIfNeeded() {
  const result = await getAll();
  const newConfigs = convertLegacyToConfigs(result, generateId);
  if (newConfigs.length > 0) {
    await set({ [K.API_CONFIGS]: newConfigs });
  }
}
