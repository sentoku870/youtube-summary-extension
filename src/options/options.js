// ============================================================
//  options.js — オプション画面のロジック（ESM版）
//  storage.js 経由で chrome.storage にアクセス（キー重複定義を解消）
// ============================================================
import { get, set, getAll, K } from "../infrastructure/storage.js";
import { fetchModelList } from "../domain/api.js";
import { buildModelDisplayLabel } from "./model-label.js";
import { listModelProviders, filterModels } from "./model-filter.js";

// ===== プロバイダープリセット（プロバイダー → モデルの2段階選択） =====
// 各プロバイダーには代表的なデフォルトモデルを内蔵。
// 「モデル一覧を取得」ボタンで /models から最新モデルを動的に取得可能。
const PROVIDERS = {
  deepseek: {
    label: "DeepSeek（直API）",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", extraParams: "" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", extraParams: '{"thinking": {"type": "disabled"}}' }
    ]
  },
  openrouter: {
    label: "OpenRouter",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "openai/gpt-4o", label: "GPT-4o", extraParams: "" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", extraParams: "" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", extraParams: "" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)", extraParams: "" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", extraParams: "" }
    ]
  },
  openai: {
    label: "OpenAI（直API）",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "gpt-4o", label: "GPT-4o", extraParams: "" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", extraParams: "" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", extraParams: "" }
    ]
  },
  custom: {
    label: "カスタム（手動入力）",
    apiUrl: "",
    temperature: "0.3",
    models: []
  }
};

// ===== ユーティリティ =====
let idCounter = 0;
function generateId() {
  return "cfg_" + (++idCounter) + "_" + Date.now().toString(36);
}
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val || ""; }
function showStatus(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#d32f2f" : "#2d8c3c";
  if (!isError) setTimeout(function() { el.textContent = ""; }, 2000);
}

// ストレージキー文字列を生成するヘルパー（K 定数経由）
function promptKey(type) { return K.PROMPT_PREFIX + type; }
function btnTitleKey(type) { return K.BTN_TITLE_PREFIX + type; }
function btnApiConfigKey(type) { return K.BTN_API_PREFIX + type; }

// ===== プロバイダー選択 UI の動的構築（HTML ハードコードとの二重管理を解消） =====
function populateProviderSelect() {
  const sel = document.getElementById("providerSelect");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(PROVIDERS).forEach(function(key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = PROVIDERS[key].label;
    sel.appendChild(opt);
  });
  // カスタムをデフォルト（手動入力）
  sel.value = "custom";
}

// ===== モデル表示ラベル生成（model-label.js から提供） =====
// OpenRouter 経由: "(O)" + プロバイダプレフィックス除去
// 直API / カスタム: モデル id をそのまま
// 詳細は src/options/model-label.js を参照

// ===== モデルプール（フィルタ前の全モデル）のキャッシュ =====
// モデル取得時にキャッシュし、フィルタ変更時に再利用する。
// プロバイダー変更時はクリア。
let currentModelPool = [];
let currentModelProviderKey = "";

function populateModelSelect(providerKey, models) {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">（モデルを選択または手動入力）</option>';
  const list = models || (PROVIDERS[providerKey] && PROVIDERS[providerKey].models) || [];
  list.forEach(function(m) {
    const opt = document.createElement("option");
    opt.value = m.id;
    const displayLabel = buildModelDisplayLabel(providerKey, m);
    // 表示ラベルとidが同じ場合は重複表示しない
    opt.textContent = (displayLabel && displayLabel !== m.id)
      ? displayLabel + " (" + m.id + ")"
      : (displayLabel || m.id);
    opt.setAttribute("data-extra-params", m.extraParams || "");
    sel.appendChild(opt);
  });
  // 動的取得時に前回値を保持
  if (prev && sel.querySelector('option[value="' + cssEscape(prev) + '"]')) {
    sel.value = prev;
  }
}

// ===== 同一ホストの既存APIキーを検索（再入力不要化） =====
async function findExistingApiKey(apiUrl) {
  if (!apiUrl) return "";
  let host = "";
  try { host = new URL(apiUrl).hostname; } catch (e) { return ""; }
  if (!host) return "";
  const configs = await get(K.API_CONFIGS) || [];
  for (let i = 0; i < configs.length; i++) {
    if (!configs[i].apiKey) continue;
    try {
      if (new URL(configs[i].apiUrl).hostname === host) {
        return configs[i].apiKey;
      }
    } catch (e) { /* 不正URLは無視 */ }
  }
  return "";
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

// ===== モデルフィルターUI の表示制御 =====
// OpenRouter のようにモデル数が多いプロバイダーでのみ表示。
// プロバイダー変更やフォームクリア時にリセットされる。
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

// プール内のプロバイダー一覧でフィルターのドロップダウンを更新
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

// 現在のフィルター条件でモデルセレクトを再描画
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

// フィルターUI のイベントリスナー
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

// ===== プロバイダー選択イベント（URL・Temperature自動入力 + APIキー再利用） =====
document.getElementById("providerSelect").addEventListener("change", async function() {
  const key = this.value;
  const p = PROVIDERS[key];
  if (!p) return;
  setVal("apiUrl", p.apiUrl);
  setVal("temperature", p.temperature);
  // モデルプールとフィルターをリセット
  currentModelPool = [];
  currentModelProviderKey = key;
  resetModelFilter();
  populateModelSelect(key);
  // OpenRouter（モデル数が多い）でのみフィルターUIを表示
  setModelFilterVisible(key === "openrouter");
  // プロバイダー変更時は一旦モデル入力欄をクリア
  setVal("apiModel", "");
  setVal("configLabel", "");
  setVal("extraParams", "");
  // 同一ホストのAPIキーがあれば再利用
  if (p.apiUrl) {
    const existingKey = await findExistingApiKey(p.apiUrl);
    setVal("apiKey", existingKey);
    updateApiKeyHint(p.apiUrl, !!existingKey);
  } else {
    setVal("apiKey", "");
    updateApiKeyHint("", false);
  }
});

// ===== モデル選択イベント（ラベル・モデル名・追加パラメータ自動入力） =====
document.getElementById("modelSelect").addEventListener("change", function() {
  const providerKey = getVal("providerSelect");
  const modelId = this.value;
  if (!modelId) return;
  setVal("apiModel", modelId);
  // ラベルが空なら短縮表示ラベルをそのままセット
  const currentLabel = getVal("configLabel").trim();
  if (!currentLabel) {
    const sel = this;
    const opt = sel.options[sel.selectedIndex];
    // "(O)GPT-4o (openai/gpt-4o)" → "(O)GPT-4o"
    const displayLabel = opt ? opt.textContent.split(" (")[0] : modelId;
    setVal("configLabel", displayLabel);
  }
  // 追加パラメータがモデルに紐付けられていれば自動入力
  const opt = this.options[this.selectedIndex];
  if (opt) {
    const extra = opt.getAttribute("data-extra-params");
    if (extra) setVal("extraParams", extra);
  }
});

// ===== モデル一覧取得ボタン（/models 動的取得） =====
document.getElementById("fetchModelsBtn").addEventListener("click", async function() {
  const apiUrl = getVal("apiUrl").trim();
  const apiKey = getVal("apiKey").trim();
  const statusEl = document.getElementById("apiStatus");
  if (!apiUrl) { showStatus("apiStatus", "プロバイダーを選択するかURLを入力してください", true); return; }
  if (!apiKey) { showStatus("apiStatus", "モデル一覧取得にはAPIキーが必要です", true); return; }

  const btn = this;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "取得中...";
  if (statusEl) statusEl.textContent = "";

  try {
    const models = await fetchModelList(apiUrl, apiKey);
    if (models.length === 0) {
      showStatus("apiStatus", "モデルが見つかりませんでした。手動で入力してください。", true);
      return;
    }
    // 既存のプリセットモデル + 取得モデル を統合（重複排除）
    const providerKey = getVal("providerSelect");
    const presetModels = (PROVIDERS[providerKey] && PROVIDERS[providerKey].models) || [];
    const seen = {};
    const merged = [];
    presetModels.forEach(function(m) { seen[m.id] = true; merged.push(m); });
    models.forEach(function(m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      merged.push(m);
    });
    // モデルプールにキャッシュし、フィルターUIを更新して反映
    currentModelPool = merged;
    currentModelProviderKey = providerKey;
    refreshModelProviderFilter();
    applyModelFilter();
    // 取得モデル数が多い場合はフィルターUIを表示（プロバイダー非依存）
    if (merged.length > 20) setModelFilterVisible(true);
    showStatus("apiStatus", "✓ " + models.length + " 件のモデルを取得しました");
  } catch (e) {
    showStatus("apiStatus", "✗ " + (e.message || e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// ===== 削除 =====
window.deleteConfig = async function(id) {
  const configs = await get(K.API_CONFIGS) || [];
  const newConfigs = configs.filter(function(c) { return c.id !== id; });
  await set({ [K.API_CONFIGS]: newConfigs });
  showStatus("status", "✓ 削除しました");
  renderModelList();
  updateButtonModelSelects();
};

// ===== 編集 =====
window.editConfig = async function(id) {
  const configs = await get(K.API_CONFIGS) || [];
  let config = null;
  for (let i = 0; i < configs.length; i++) {
    if (configs[i].id === id) { config = configs[i]; break; }
  }
  if (!config) return;

  setVal("editingConfigId", id);
  setVal("configLabel", config.label || "");
  setVal("apiKey", config.apiKey || "");
  setVal("apiUrl", config.apiUrl || "");
  setVal("apiModel", config.apiModel || "");
  setVal("temperature", config.temperature || "0.3");
  setVal("maxTokens", config.maxTokens || "4096");
  setVal("extraParams", config.extraParams || "");

  // 保存された apiUrl からプロバイダーを自動判別
  const providerKey = detectProviderKey(config.apiUrl || "");
  const providerSel = document.getElementById("providerSelect");
  if (providerSel) providerSel.value = providerKey;
  // 編集時はモデルプール・フィルターを空にして表示（取得し直し可能）
  currentModelPool = [];
  currentModelProviderKey = providerKey;
  resetModelFilter();
  setModelFilterVisible(providerKey === "openrouter");
  populateModelSelect(providerKey);
  // モデルがモデル選択肢に無ければ追加して選択
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
  // APIキーは登録済み（編集なので）→ ヒント表示
  updateApiKeyHint(config.apiUrl || "", !!config.apiKey);

  document.getElementById("api-form-title").textContent = "✏️ API設定を編集";
  showEditButtons(true);
};

// ===== apiUrl からプロバイダーキーを推定 =====
function detectProviderKey(apiUrl) {
  if (!apiUrl) return "custom";
  try {
    const host = new URL(apiUrl).hostname;
    if (host === "api.deepseek.com") return "deepseek";
    if (host === "openrouter.ai") return "openrouter";
    if (host === "api.openai.com") return "openai";
  } catch (e) { /* fallthrough */ }
  return "custom";
}

// CSS セレクタの特殊文字をエスケープ（モデルIDに "/" が含まれる場合のため）
function cssEscape(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

// ===== アコーディオン初期化（DOMContentLoadedで実行） =====
function initAccordion() {
  document.querySelectorAll(".accordion-header").forEach(function(header) {
    header.addEventListener("click", function() {
      const body = this.nextElementSibling;
      if (!body) return;
      const isOpen = body.classList.contains("open");
      if (isOpen) {
        body.classList.remove("open");
        this.classList.remove("open");
      } else {
        body.classList.add("open");
        this.classList.add("open");
      }
    });
  });
}

// ===== タブ切り替え（3タブ版） =====
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  document.querySelector('[data-tab="' + tabId + '"]').classList.add("active");
  document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
  document.getElementById(tabId).classList.add("active");
  if (tabId === "tab-models") renderModelList();
  if (tabId === "tab-buttons") updateButtonModelSelects();
}

document.querySelectorAll(".tab-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    const tabId = btn.getAttribute("data-tab");
    switchTab(tabId);
  });
});

// ===== ボタン表示切替 =====
function showEditButtons(isEditing) {
  document.getElementById("saveConfigBtn").style.display = isEditing ? "none" : "inline-block";
  document.getElementById("updateConfigBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("duplicateConfigBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("cancelEditBtn").style.display = isEditing ? "inline-block" : "none";
  document.getElementById("api-form-title").textContent = isEditing ? "✏️ API設定を編集" : "🔑 新規API設定を登録";
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
  // プロバイダー/モデル選択もリセット
  const providerSel = document.getElementById("providerSelect");
  const modelSel = document.getElementById("modelSelect");
  if (providerSel) providerSel.value = "custom";
  if (modelSel) {
    modelSel.innerHTML = '<option value="">（モデルを選択または手動入力）</option>';
  }
  // モデルプール・フィルターもリセット
  currentModelPool = [];
  currentModelProviderKey = "";
  resetModelFilter();
  setModelFilterVisible(false);
  updateApiKeyHint("", false);
}

function buildConfigFromForm() {
  return {
    label: getVal("configLabel").trim(),
    apiKey: getVal("apiKey").trim(),
    apiUrl: getVal("apiUrl").trim(),
    apiModel: getVal("apiModel").trim(),
    temperature: getVal("temperature") || "0.3",
    maxTokens: getVal("maxTokens") || "4096",
    extraParams: getVal("extraParams").trim()
  };
}

function validateForm(config) {
  if (!config.label) { showStatus("apiStatus", "ラベル名を入力してください", true); return false; }
  if (!config.apiKey) { showStatus("apiStatus", "APIキーを入力してください", true); return false; }
  if (!config.apiUrl) { showStatus("apiStatus", "APIエンドポイントURLを入力してください", true); return false; }
  if (!config.apiModel) { showStatus("apiStatus", "モデル名を入力してください", true); return false; }
  if (config.extraParams) {
    try { JSON.parse(config.extraParams); } catch (e) { showStatus("apiStatus", "追加パラメータが正しいJSON形式ではありません", true); return false; }
  }
  return true;
}

async function saveConfigsAndRefresh(configs) {
  await set({ [K.API_CONFIGS]: configs });
  renderModelList();
  updateButtonModelSelects();
}

// ===== 新規登録 =====
document.getElementById("saveConfigBtn").addEventListener("click", async function() {
  const config = buildConfigFromForm();
  if (!validateForm(config)) return;
  const configs = await get(K.API_CONFIGS) || [];
  config.id = generateId();
  configs.push(config);
  await saveConfigsAndRefresh(configs);
  clearApiForm();
  showStatus("apiStatus", "✓ 新規登録しました");
});

// ===== 変更（上書き） =====
document.getElementById("updateConfigBtn").addEventListener("click", async function() {
  const editingId = getVal("editingConfigId");
  if (!editingId) { showStatus("apiStatus", "編集中の設定がありません", true); return; }
  const config = buildConfigFromForm();
  if (!validateForm(config)) return;
  const configs = await get(K.API_CONFIGS) || [];
  let found = false;
  for (let i = 0; i < configs.length; i++) {
    if (configs[i].id === editingId) {
      Object.assign(configs[i], config);
      found = true; break;
    }
  }
  if (!found) { showStatus("apiStatus", "対象の設定が見つかりません", true); return; }
  await saveConfigsAndRefresh(configs);
  clearApiForm();
  showStatus("apiStatus", "✓ 変更（上書き）しました");
});

// ===== 新規として追加（複製） =====
document.getElementById("duplicateConfigBtn").addEventListener("click", async function() {
  const config = buildConfigFromForm();
  if (!validateForm(config)) return;
  const configs = await get(K.API_CONFIGS) || [];
  config.id = generateId();
  configs.push(config);
  await saveConfigsAndRefresh(configs);
  showStatus("apiStatus", "✓ 新規として追加しました");
});

// ===== キャンセル =====
document.getElementById("cancelEditBtn").addEventListener("click", function() {
  clearApiForm();
});

// ===== モデル一覧の描画 =====
async function renderModelList() {
  const listEl = document.getElementById("modelList");
  if (!listEl) return;
  const configs = await get(K.API_CONFIGS) || [];

  listEl.innerHTML = "";
  if (configs.length === 0) {
    listEl.innerHTML = '<li class="empty-msg">まだ登録されていません。上のフォームから追加してください。</li>';
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

    (function(id) {
      const editBtn = document.createElement("button");
      editBtn.className = "secondary";
      editBtn.textContent = "編集";
      editBtn.onclick = function(e) {
        e.preventDefault();
        window.editConfig(id);
      };
      actions.appendChild(editBtn);
    })(c.id);

    (function(id) {
      const delBtn = document.createElement("button");
      delBtn.className = "secondary";
      delBtn.style.background = "#d32f2f";
      delBtn.textContent = "削除";
      delBtn.onclick = function(e) {
        e.preventDefault();
        window.deleteConfig(id);
      };
      actions.appendChild(delBtn);
    })(c.id);

    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

// ===== ボタンのモデル選択肢を更新 =====
async function updateButtonModelSelects() {
  const configs = await get(K.API_CONFIGS) || [];
  const selects = [btnApiConfigKey("summary"), btnApiConfigKey("customA"), btnApiConfigKey("customB")];
  const selectIds = ["btnApiConfig_summary", "btnApiConfig_customA", "btnApiConfig_customB"];

  selectIds.forEach(function(selectId, idx) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">（モデルを選択）</option>';
    configs.forEach(function(c) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label + " (" + c.apiModel + ")";
      sel.appendChild(opt);
    });
    if (currentVal && sel.querySelector('option[value="' + currentVal + '"]')) {
      sel.value = currentVal;
    }
    void selects[idx]; // K経由キー参照（将来のリファクタ用フック）
  });
}

// ===== すべて保存 =====
document.getElementById("saveAllBtn").addEventListener("click", async function() {
  const saveData = {};
  saveData[promptKey("summary")] = getVal("prompt_summary").trim();
  saveData[promptKey("customA")] = getVal("prompt_customA").trim();
  saveData[promptKey("customB")] = getVal("prompt_customB").trim();
  saveData[btnTitleKey("customA")] = getVal("btnTitle_customA").trim();
  saveData[btnTitleKey("customB")] = getVal("btnTitle_customB").trim();
  saveData[btnApiConfigKey("summary")] = getVal("btnApiConfig_summary");
  saveData[btnApiConfigKey("customA")] = getVal("btnApiConfig_customA");
  saveData[btnApiConfigKey("customB")] = getVal("btnApiConfig_customB");
  saveData[K.FONT_SIZE] = getVal("fontSize");
  saveData[K.PANEL_HEIGHT] = getVal("panelHeight");
  saveData[K.THEME] = getVal("theme");
  saveData[K.SUBTITLE_LANG] = getVal("subtitleLang");
  await set(saveData);
  showStatus("status", "✓ 保存しました");
});

// ===== 表示設定のみ保存 =====
document.getElementById("saveDisplayBtn").addEventListener("click", async function() {
  await set({
    [K.FONT_SIZE]: getVal("fontSize"),
    [K.PANEL_HEIGHT]: getVal("panelHeight"),
    [K.THEME]: getVal("theme"),
    [K.SUBTITLE_LANG]: getVal("subtitleLang")
  });
  showStatus("displayStatus", "✓ 保存しました");
});

// ===== 旧形式からの移行処理 =====
async function migrateIfNeeded() {
  const result = await getAll();
  let configs = result[K.API_CONFIGS];
  if (configs && configs.length > 0) return;
  const oldConfig = result[K.API_CONFIG_LEGACY];
  if (!oldConfig) return;
  const newConfigs = [];
  const providers = ["deepseek", "openrouter", "custom"];
  providers.forEach(function(provider) {
    const key = "apiConfig_" + provider;
    const pc = result[key];
    if (pc && pc.apiKey) {
      newConfigs.push({
        id: generateId(),
        label: provider.charAt(0).toUpperCase() + provider.slice(1),
        apiKey: pc.apiKey, apiUrl: pc.apiUrl || "", apiModel: pc.apiModel || "",
        temperature: pc.temperature || "0.3", maxTokens: pc.maxTokens || "4096",
        extraParams: pc.extraParams || ""
      });
    }
  });
  if (oldConfig.apiKey) {
    const exists = newConfigs.some(function(c) { return c.apiUrl === oldConfig.apiUrl && c.apiKey === oldConfig.apiKey; });
    if (!exists) {
      newConfigs.push({
        id: generateId(), label: oldConfig.apiProvider || "Default",
        apiKey: oldConfig.apiKey, apiUrl: oldConfig.apiUrl || "", apiModel: oldConfig.apiModel || "",
        temperature: oldConfig.temperature || "0.3", maxTokens: oldConfig.maxTokens || "4096",
        extraParams: oldConfig.extraParams || ""
      });
    }
  }
  if (newConfigs.length > 0) {
    await set({ [K.API_CONFIGS]: newConfigs });
  }
}

// ===== 初期表示 =====
window.addEventListener("DOMContentLoaded", async function() {
  await migrateIfNeeded();
  initAccordion();
  // プロバイダー/モデル選択肢の初期化（HTML ハードコードを廃止しJSから動的生成）
  populateProviderSelect();
  populateModelSelect("custom");
  // モデルフィルターのイベントバインド
  initModelFilterEvents();

  const result = await getAll();

  if (result[promptKey("summary")]) setVal("prompt_summary", result[promptKey("summary")]);
  else if (result[K.SYSTEM_PROMPT_LEGACY]) setVal("prompt_summary", result[K.SYSTEM_PROMPT_LEGACY]);
  if (result[promptKey("customA")]) setVal("prompt_customA", result[promptKey("customA")]);
  if (result[promptKey("customB")]) setVal("prompt_customB", result[promptKey("customB")]);
  if (result[btnTitleKey("customA")]) setVal("btnTitle_customA", result[btnTitleKey("customA")]);
  if (result[btnTitleKey("customB")]) setVal("btnTitle_customB", result[btnTitleKey("customB")]);

  await updateButtonModelSelects();

  if (result[btnApiConfigKey("summary")]) {
    const sel = document.getElementById("btnApiConfig_summary");
    if (sel) sel.value = result[btnApiConfigKey("summary")];
  }
  if (result[btnApiConfigKey("customA")]) {
    const sel = document.getElementById("btnApiConfig_customA");
    if (sel) sel.value = result[btnApiConfigKey("customA")];
  }
  if (result[btnApiConfigKey("customB")]) {
    const sel = document.getElementById("btnApiConfig_customB");
    if (sel) sel.value = result[btnApiConfigKey("customB")];
  }

  if (result[K.FONT_SIZE]) setVal("fontSize", result[K.FONT_SIZE]);
  if (result[K.PANEL_HEIGHT]) setVal("panelHeight", result[K.PANEL_HEIGHT]);
  if (result[K.THEME]) setVal("theme", result[K.THEME]);
  if (result[K.SUBTITLE_LANG]) setVal("subtitleLang", result[K.SUBTITLE_LANG]);

  renderModelList();
});