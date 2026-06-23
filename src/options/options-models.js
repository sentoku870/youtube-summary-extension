// ============================================================
//  options-models.js — モデル管理タブ UI
//  プロバイダー選択、モデル取得/絞り込み、登録/編集/削除を担当。
//  window.* グローバルは廃止し、#modelList への event delegation に統一。
// ============================================================
import { get, set, K } from "../infrastructure/storage.js";
import { fetchModelList } from "../domain/api.js";
import { buildModelDisplayLabel } from "./model-label.js";
import { listModelProviders, filterModels } from "./model-filter.js";
import {
  PROVIDERS,
  generateId,
  detectProviderKey,
  cssEscape,
  validateFormValues,
  VALIDATION_ERRORS,
  buildConfig
} from "./options-logic.js";
import { getVal, setVal, showStatus } from "./options-shared.js";

// ===== バリデーションエラーメッセージのマッピング =====
const VALIDATION_MESSAGES = {};
VALIDATION_MESSAGES[VALIDATION_ERRORS.LABEL] = "ラベル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_KEY] = "APIキーを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_URL] = "APIエンドポイントURLを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_MODEL] = "モデル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.EXTRA_PARAMS_JSON] =
  "追加パラメータが正しいJSON形式ではありません";

// ===== モデルプール（フィルタ前の全モデル）のキャッシュ =====
// モデル取得時にキャッシュし、フィルタ変更時に再利用する。
// プロバイダー変更時はクリア。
let currentModelPool = [];
let currentModelProviderKey = "";

// ===== プロバイダー選択 UI の動的構築 =====
function populateProviderSelect() {
  const sel = document.getElementById("providerSelect");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(PROVIDERS).forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = PROVIDERS[key].label;
    sel.appendChild(opt);
  });
  // カスタムをデフォルト（手動入力）
  sel.value = "custom";
}

function populateModelSelect(providerKey, models) {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">（モデルを選択または手動入力）</option>';
  const list = models || (PROVIDERS[providerKey] && PROVIDERS[providerKey].models) || [];
  list.forEach(function (m) {
    const opt = document.createElement("option");
    opt.value = m.id;
    const displayLabel = buildModelDisplayLabel(providerKey, m);
    opt.textContent =
      displayLabel && displayLabel !== m.id
        ? displayLabel + " (" + m.id + ")"
        : displayLabel || m.id;
    opt.setAttribute("data-extra-params", m.extraParams || "");
    sel.appendChild(opt);
  });
  if (prev && sel.querySelector('option[value="' + cssEscape(prev) + '"]')) {
    sel.value = prev;
  }
}

// ===== 同一ホストの既存APIキーを検索 =====
async function findExistingApiKey(apiUrl) {
  if (!apiUrl) return "";
  const configs = (await get(K.API_CONFIGS)) || [];
  // 純粋ロジックは options-logic.js 経由（テスト容易性）
  // 動的 import すると循環参照になるため、関数内で再 import
  const { findExistingApiKeyByHost } = await import("./options-logic.js");
  return findExistingApiKeyByHost(apiUrl, configs);
}

function updateApiKeyHint(apiUrl, foundExisting) {
  const hint = document.getElementById("apiKeyHint");
  if (!hint) return;
  if (foundExisting) {
    hint.textContent = "✓ 同一ホストの登録済みAPIキーを自動入力しました（変更可能）";
    hint.style.color = "#2d8c3c";
  } else if (apiUrl) {
    hint.textContent = "このホストのAPIキーは未登録です。入力してください";
    hint.style.color = "#888";
  } else {
    hint.textContent = "";
  }
}

// ===== モデルフィルターUI =====
function setModelFilterVisible(visible) {
  const container = document.getElementById("modelFilterContainer");
  if (container) container.style.display = visible ? "block" : "none";
}

function resetModelFilter() {
  const providerSel = document.getElementById("modelProviderFilter");
  const keywordInput = document.getElementById("modelKeywordFilter");
  const note = document.getElementById("modelCountNote");
  if (providerSel) providerSel.innerHTML = '<option value="">すべて</option>';
  if (keywordInput) keywordInput.value = "";
  if (note) {
    note.textContent = "モデルを取得すると絞り込みできます";
    note.style.color = "#888";
  }
}

function refreshModelProviderFilter() {
  const sel = document.getElementById("modelProviderFilter");
  if (!sel) return;
  const providers = listModelProviders(currentModelPool);
  const prev = sel.value;
  sel.innerHTML = '<option value="">すべて</option>';
  providers.forEach(function (p) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
  if (prev && sel.querySelector('option[value="' + cssEscape(prev) + '"]')) {
    sel.value = prev;
  }
}

function applyModelFilter() {
  const providerFilter = getVal("modelProviderFilter");
  const keyword = getVal("modelKeywordFilter");
  const filtered = filterModels(currentModelProviderKey, currentModelPool, providerFilter, keyword);
  populateModelSelect(currentModelProviderKey, filtered);
  const note = document.getElementById("modelCountNote");
  if (note) {
    const total = currentModelPool.length;
    const shown = filtered.length;
    if (total === 0) {
      note.textContent = "モデルを取得すると絞り込みできます";
      note.style.color = "#888";
    } else if (shown === total) {
      note.textContent = shown + " 件（絞り込みなし）";
      note.style.color = "#888";
    } else {
      note.textContent = shown + " 件 / " + total + " 件";
      note.style.color = "#2d8c3c";
    }
  }
}

function initModelFilterEvents() {
  const providerSel = document.getElementById("modelProviderFilter");
  const keywordInput = document.getElementById("modelKeywordFilter");
  if (providerSel) {
    providerSel.addEventListener("change", applyModelFilter);
  }
  if (keywordInput) {
    // 入力毎にリアルタイム絞り込み
    keywordInput.addEventListener("input", applyModelFilter);
  }
}

// ===== ボタン表示切替 =====
function showEditButtons(isEditing) {
  document.getElementById("saveConfigBtn").style.display = isEditing ? "none" : "inline-block";
  document.getElementById("updateConfigBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("duplicateConfigBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("cancelEditBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("api-form-title").textContent = isEditing
    ? "✏️ API設定を編集"
    : "🔑 新規API設定を登録";
}

function clearApiForm() {
  setVal("editingConfigId", "");
  setVal("configLabel", "");
  setVal("apiKey", "");
  setVal("apiUrl", "");
  setVal("apiModel", "");
  setVal("temperature", "0.3");
  setVal("maxTokens", "4096");
  setVal("extraParams", "");
  showEditButtons(false);
  const providerSel = document.getElementById("providerSelect");
  const modelSel = document.getElementById("modelSelect");
  if (providerSel) providerSel.value = "custom";
  if (modelSel) {
    modelSel.innerHTML = '<option value="">（モデルを選択または手動入力）</option>';
  }
  currentModelPool = [];
  currentModelProviderKey = "";
  resetModelFilter();
  setModelFilterVisible(false);
  updateApiKeyHint("", false);
}

function buildConfigFromForm() {
  return buildConfig({
    label: getVal("configLabel"),
    apiKey: getVal("apiKey"),
    apiUrl: getVal("apiUrl"),
    apiModel: getVal("apiModel"),
    temperature: getVal("temperature"),
    maxTokens: getVal("maxTokens"),
    extraParams: getVal("extraParams")
  });
}

function validateForm(config) {
  const result = validateFormValues(config);
  if (!result.valid) {
    showStatus(
      "apiStatus",
      VALIDATION_MESSAGES[result.errorKey] || "入力内容を確認してください",
      true
    );
  }
  return result.valid;
}

async function saveConfigsAndRefresh(configs) {
  await set({ [K.API_CONFIGS]: configs });
  renderModelList();
  // ボタン選択肢の更新は循環参照を避けるため直接呼ぶ
  const { updateButtonModelSelects } = await import("./options-buttons.js");
  await updateButtonModelSelects();
}

// ===== モデル一覧の描画 + event delegation（D-2 適用） =====
async function renderModelList() {
  const listEl = document.getElementById("modelList");
  if (!listEl) return;
  const configs = (await get(K.API_CONFIGS)) || [];

  // 編集・削除は event delegation で 1 個のリスナーに統合
  // （render ごとに onclick を再代入する旧実装を廃止）
  listEl.innerHTML = "";
  if (configs.length === 0) {
    listEl.innerHTML =
      '<li class="empty-msg">まだ登録されていません。上のフォームから追加してください。</li>';
    return;
  }

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    const li = document.createElement("li");
    li.className = "model-item";

    const info = document.createElement("div");
    info.className = "model-info";
    const lbl = document.createElement("div");
    lbl.className = "label";
    lbl.textContent = c.label;
    info.appendChild(lbl);
    const det = document.createElement("div");
    det.className = "detail";
    det.textContent = "モデル: " + c.apiModel + " | " + c.apiUrl;
    info.appendChild(det);
    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "model-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "編集";
    editBtn.setAttribute("data-action", "edit");
    editBtn.setAttribute("data-config-id", c.id);
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "secondary";
    delBtn.style.background = "#d32f2f";
    delBtn.textContent = "削除";
    delBtn.setAttribute("data-action", "delete");
    delBtn.setAttribute("data-config-id", c.id);
    actions.appendChild(delBtn);

    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

// ===== 編集・削除ハンドラ（D-2: window.* → ローカル関数） =====
async function deleteConfig(id) {
  const configs = (await get(K.API_CONFIGS)) || [];
  const newConfigs = configs.filter(function (c) {
    return c.id !== id;
  });
  await set({ [K.API_CONFIGS]: newConfigs });
  showStatus("status", "✓ 削除しました");
  renderModelList();
  const { updateButtonModelSelects } = await import("./options-buttons.js");
  await updateButtonModelSelects();
}

async function editConfig(id) {
  const configs = (await get(K.API_CONFIGS)) || [];
  const config = configs.find(function (c) {
    return c.id === id;
  });
  if (!config) return;

  setVal("editingConfigId", id);
  setVal("configLabel", config.label || "");
  setVal("apiKey", config.apiKey || "");
  setVal("apiUrl", config.apiUrl || "");
  setVal("apiModel", config.apiModel || "");
  setVal("temperature", config.temperature || "0.3");
  setVal("maxTokens", config.maxTokens || "4096");
  setVal("extraParams", config.extraParams || "");

  const providerKey = detectProviderKey(config.apiUrl || "");
  const providerSel = document.getElementById("providerSelect");
  if (providerSel) providerSel.value = providerKey;
  currentModelPool = [];
  currentModelProviderKey = providerKey;
  resetModelFilter();
  setModelFilterVisible(providerKey === "openrouter");
  populateModelSelect(providerKey);
  const modelSel = document.getElementById("modelSelect");
  if (modelSel && config.apiModel) {
    let opt = modelSel.querySelector('option[value="' + cssEscape(config.apiModel) + '"]');
    if (!opt) {
      opt = document.createElement("option");
      opt.value = config.apiModel;
      opt.textContent = config.apiModel;
      opt.setAttribute("data-extra-params", config.extraParams || "");
      modelSel.appendChild(opt);
    }
    modelSel.value = config.apiModel;
  }
  updateApiKeyHint(config.apiUrl || "", !!config.apiKey);
  document.getElementById("api-form-title").textContent = "✏️ API設定を編集";
  showEditButtons(true);
}

// ===== イベント登録（DOMContentLoaded で呼ぶ） =====
export function initModelsTab() {
  populateProviderSelect();
  populateModelSelect("custom");
  initModelFilterEvents();

  // プロバイダー選択（URL・Temperature自動入力 + APIキー再利用）
  document.getElementById("providerSelect").addEventListener("change", async function () {
    const key = this.value;
    const p = PROVIDERS[key];
    if (!p) return;
    setVal("apiUrl", p.apiUrl);
    setVal("temperature", p.temperature);
    currentModelPool = [];
    currentModelProviderKey = key;
    resetModelFilter();
    populateModelSelect(key);
    setModelFilterVisible(key === "openrouter");
    setVal("apiModel", "");
    setVal("configLabel", "");
    setVal("extraParams", "");
    if (p.apiUrl) {
      const existingKey = await findExistingApiKey(p.apiUrl);
      setVal("apiKey", existingKey);
      updateApiKeyHint(p.apiUrl, !!existingKey);
    } else {
      setVal("apiKey", "");
      updateApiKeyHint("", false);
    }
  });

  // モデル選択（ラベル・モデル名・追加パラメータ自動入力）
  document.getElementById("modelSelect").addEventListener("change", function () {
    const modelId = this.value;
    if (!modelId) return;
    setVal("apiModel", modelId);
    const currentLabel = getVal("configLabel").trim();
    if (!currentLabel) {
      const opt = this.options[this.selectedIndex];
      // "(O)GPT-4o (openai/gpt-4o)" → "(O)GPT-4o"
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
      refreshModelProviderFilter();
      applyModelFilter();
      if (merged.length > 20) setModelFilterVisible(true);
      showStatus("apiStatus", "✓ " + models.length + " 件のモデルを取得しました");
    } catch (e) {
      showStatus("apiStatus", "✗ " + (e.message || e), true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // 新規登録
  document.getElementById("saveConfigBtn").addEventListener("click", async function () {
    const config = buildConfigFromForm();
    if (!validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    config.id = generateId();
    configs.push(config);
    await saveConfigsAndRefresh(configs);
    clearApiForm();
    showStatus("apiStatus", "✓ 新規登録しました");
  });

  // 変更（上書き）
  document.getElementById("updateConfigBtn").addEventListener("click", async function () {
    const editingId = getVal("editingConfigId");
    if (!editingId) {
      showStatus("apiStatus", "編集中の設定がありません", true);
      return;
    }
    const config = buildConfigFromForm();
    if (!validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    const idx = configs.findIndex(function (c) {
      return c.id === editingId;
    });
    if (idx === -1) {
      showStatus("apiStatus", "対象の設定が見つかりません", true);
      return;
    }
    Object.assign(configs[idx], config);
    await saveConfigsAndRefresh(configs);
    clearApiForm();
    showStatus("apiStatus", "✓ 変更（上書き）しました");
  });

  // 新規として追加（複製）
  document.getElementById("duplicateConfigBtn").addEventListener("click", async function () {
    const config = buildConfigFromForm();
    if (!validateForm(config)) return;
    const configs = (await get(K.API_CONFIGS)) || [];
    config.id = generateId();
    configs.push(config);
    await saveConfigsAndRefresh(configs);
    showStatus("apiStatus", "✓ 新規として追加しました");
  });

  // キャンセル
  document.getElementById("cancelEditBtn").addEventListener("click", function () {
    clearApiForm();
  });

  // 編集・削除ボタン（event delegation、D-2 適用）
  // renderModelList で生成される [data-action] ボタンを 1 個のリスナーで処理
  const listEl = document.getElementById("modelList");
  if (listEl) {
    listEl.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-config-id");
      if (!id) return;
      if (btn.dataset.action === "edit") editConfig(id);
      else if (btn.dataset.action === "delete") deleteConfig(id);
    });
  }

  // 初回描画
  renderModelList();
}

// switchTab から呼ばれる用（外部公開）
export { renderModelList };
