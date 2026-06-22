// ============================================================
//  model-label.js — モデル表示ラベル生成（純粋関数・テスト可能）
//  OpenRouter 経由: "(O)" + プロバイダプレフィックス除去
//  直API / カスタム: モデル id そのまま
// ============================================================

// providerKey: "deepseek" | "openrouter" | "openai" | "custom"
// model: { id: string, label?: string }
// 戻り値: 表示用ラベル文字列
//
// 例:
//   OpenRouter id="google/gemini-3.1-flash-lite" label="Google: Gemini 3.1 Flash Lite"
//     → "(O)Gemini 3.1 Flash Lite"
//   OpenRouter id="openai/gpt-4o" label="GPT-4o"
//     → "(O)GPT-4o"
//   OpenRouter id="deepseek/deepseek-chat"（label無し）
//     → "(O)deepseek-chat"
//   DeepSeek 直 id="deepseek-v4-flash"
//     → "deepseek-v4-flash"
//   OpenAI 直 id="gpt-4o"
//     → "gpt-4o"
export function buildModelDisplayLabel(providerKey, model) {
  const id = (model && model.id) || "";
  const name = (model && model.label) || "";
  if (providerKey === "openrouter") {
    let short = "";
    if (name) {
      // ":" でプロバイダプレフィックスを除去（"Google: Gemini..." → "Gemini..."）
      const colonIdx = name.indexOf(":");
      short = colonIdx !== -1 ? name.substring(colonIdx + 1).trim() : name.trim();
    } else if (id.indexOf("/") !== -1) {
      // id のスラッシュ以降（"google/gemini-..." → "gemini-..."）
      short = id.substring(id.indexOf("/") + 1);
    } else {
      short = id;
    }
    return "(O)" + short;
  }
  // 直API / カスタム: id をそのまま
  return id;
}
