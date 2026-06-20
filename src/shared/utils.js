// ============================================================
//  utils.js — 純粋関数（テスト可能なロジック）
//  Chrome拡張: window経由、Jest: module.exports経由で公開
// ============================================================

// ===== トークン見積もり =====
// 日本語: 1文字≒2トークン、英語: 1文字≒0.3トークン、その他: 1文字≒1トークン
function estimateTokens(text) {
  if (!text) return 0;
  let jpCount = 0;
  let enCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x3000 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF) || (code >= 0x20000 && code <= 0x2FFFF)) {
      jpCount++;
    } else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A) || code === 0x20 || code === 0x0A || code === 0x0D) {
      enCount++;
    } else {
      otherCount++;
    }
  }
  return Math.ceil(jpCount * 2 + enCount * 0.3 + otherCount);
}

// ===== モデルのデフォルトコンテキストウィンドウ =====
function getModelContextWindow(modelName) {
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
function getAvailableTokens(text, modelName) {
  const contextWindow = getModelContextWindow(modelName);
  return Math.floor(contextWindow * 0.8);
}

// ===== 字幕テキストをトークン制限内でチャンク分割 =====
function splitIntoChunks(text, maxTokens) {
  if (!text) return [];
  const lines = text.split("\n");
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line) + 1;
    if (currentTokens + lineTokens > maxTokens && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [line];
      currentTokens = lineTokens;
    } else {
      current.push(line);
      currentTokens += lineTokens;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }
  return chunks;
}

// Chrome拡張用: window経由で公開（Jest環境ではwindow未定義のためガード）
if (typeof window !== "undefined") {
  window.estimateTokens = estimateTokens;
  window.getModelContextWindow = getModelContextWindow;
  window.getAvailableTokens = getAvailableTokens;
  window.splitIntoChunks = splitIntoChunks;
}

// Jest用: module.exportsで公開
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    estimateTokens,
    getModelContextWindow,
    getAvailableTokens,
    splitIntoChunks
  };
}
