// ============================================================
//  model-picker.js — モデル管理タブの「プロバイダー・モデル」UI
//  プロバイダー選択とモデル一覧（datalist ソース）を担当。
//  状態 (currentModelPool, currentModelProviderKey) は
//  options-models.js で共有管理。
// ============================================================
import { get, K } from "../infrastructure/storage.js";
import { buildModelDisplayLabel } from "./model-label.js";
import { PROVIDERS, cssEscape } from "./options-logic.js";
import { getPool, getProviderKey } from "./model-state.js";

// ===== プロバイダー選択 UI の動的構築 =====
function populateProviderSelect() {
  const sel = document.getElementById("providerSelect");
  if (!sel) return;
  sel.replaceChildren();
  Object.keys(PROVIDERS).forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = PROVIDERS[key].label;
    sel.appendChild(opt);
  });
  sel.value = "custom";
}

// ===== datalist の option を再構築 =====
function updateDatalist(providerKey, models) {
  const list = document.getElementById("modelSuggestions");
  if (!list) return;
  const pool = models || (PROVIDERS[providerKey] && PROVIDERS[providerKey].models) || [];
  // 既存をクリア
  while (list.firstChild) list.removeChild(list.firstChild);
  pool.forEach(function (m) {
    if (!m || !m.id) return;
    const opt = document.createElement("option");
    opt.value = m.id;
    const displayLabel = buildModelDisplayLabel(providerKey, m);
    opt.label =
      displayLabel && displayLabel !== m.id
        ? displayLabel + " (" + m.id + ")"
        : displayLabel || m.id;
    opt.setAttribute("data-extra-params", m.extraParams || "");
    list.appendChild(opt);
  });
  // プールが空でも「手動入力」ヒントのために空の datalist を作る
  const note = document.getElementById("modelPoolNote");
  if (note) {
    if (pool.length === 0) {
      note.textContent = "（モデルを手動入力してください）";
      note.style.color = "#888";
    } else {
      note.textContent = pool.length + " 件のモデルが候補にあります";
      note.style.color = "#888";
    }
  }
}

// モデルフィールドに値を設定し、datalist から該当があれば extraParams を自動入力
function setModelFieldValue(modelId) {
  const input = document.getElementById("apiModel");
  const extraParamsEl = document.getElementById("extraParams");
  if (!input) return;
  input.value = modelId || "";
  if (!modelId) return;
  const list = document.getElementById("modelSuggestions");
  if (!list) return;
  const opt = list.querySelector('option[value="' + cssEscape(modelId) + '"]');
  if (opt && extraParamsEl && opt.getAttribute("data-extra-params")) {
    extraParamsEl.value = opt.getAttribute("data-extra-params");
  }
}

// モデル候補プールを datalist に流す
function refreshDatalist() {
  const providerKey = getProviderKey();
  const pool = getPool();
  updateDatalist(providerKey, pool);
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

function initModelInputEvents() {
  const input = document.getElementById("apiModel");
  if (!input) return;
  // change イベント: datalist から選ばれた時に extraParams を自動入力
  input.addEventListener("change", function () {
    const list = document.getElementById("modelSuggestions");
    const extraParamsEl = document.getElementById("extraParams");
    if (!list || !extraParamsEl) return;
    const opt = list.querySelector('option[value="' + cssEscape(input.value) + '"]');
    if (opt && opt.getAttribute("data-extra-params")) {
      extraParamsEl.value = opt.getAttribute("data-extra-params");
    }
    // ラベル自動補完（ラベル欄が空のときのみ）
    const labelEl = document.getElementById("configLabel");
    if (opt && labelEl && !labelEl.value.trim()) {
      const optLabel = opt.getAttribute("label") || opt.value;
      const displayLabel = optLabel.split(" (")[0];
      labelEl.value = displayLabel;
    }
  });
}

export {
  populateProviderSelect,
  updateDatalist,
  refreshDatalist,
  setModelFieldValue,
  findExistingApiKey,
  updateApiKeyHint,
  initModelInputEvents
};
