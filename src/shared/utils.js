// ============================================================
//  utils.js — 純粋関数（テスト可能なロジック・ESM版）
//  estimateTokens / チャンク分割 / コンテキストウィンドウ估算
// ============================================================
import { CONTEXT_WINDOW_USABLE_RATIO, MIN_USABLE_TOKENS } from "./constants.js";

// ===== トークン見積もり =====
// 日本語/ハングル: 1文字≒2トークン、英語: 1文字≒0.3トークン、その他: 1文字≒1トークン
// for...of でコードポイント単位（サロゲートペア対応）で走査する。
export function estimateTokens(text) {
  if (!text) return 0;
  let jpCount = 0;
  let enCount = 0;
  let otherCount = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (
      // CJK統合漢字/拡張/互換
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x20000 && code <= 0x2ffff) ||
      // ハングル（韓国語も日本語並みのトークン消費）
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      jpCount++;
    } else if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      code === 0x20 ||
      code === 0x0a ||
      code === 0x0d
    ) {
      enCount++;
    } else {
      otherCount++;
    }
  }
  return Math.ceil(jpCount * 2 + enCount * 0.3 + otherCount);
}

// ===== モデルのデフォルトコンテキストウィンドウ =====
export function getModelContextWindow(modelName) {
  const name = (modelName || "").toLowerCase();
  if (name.indexOf("gpt-4o") !== -1 || name.indexOf("gpt-4-turbo") !== -1) return 128000;
  if (name.indexOf("gpt-4") !== -1) return 8192;
  if (name.indexOf("gpt-3.5") !== -1) return 16384;
  if (name.indexOf("claude-3.5") !== -1 || name.indexOf("claude-3") !== -1) return 200000;
  if (name.indexOf("deepseek") !== -1) return 1000000;
  if (name.indexOf("gemini") !== -1) return 1000000;
  if (name.indexOf("command") !== -1) return 128000;
  return 32000;
}

// ===== 利用可能トークン数 =====
// contextWindow の80%から、出力予約分（max_tokens）を差し引いた量を
// 入力に使えるトークン量とする。入力と出力は同じ contextWindow を
// 共有するため、これを引かないとコンテキストオーバーフローでAPIエラーになる。
// 第1引数 _text は将来の精度向上用フック（現状は未使用）。
// 第3引数 maxTokens は設定された出力最大トークン（文字列 or 数値）。
export function getAvailableTokens(_text, modelName, maxTokens) {
  const contextWindow = getModelContextWindow(modelName);
  const usable = Math.floor(contextWindow * CONTEXT_WINDOW_USABLE_RATIO);
  const outputReserve = parseInt(maxTokens, 10);
  const reserved = Number.isFinite(outputReserve) && outputReserve > 0 ? outputReserve : 0;
  return Math.max(usable - reserved, MIN_USABLE_TOKENS);
}

// ===== 1行をトークン制限内で強制分割（巨大行対策） =====
// トークン見積もりは文字種ベースのため厳密ではないが、
// 巨大行が1チャンクにまるごと入ってAPI上限を超える事態を防ぐ。
function splitOversizedLine(line, maxTokens) {
  const lineTokens = estimateTokens(line);
  if (lineTokens <= maxTokens) return [line];

  // 文字数ベースで逆算して安全な上限文字数を決める
  // （1文字あたり最大2トークンと見なして余裕を持たせる）
  const safeChars = Math.max(1, Math.floor(maxTokens / 2));
  const result = [];
  for (let i = 0; i < line.length; i += safeChars) {
    result.push(line.substring(i, i + safeChars));
  }
  return result;
}

// ===== YouTube動画ページ判定（ホスト名＋パスで厳密判定） =====
// 偽陽性（第三者サイトのクエリ文字列に "youtube.com/watch" が含まれる等）を防ぐため、
// URL オブジェクトで hostname / pathname を検証する。
export function isYouTubeWatchPage(href) {
  if (!href) return false;
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (
    url.hostname !== "www.youtube.com" &&
    url.hostname !== "youtube.com" &&
    url.hostname !== "m.youtube.com"
  ) {
    return false;
  }
  // /watch?v=... または /shorts/<id> を動画ページとみなす
  if (url.pathname === "/watch") return true;
  if (url.pathname.indexOf("/shorts/") === 0) return true;
  return false;
}

// ===== 字幕テキストをトークン制限内でチャンク分割 =====
export function splitIntoChunks(text, maxTokens) {
  if (!text) return [];
  const safeMax = Math.max(1, maxTokens);
  const lines = text.split("\n");
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    // 巨大行は事前に分割してから投入
    const subLines = splitOversizedLine(lines[i], safeMax);
    for (let j = 0; j < subLines.length; j++) {
      const subLine = subLines[j];
      const lineTokens = estimateTokens(subLine) + 1; // +1 は改行分
      // 収まらない場合は現在のチャンクを確定して新チャンクへ
      if (currentTokens + lineTokens > safeMax && current.length > 0) {
        chunks.push(current.join("\n"));
        current = [subLine];
        currentTokens = lineTokens;
      } else {
        current.push(subLine);
        currentTokens += lineTokens;
      }
    }
  }
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }
  return chunks;
}
