// ============================================================
//  model-filter.js — モデル絞り込み・ホスト抽出（純粋関数・テスト可能）
// ============================================================

// ===== カード一覧をラベル/モデル/ホストで絞り込み（純粋関数） =====
// configs: [{ label, apiModel, apiUrl, ... }]
// keyword: スペース区切りで AND 検索、大文字小文字無視
export function filterConfigCards(configs, keyword) {
  if (!Array.isArray(configs)) return [];
  const kw = (keyword || "").trim().toLowerCase();
  if (!kw) return configs.slice();
  const kws = kw.split(/\s+/).filter(Boolean);
  return configs.filter(function (c) {
    if (!c) return false;
    const haystack = (
      (c.label || "") +
      " " +
      (c.apiModel || "") +
      " " +
      (c.apiUrl || "")
    ).toLowerCase();
    for (let i = 0; i < kws.length; i++) {
      if (haystack.indexOf(kws[i]) === -1) return false;
    }
    return true;
  });
}

// ===== URL からホスト部分（パス抜き）を抽出（表示用） =====
export function extractHost(apiUrl) {
  if (!apiUrl) return "";
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl;
  }
}
