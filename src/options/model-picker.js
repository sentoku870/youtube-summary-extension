// ============================================================
//  model-picker.js — モデル管理タブの「モデル取得・選択」UI
//  プロバイダー選択、モデル一覧取得、絞り込みを担当。
//  状態 (currentModelPool, currentModelProviderKey) は
//  options-models.js で共有管理。
// ============================================================
import { get, K } from "../../infrastructure/storage.js";
import { buildModelDisplayLabel } from "./model-label.js";
import { listModelProviders, filterModels } from "./model-filter.js";
import { PROVIDERS, cssEscape } from "./options-logic.js";
import { getVal } from "./options-shared.js";

// 親モジュールから状態を受け取るための getter/setter
// model-picker は読み取りのみ(set は model-form 側で担当)
let getModelPool = null;
let getModelProviderKey = null;

export function bindModelState({ getPool, getProviderKey }) {
  getModelPool = getPool;
  getModelProviderKey = getProviderKey;
}

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
  const pool = getModelPool ? getModelPool() : [];
  const providers = listModelProviders(pool);
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
  const pool = getModelPool ? getModelPool() : [];
  const providerKey = getModelProviderKey ? getModelProviderKey() : "";
  const filtered = filterModels(providerKey, pool, providerFilter, keyword);
  populateModelSelect(providerKey, filtered);
  const note = document.getElementById("modelCountNote");
  if (note) {
    const total = pool.length;
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
  if (providerSel) providerSel.addEventListener("change", applyModelFilter);
  if (keywordInput) keywordInput.addEventListener("input", applyModelFilter);
}

// 外部公開（他モジュールから状態リセット用）
export {
  populateProviderSelect,
  populateModelSelect,
  resetModelFilter,
  setModelFilterVisible,
  refreshModelProviderFilter,
  applyModelFilter,
  initModelFilterEvents,
  findExistingApiKey,
  updateApiKeyHint
};
