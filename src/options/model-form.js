// ============================================================
//  model-form.js — モデル管理タブの「登録・編集フォーム」UI
//  インライン展開フォームの DOM 生成・値管理・保存を担当。
//  ボタンは「保存（新規/上書き）」「キャンセル」「複製として保存」。
//  フォームの配置（カード直下への attach/detach）は model-card.js、
//  オーケストレーションは options-models.js に委譲。
// ============================================================
import { get, set, K } from "../infrastructure/storage.js";
import { validateFormValues, VALIDATION_ERRORS, buildConfig } from "./options-logic.js";
import { getVal, setVal } from "./options-shared.js";
import { saveToast, errorToast } from "./ui/toast.js";

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

// ===== DOM ヘルパ =====
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// ===== フォーム DOM を構築 =====
function buildFormDom() {
  const wrap = document.createElement("div");
  wrap.className = "inline-form";
  wrap.id = "modelFormContainer";
  wrap.hidden = true;

  const header = el("div", "form-header");
  const title = el("h3", "form-title");
  title.id = "api-form-title";
  header.appendChild(title);
  wrap.appendChild(header);

  const fLabel = el("div", "field");
  const lblLabel = el("label", null, "ラベル名");
  lblLabel.setAttribute("for", "configLabel");
  const inputLabel = document.createElement("input");
  inputLabel.type = "text";
  inputLabel.id = "configLabel";
  inputLabel.placeholder = "例: DeepSeek Chat, OpenRouter GPT-4o";
  fLabel.appendChild(lblLabel);
  fLabel.appendChild(inputLabel);
  wrap.appendChild(fLabel);

  const fKey = el("div", "field");
  const lblKey = el("label", null, "APIキー");
  lblKey.setAttribute("for", "apiKey");
  const inputKey = document.createElement("input");
  inputKey.type = "password";
  inputKey.id = "apiKey";
  inputKey.placeholder = "sk-xxxxxxxx";
  fKey.appendChild(lblKey);
  fKey.appendChild(inputKey);
  wrap.appendChild(fKey);

  const fUrl = el("div", "field");
  const lblUrl = el("label", null, "APIエンドポイントURL");
  lblUrl.setAttribute("for", "apiUrl");
  const inputUrl = document.createElement("input");
  inputUrl.type = "url";
  inputUrl.id = "apiUrl";
  inputUrl.placeholder = "https://api.deepseek.com/v1/chat/completions";
  fUrl.appendChild(lblUrl);
  fUrl.appendChild(inputUrl);
  wrap.appendChild(fUrl);

  const fModel = el("div", "field");
  const lblModel = el("label", null, "モデル");
  lblModel.setAttribute("for", "apiModel");
  const inputModel = document.createElement("input");
  inputModel.type = "text";
  inputModel.id = "apiModel";
  inputModel.placeholder = "deepseek-chat";
  inputModel.autocomplete = "off";
  fModel.appendChild(lblModel);
  fModel.appendChild(inputModel);
  wrap.appendChild(fModel);

  const rowParams = el("div", "field-row");
  const fTemp = el("div", "field");
  const lblTemp = el("label", null, "Temperature");
  lblTemp.setAttribute("for", "temperature");
  const inputTemp = document.createElement("input");
  inputTemp.type = "number";
  inputTemp.id = "temperature";
  inputTemp.step = "0.1";
  inputTemp.min = "0";
  inputTemp.max = "2";
  inputTemp.placeholder = "0.3";
  fTemp.appendChild(lblTemp);
  fTemp.appendChild(inputTemp);
  fTemp.appendChild(el("div", "note", "0.0〜2.0"));
  const fMax = el("div", "field");
  const lblMax = el("label", null, "Max Tokens");
  lblMax.setAttribute("for", "maxTokens");
  const inputMax = document.createElement("input");
  inputMax.type = "number";
  inputMax.id = "maxTokens";
  inputMax.step = "1";
  inputMax.min = "1";
  inputMax.max = "32768";
  inputMax.placeholder = "4096";
  fMax.appendChild(lblMax);
  fMax.appendChild(inputMax);
  fMax.appendChild(el("div", "note", "最大トークン数"));
  rowParams.appendChild(fTemp);
  rowParams.appendChild(fMax);
  wrap.appendChild(rowParams);

  const fExtra = el("div", "field");
  const lblExtra = el("label", null, "追加パラメータ（JSON）");
  lblExtra.setAttribute("for", "extraParams");
  const inputExtra = document.createElement("textarea");
  inputExtra.id = "extraParams";
  inputExtra.rows = 2;
  inputExtra.placeholder = '{"thinking": {"type": "disabled"}}';
  fExtra.appendChild(lblExtra);
  fExtra.appendChild(inputExtra);
  fExtra.appendChild(el("div", "note", "APIリクエストボディに追加で送信するJSON"));
  wrap.appendChild(fExtra);

  const actions = el("div", "form-actions");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "saveConfigBtn";
  saveBtn.className = "primary";
  saveBtn.textContent = "保存";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.id = "cancelEditBtn";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "キャンセル";
  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.id = "duplicateConfigBtn";
  dupBtn.className = "secondary";
  dupBtn.textContent = "複製として保存";
  dupBtn.hidden = true;
  const errMsg = el("p", "form-error");
  errMsg.id = "apiFormError";
  errMsg.setAttribute("role", "alert");
  actions.appendChild(saveBtn);
  actions.appendChild(dupBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(errMsg);
  wrap.appendChild(actions);

  return wrap;
}

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

function generateId() {
  return "cfg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function setOnAfterSave(fn) {
  onAfterSave = fn;
}
