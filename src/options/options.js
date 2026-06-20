// ============================================================
//  options.js — オプション画面のロジック
// ============================================================

// ===== プロバイダープリセット =====
const PRESETS = {
  deepseek_chat: {
    label: "DeepSeek Chat",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    temperature: "0.3",
    extraParams: ""
  },
  deepseek_reasoner: {
    label: "DeepSeek Reasoner",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-reasoner",
    temperature: "0.3",
    extraParams: '{"thinking": {"type": "disabled"}}'
  },
  openrouter_gpt4o: {
    label: "OpenRouter GPT-4o",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o",
    temperature: "0.3",
    extraParams: ""
  },
  openrouter_gpt4o_mini: {
    label: "OpenRouter GPT-4o Mini",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
    temperature: "0.3",
    extraParams: ""
  },
  openrouter_claude35: {
    label: "OpenRouter Claude 3.5 Sonnet",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-3.5-sonnet",
    temperature: "0.3",
    extraParams: ""
  },
  openrouter_gemini: {
    label: "OpenRouter Gemini 2.0 Flash",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemini-2.0-flash-exp:free",
    temperature: "0.3",
    extraParams: ""
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

// ===== プリセット選択イベント =====
document.getElementById("presetSelect").addEventListener("change", function() {
  const key = this.value;
  if (!key || !PRESETS[key]) return;
  const p = PRESETS[key];
  setVal("configLabel", p.label);
  setVal("apiUrl", p.url);
  setVal("apiModel", p.model);
  setVal("temperature", p.temperature);
  setVal("extraParams", p.extraParams);
  setVal("apiKey", "");
});

// ===== 削除 =====
window.deleteConfig = async function(id) {
  const result = await chrome.storage.local.get("apiConfigs");
  let configs = result.apiConfigs || [];
  const newConfigs = configs.filter(function(c) { return c.id !== id; });
  await chrome.storage.local.set({ apiConfigs: newConfigs });
  showStatus("status", "✓ 削除しました");
  renderModelList();
  updateButtonModelSelects();
};

// ===== 編集 =====
window.editConfig = async function(id) {
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];
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

  document.getElementById("api-form-title").textContent = "✏️ API設定を編集";
  showEditButtons(true);
};

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
  document.getElementById("presetSelect").value = "";
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
  await chrome.storage.local.set({ apiConfigs: configs });
  renderModelList();
  updateButtonModelSelects();
}

// ===== 新規登録 =====
document.getElementById("saveConfigBtn").addEventListener("click", async function() {
  const config = buildConfigFromForm();
  if (!validateForm(config)) return;
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];
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
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];
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
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];
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
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];

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
  const result = await chrome.storage.local.get("apiConfigs");
  const configs = result.apiConfigs || [];
  const selects = ["btnApiConfig_summary", "btnApiConfig_customA", "btnApiConfig_customB"];

  selects.forEach(function(selectId) {
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
  });
}

// ===== すべて保存 =====
document.getElementById("saveAllBtn").addEventListener("click", async function() {
  const saveData = {};
  saveData["prompt_summary"] = getVal("prompt_summary").trim();
  saveData["prompt_customA"] = getVal("prompt_customA").trim();
  saveData["prompt_customB"] = getVal("prompt_customB").trim();
  saveData["btnTitle_customA"] = getVal("btnTitle_customA").trim();
  saveData["btnTitle_customB"] = getVal("btnTitle_customB").trim();
  saveData["btnApiConfig_summary"] = getVal("btnApiConfig_summary");
  saveData["btnApiConfig_customA"] = getVal("btnApiConfig_customA");
  saveData["btnApiConfig_customB"] = getVal("btnApiConfig_customB");
  saveData.fontSize = getVal("fontSize");
  saveData.theme = getVal("theme");
  saveData.subtitleLang = getVal("subtitleLang");
  await chrome.storage.local.set(saveData);
  showStatus("status", "✓ 保存しました");
});

// ===== 表示設定のみ保存 =====
document.getElementById("saveDisplayBtn").addEventListener("click", async function() {
  await chrome.storage.local.set({
    fontSize: getVal("fontSize"),
    theme: getVal("theme"),
    subtitleLang: getVal("subtitleLang")
  });
  showStatus("displayStatus", "✓ 保存しました");
});

// ===== 旧形式からの移行処理 =====
async function migrateIfNeeded() {
  const result = await chrome.storage.local.get(null);
  let configs = result.apiConfigs;
  if (configs && configs.length > 0) return;
  const oldConfig = result.apiConfig;
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
    await chrome.storage.local.set({ apiConfigs: newConfigs });
  }
}

// ===== 初期表示 =====
window.addEventListener("DOMContentLoaded", async function() {
  await migrateIfNeeded();
  initAccordion();
  const result = await chrome.storage.local.get(null);

  if (result["prompt_summary"]) setVal("prompt_summary", result["prompt_summary"]);
  else if (result.systemPrompt) setVal("prompt_summary", result.systemPrompt);
  if (result["prompt_customA"]) setVal("prompt_customA", result["prompt_customA"]);
  if (result["prompt_customB"]) setVal("prompt_customB", result["prompt_customB"]);
  if (result["btnTitle_customA"]) setVal("btnTitle_customA", result["btnTitle_customA"]);
  if (result["btnTitle_customB"]) setVal("btnTitle_customB", result["btnTitle_customB"]);

  await updateButtonModelSelects();

  if (result["btnApiConfig_summary"]) {
    const sel = document.getElementById("btnApiConfig_summary");
    if (sel) sel.value = result["btnApiConfig_summary"];
  }
  if (result["btnApiConfig_customA"]) {
    const sel = document.getElementById("btnApiConfig_customA");
    if (sel) sel.value = result["btnApiConfig_customA"];
  }
  if (result["btnApiConfig_customB"]) {
    const sel = document.getElementById("btnApiConfig_customB");
    if (sel) sel.value = result["btnApiConfig_customB"];
  }

  if (result.fontSize) setVal("fontSize", result.fontSize);
  if (result.theme) setVal("theme", result.theme);
  if (result.subtitleLang) setVal("subtitleLang", result.subtitleLang);

  renderModelList();
});