// ============================================================
//  options-models.js — モデル管理タブのエントリポイント
//  共有状態 (currentModelPool, currentModelProviderKey) を保持し、
//  model-picker / model-form / model-list を束ねる。
// ============================================================
import { get, K } from "../infrastructure/storage.js";
import { fetchModelList } from "../domain/api.js";
import { PROVIDERS, generateId } from "./options-logic.js";
import { getVal, setVal, showStatus } from "./options-shared.js";
import * as picker from "./model-picker.js";
import * as form from "./model-form.js";
import * as list from "./model-list.js";

// ===== 共有状態 =====
let currentModelPool = [];
let currentModelProviderKey = "";

// 状態バインディング（sub-modules に getter/setter を公開）
picker.bindModelState({
  getPool: function () {
    return currentModelPool;
  },
  getProviderKey: function () {
    return currentModelProviderKey;
  }
});
form.bindFormState({
  setPool: function (v) {
    currentModelPool = v;
  },
  setProviderKey: function (v) {
    currentModelProviderKey = v;
  }
});
list.bindListHandlers({
  onEdit: form.editConfig,
  onDelete: list.deleteConfig
});

// ===== エントリポイント =====
export function initModelsTab() {
  picker.populateProviderSelect();
  picker.populateModelSelect("custom");
  picker.initModelFilterEvents();
  list.initListEvents();

  // プロバイダー変更ハンドラ
  document.getElementById("providerSelect").addEventListener("change", async function () {
    const key = this.value;
    const p = PROVIDERS[key];
    if (!p) return;
    setVal("apiUrl", p.apiUrl);
    setVal("temperature", p.temperature);
    currentModelPool = [];
    currentModelProviderKey = key;
    picker.resetModelFilter();
    picker.populateModelSelect(key);
    picker.setModelFilterVisible(key === "openrouter");
    setVal("apiModel", "");
    setVal("configLabel", "");
    setVal("extraParams", "");
    if (p.apiUrl) {
      const existingKey = await picker.findExistingApiKey(p.apiUrl);
      setVal("apiKey", existingKey);
      picker.updateApiKeyHint(p.apiUrl, !!existingKey);
    } else {
      setVal("apiKey", "");
      picker.updateApiKeyHint("", false);
    }
  });

  // モデル選択ハンドラ
  document.getElementById("modelSelect").addEventListener("change", function () {
    const modelId = this.value;
    if (!modelId) return;
    setVal("apiModel", modelId);
    const currentLabel = getVal("configLabel").trim();
    if (!currentLabel) {
      const opt = this.options[this.selectedIndex];
      const displayLabel = opt ? opt.textContent.split(" (")[0] : modelId;
      setVal("configLabel", displayLabel);
    }
    const opt = this.options[this.selectedIndex];
    if (opt) {
      const extra = opt.getAttribute("data-extra-params");
      if (extra) setVal("extraParams", extra);
    }
  });

  // モデル一覧取得ボタン
  document.getElementById("fetchModelsBtn").addEventListener("click", async function () {
    const apiUrl = getVal("apiUrl").trim();
    const apiKey = getVal("apiKey").trim();
    if (!apiUrl) {
      showStatus("apiStatus", "プロバイダーを選択するかURLを入力してください", true);
      return;
    }
    if (!apiKey) {
      showStatus("apiStatus", "モデル一覧取得にはAPIキーが必要です", true);
      return;
    }

    const btn = this;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "取得中...";
    const statusEl = document.getElementById("apiStatus");
    if (statusEl) statusEl.textContent = "";

    try {
      const models = await fetchModelList(apiUrl, apiKey);
      if (models.length === 0) {
        showStatus("apiStatus", "モデルが見つかりませんでした。手動で入力してください。", true);
        return;
      }
      const providerKey = getVal("providerSelect");
      const presetModels = (PROVIDERS[providerKey] && PROVIDERS[providerKey].models) || [];
      const seen = {};
      const merged = [];
      presetModels.forEach(function (m) {
        seen[m.id] = true;
        merged.push(m);
      });
      models.forEach(function (m) {
        if (seen[m.id]) return;
        seen[m.id] = true;
        merged.push(m);
      });
      currentModelPool = merged;
      currentModelProviderKey = providerKey;
      picker.refreshModelProviderFilter();
      picker.applyModelFilter();
      if (merged.length > 20) picker.setModelFilterVisible(true);
      showStatus("apiStatus", "✓ " + models.length + " 件のモデルを取得しました");
    } catch (e) {
      showStatus("apiStatus", "✗ " + (e.message || e), true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // ===== フォームボタン =====
  // 新規登録
  document.getElementById("saveConfigBtn").addEventListener("click", async function () {
    const config = form.buildConfigFromForm();
    if (!form.validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    config.id = generateId();
    configs.push(config);
    await form.saveConfigsAndRefresh(configs);
    form.clearApiForm();
    showStatus("apiStatus", "✓ 新規登録しました");
  });

  // 変更（上書き）
  document.getElementById("updateConfigBtn").addEventListener("click", async function () {
    const editingId = getVal("editingConfigId");
    if (!editingId) {
      showStatus("apiStatus", "編集中の設定がありません", true);
      return;
    }
    const config = form.buildConfigFromForm();
    if (!form.validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    const idx = configs.findIndex(function (c) {
      return c.id === editingId;
    });
    if (idx === -1) {
      showStatus("apiStatus", "対象の設定が見つかりません", true);
      return;
    }
    Object.assign(configs[idx], config);
    await form.saveConfigsAndRefresh(configs);
    form.clearApiForm();
    showStatus("apiStatus", "✓ 変更（上書き）しました");
  });

  // 新規として追加（複製）
  document.getElementById("duplicateConfigBtn").addEventListener("click", async function () {
    const config = form.buildConfigFromForm();
    if (!form.validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    config.id = generateId();
    configs.push(config);
    await form.saveConfigsAndRefresh(configs);
    showStatus("apiStatus", "✓ 新規として追加しました");
  });

  // キャンセル
  document.getElementById("cancelEditBtn").addEventListener("click", function () {
    form.clearApiForm();
  });

  // 初回描画
  list.renderModelList();
}

// switchTab から呼ばれる用（外部公開）
export { renderModelList } from "./model-list.js";
