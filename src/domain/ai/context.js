// ============================================================
//  ai/context.js — 字幕整形・API 設定解決
//  ai.js から純粋関数・内部ヘルパを分離。
// ============================================================
import {
  loadBtnApiConfigId,
  loadApiConfigById,
  loadApiConfigs,
  loadCustomPrompt,
  getDefaultPrompt
} from "../../infrastructure/storage-config.js";
import { formatTranscriptWithTimestamps } from "../ai-utils.js";

/**
 * タブ ID に紐づく API 設定を解決する。
 * ボタン固有設定 → apiConfigs 先頭の順で探し、最初に見つかった
 * apiKey 付きのエントリを返す。
 *
 * @param {string} mode - タブ ID (summary / customA / customB)
 * @returns {Promise<object|null>}
 */
export async function resolveApiConfig(mode) {
  const configId = await loadBtnApiConfigId(mode);
  if (configId) {
    const config = await loadApiConfigById(configId);
    if (config && config.apiKey) return config;
  }
  const allConfigs = await loadApiConfigs();
  for (let i = 0; i < allConfigs.length; i++) {
    if (allConfigs[i].apiKey) return allConfigs[i];
  }
  return null;
}

/**
 * 字幕オブジェクトから LLM に渡す文字列を作る。
 * allTimestamps があれば [MM:SS] 付きに整形、なければ all を改行結合。
 * @param {object} transcript
 * @returns {string}
 */
export function resolveTranscriptText(transcript) {
  if (!transcript) return "";
  if (transcript.allTimestamps && transcript.allTimestamps.length > 0) {
    return formatTranscriptWithTimestamps(transcript.allTimestamps);
  }
  return (transcript.all || []).join("\n");
}

/**
 * タブ ID に対応する API 設定 + カスタムプロンプトを解決する。
 * @param {string} mode - タブ ID (summary / customA / customB)
 * @returns {Promise<{config: object, prompt: string}|null>}
 */
export async function fetchConfigAndPrompt(mode) {
  const [config, customPrompt] = await Promise.all([
    resolveApiConfig(mode),
    loadCustomPrompt(mode)
  ]);
  if (!config || !config.apiKey) return null;
  const prompt = customPrompt || getDefaultPrompt(mode);
  return { config: config, prompt: prompt };
}
