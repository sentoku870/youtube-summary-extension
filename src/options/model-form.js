// ============================================================
//  model-form.js — モデル管理タブの「登録・編集フォーム」UI ロジック
//  インライン展開フォームの 値管理・保存 を担当。
//  DOM 構築は model-form-dom.js、配置は model-card.js に委譲。
//  Phase C-3: DOM 構築ロジックを model-form-dom.js に分離。
// ============================================================
import { get, set, K } from "../infrastructure/storage.js";
import { validateFormValues, VALIDATION_ERRORS, buildConfig, generateId } from "./options-logic.js";
import { getVal, setVal } from "./options-shared.js";
import { saveToast, errorToast } from "./ui/toast.js";
import { buildFormDom } from "./model-form-dom.js";

// ===== バリデーションエラーメッセージ =====
const VALIDATION_MESSAGES = {};
VALIDATION_MESSAGES[VALIDATION_ERRORS.LABEL] = "ラベル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_KEY] = "APIキーを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_URL] = "APIエンドポイントURLを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_MODEL] = "モデル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.EXTRA_PARAMS_JSON] =
  "追加パラメータが正しいJSON形式ではありません";

// ===== 状態 =====
let editingId = null; // null = 新規作成, string = 編集モード（既存 id）
let onAfterSave = null;
let isInitialized = false;

function showFormError(msg) {
  const errEl = document.getElementById("apiFormError");
  if (errEl) errEl.textContent = msg || "";
}

function setFormTitle(text) {
  const title = document.getElementById("api-form-title");
  if (title) title.textContent = text;
}

function setSaveButtonText(text) {
  const btn = document.getElementById("saveConfigBtn");
  if (btn) btn.textContent = text;
}

function setDuplicateVisible(visible) {
  const btn = document.getElementById("duplicateConfigBtn");
  if (btn) btn.hidden = !visible;
}

function readFormValues() {
  return {
    label: getVal("configLabel"),
    apiKey: getVal("apiKey"),
    apiUrl: getVal("apiUrl"),
    apiModel: getVal("apiModel"),
    temperature: getVal("temperature"),
    maxTokens: getVal("maxTokens"),
    extraParams: getVal("extraParams")
  };
}

function clearForm() {
  setVal("configLabel", "");
  setVal("apiKey", "");
  setVal("apiUrl", "");
  setVal("apiModel", "");
  setVal("temperature", "0.3");
  setVal("maxTokens", "4096");
  setVal("extraParams", "");
  showFormError("");
  setDuplicateVisible(false);
}

function fillFormFromConfig(c) {
  setVal("configLabel", c.label || "");
  setVal("apiKey", c.apiKey || "");
  setVal("apiUrl", c.apiUrl || "");
  setVal("apiModel", c.apiModel || "");
  setVal("temperature", c.temperature || "0.3");
  setVal("maxTokens", c.maxTokens || "4096");
  setVal("extraParams", c.extraParams || "");
}

// ===== 公開 API: フォームを初期化（DOM 生成 + イベント登録） =====
export function initForm() {
  if (isInitialized) return;
  isInitialized = true;
  const host = document.getElementById("tab-models");
  if (!host) return;
  const formDom = buildFormDom();
  host.appendChild(formDom);

  bindFormEvents();
}

// ===== 内部イベント登録 =====
function bindFormEvents() {
  const saveBtn = document.getElementById("saveConfigBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const dupBtn = document.getElementById("duplicateConfigBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSave);
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancel);
  if (dupBtn) dupBtn.addEventListener("click", handleDuplicate);
}

// ===== 公開: フォームを新規モードで開く =====
export function openFormForNew() {
  editingId = null;
  clearForm();
  setFormTitle("🔑 新規モデルを追加");
  setSaveButtonText("✓ 登録する");
  setDuplicateVisible(false);
}

// ===== 公開: フォームを編集モードで開く =====
export async function openFormForEdit(id) {
  const configs = (await get(K.API_CONFIGS)) || [];
  const config = configs.find(function (c) {
    return c.id === id;
  });
  if (!config) return;
  editingId = id;
  fillFormFromConfig(config);
  setFormTitle("✏️ 編集中: " + (config.label || "（無名）"));
  setSaveButtonText("✓ 変更を保存");
  setDuplicateVisible(true);
  showFormError("");
}

export function isFormOpen() {
  const formDom = document.getElementById("modelFormContainer");
  return !!(formDom && !formDom.hidden);
}

// ===== ハンドラ =====
async function handleSave() {
  const values = readFormValues();
  const config = buildConfig(values);
  const result = validateFormValues(config);
  if (!result.valid) {
    showFormError(VALIDATION_MESSAGES[result.errorKey] || "入力内容を確認してください");
    return;
  }
  showFormError("");
  const configs = (await get(K.API_CONFIGS)) || [];
  if (editingId) {
    const idx = configs.findIndex(function (c) {
      return c.id === editingId;
    });
    if (idx === -1) {
      errorToast("対象の設定が見つかりません");
      return;
    }
    Object.assign(configs[idx], config);
    await set({ apiConfigs: configs });
    saveToast("✓ 変更を保存しました");
  } else {
    config.id = generateId();
    configs.push(config);
    await set({ apiConfigs: configs });
    saveToast("✓ 新規登録しました");
  }
  editingId = null;
  clearForm();
  if (onAfterSave) onAfterSave();
}

async function handleDuplicate() {
  const values = readFormValues();
  const config = buildConfig(values);
  const result = validateFormValues(config);
  if (!result.valid) {
    showFormError(VALIDATION_MESSAGES[result.errorKey] || "入力内容を確認してください");
    return;
  }
  showFormError("");
  const configs = (await get(K.API_CONFIGS)) || [];
  config.id = generateId();
  configs.push(config);
  await set({ apiConfigs: configs });
  saveToast("✓ 複製として保存しました");
  editingId = null;
  clearForm();
  if (onAfterSave) onAfterSave();
}

function handleCancel() {
  editingId = null;
  clearForm();
  if (onAfterSave) onAfterSave();
}

export function setOnAfterSave(fn) {
  onAfterSave = fn;
}