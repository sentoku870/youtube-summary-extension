// ============================================================
//  model-filter.js — モデル絞り込み（純粋関数・テスト可能）
//  プロバイダー（OpenRouterの "google/", "openai/" 等のスラッシュ前）と
//  キーワード（id/label の部分一致）でフィルタリングする
// ============================================================

// モデル id からプロバイダー名を抽出（OpenRouter の "provider/model" 形式を想定）
// スラッシュを含まない id は "(other)" を返す
export function extractModelProvider(modelId) {
  const id = String(modelId || "");
  const slashIdx = id.indexOf("/");
  if (slashIdx === -1) return "(other)";
  return id.substring(0, slashIdx);
}

// モデルリストからプロバイダー一覧を抽出（出現順、重複排除）
// 戻り値: ["openai", "anthropic", "google", "(other)", ...]
export function listModelProviders(models) {
  const seen = {};
  const result = [];
  (models || []).forEach(function (m) {
    if (!m || !m.id) return;
    const p = extractModelProvider(m.id);
    if (!seen[p]) {
      seen[p] = true;
      result.push(p);
    }
  });
  return result;
}

// 絞り込み条件でモデルをフィルタリング
//   providerKey: 現在選択中のOpenRouter等のプロバイダーキー（ラベル生成用）
//   models: フィルタ前の全モデル [{ id, label? }]
//   providerFilter: モデルプロバイダー名（"" ですべて）
//   keyword: キーワード文字列（"" ですべて、空白区切りでAND検索）
// 戻り値: フィルタ後のモデル配列
export function filterModels(providerKey, models, providerFilter, keyword) {
  const pf = (providerFilter || "").trim();
  const kw = (keyword || "").trim().toLowerCase();
  const kws = kw ? kw.split(/\s+/).filter(Boolean) : [];
  return (models || []).filter(function (m) {
    if (!m || !m.id) return false;
    // プロバイダーフィルター
    if (pf && extractModelProvider(m.id) !== pf) return false;
    // キーワードフィルター（AND検索、id と label の両方を対象）
    if (kws.length > 0) {
      const haystack = ((m.id || "") + " " + (m.label || "")).toLowerCase();
      for (let i = 0; i < kws.length; i++) {
        if (haystack.indexOf(kws[i]) === -1) return false;
      }
    }
    return true;
  });
}
