// ============================================================
//  storage-cache.js — 要約キャッシュと latestSummary/captions（ESM版）
//  Phase A-2: storage.js から分割。
//  videoId 単位のメモリキャッシュ + 7日 TTL、chrome.storage への永続化を担当。
// ============================================================
import { get, set, remove, K } from "./storage-core.js";

// T2-C1: 同一 videoId のキャッシュをメモリに保持し、storage.get を 2 回目以降スキップ。
// chrome.storage への往復は体感で数ms〜数十ms かかるため、同じ動画を
// タブ切替や再生成で連続参照する場合に大きな短縮になる。
//
// ★ T3-C1: キャッシュキーを videoId 単位から (videoId, mode) 単位に変更。
// 旧実装では同一 videoId 内で summary / customA / customB のキャッシュが
// 共有されており、「A タブで要約を生成 → B タブをクリック」しただけで
// A の要約が B タブの content として誤表示される致命的なバグがあった。
// （B タブで再生成ボタンを押すと正常に動くのは、regenerate() が
//   loadCachedSummary を経由しないため。）
const summaryCacheMemory = new Map();
const SUMMARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCacheStorageKey(videoId, mode) {
  const safeMode = String(mode || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  return "summary_cache_" + videoId + "_" + safeMode;
}

function getMemoryKey(videoId, mode) {
  const safeMode = String(mode || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  return videoId + "|" + safeMode;
}

export async function saveToStorage(summary, captions) {
  await set({ [K.LATEST_SUMMARY]: summary, [K.LATEST_CAPTIONS]: captions });
}

export async function saveSummaryCache(videoId, mode, data) {
  if (!videoId) return;
  const key = getCacheStorageKey(videoId, mode);
  const memKey = getMemoryKey(videoId, mode);
  const value = {
    content: data.content,
    modelLabel: data.modelLabel,
    transcriptCount: data.transcriptCount,
    timestamp: Date.now()
  };
  summaryCacheMemory.set(memKey, value);
  await set({ [key]: value });
}

export async function loadSummaryCache(videoId, mode) {
  if (!videoId) return null;
  const memKey = getMemoryKey(videoId, mode);
  // 1) メモリキャッシュヒット
  const mem = summaryCacheMemory.get(memKey);
  if (mem) {
    if (Date.now() - mem.timestamp > SUMMARY_CACHE_TTL_MS) {
      summaryCacheMemory.delete(memKey);
      await remove(getCacheStorageKey(videoId, mode));
      return null;
    }
    return mem;
  }
  // 2) storage 取得
  const key = getCacheStorageKey(videoId, mode);
  const data = await get(key);
  if (!data) return null;
  if (Date.now() - data.timestamp > SUMMARY_CACHE_TTL_MS) {
    await remove(key);
    return null;
  }
  summaryCacheMemory.set(memKey, data);
  return data;
}

export async function clearSummaryCache(videoId, mode) {
  // mode 未指定なら videoId 配下の全モードを削除
  const modes = mode ? (Array.isArray(mode) ? mode : [mode]) : ["summary", "customA", "customB"];
  for (const m of modes) {
    summaryCacheMemory.delete(getMemoryKey(videoId, m));
    await remove(getCacheStorageKey(videoId, m));
  }
  // 後方互換: 旧キー (mode 無し) もクリア
  summaryCacheMemory.delete(videoId);
  await remove("summary_cache_" + videoId);
}

// テスト用: メモリキャッシュを全クリア
export function __resetSummaryCacheMemory() {
  summaryCacheMemory.clear();
}