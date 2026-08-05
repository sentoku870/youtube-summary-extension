// tests/__helpers__/ai-test-helpers.cjs — tests/ai.test.js 専用セットアップヘルパ
//
// callAI() テスト用に重複していた setupState / setupConfigStorage を共通化する。

const { setWindowLocation } = require("./dom-mock.cjs");

/**
 * callAI 用の uiState / sessionState / window.location を初期化する。
 *
 * @param {object} U  uiState への参照
 * @param {object} S  sessionState への参照
 * @param {object} transcript  preloadedTranscript にセットする値
 */
function setupCallAIState(U, S, transcript) {
  U.activeTab = "summary";
  U.tabs = {
    summary: {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    }
  };
  S.abortController = null;
  S.videoMeta = null;
  S.transcriptText = "";
  S.preloadedTranscript = transcript;

  // saveSummaryCache が window.location.search を参照するため設定
  setWindowLocation({
    href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  });
}

/**
 * API設定とプロンプトの解決に成功するよう chrome.storage.local をモックする。
 * キー指定でも全件取得でも同じ db を返す（Promise.all 化で順序非依存）。
 *
 * @param {object} chrome  chrome ストレージモック
 * @param {object} [overrides] db の差分（テストごとに変える用）
 */
function setupCallAIConfigStorage(chrome, overrides) {
  const db = Object.assign(
    {
      apiConfigs: [{ id: "cfg1", apiKey: "key1", apiModel: "gpt-4", maxTokens: "4096" }],
      btnApiConfig_summary: "cfg1",
      prompt_summary: "カスタムプロンプト"
    },
    overrides || {}
  );
  chrome.storage.local.get.mockImplementation(async function (key) {
    if (key === null || key === undefined) return db;
    if (Object.prototype.hasOwnProperty.call(db, key)) {
      return { [key]: db[key] };
    }
    return {};
  });
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
}

module.exports = {
  setupCallAIState,
  setupCallAIConfigStorage
};
