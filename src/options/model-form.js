// ============================================================
//  model-form.js — モデル管理タブの「登録・編集・削除」フォーム UI
//  新規登録・変更・複製・キャンセルボタンのハンドラと、
//  編集時のフォーム流し込み (editConfig) を担当。
// ============================================================
import { get, set, K } from "../../infrastructure/storage.js";
import {
  detectProviderKey,
  validateFormValues,
  VALIDATION_ERRORS,
  buildConfig,
  cssEscape
} from "./options-logic.js";
import { getVal, setVal, showStatus } from "./options-shared.js";
import {
  populateModelSelect,
  resetModelFilter,
  setModelFilterVisible,
  updateApiKeyHint
} from "./model-picker.js";

// ===== バリデーションエラーメッセージ =====
const VALIDATION_MESSAGES = {};
VALIDATION_MESSAGES[VALIDATION_ERRORS.LABEL] = "ラベル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_KEY] = "APIキーを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_URL] = "APIエンドポイントURLを入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.API_MODEL] = "モデル名を入力してください";
VALIDATION_MESSAGES[VALIDATION_ERRORS.EXTRA_PARAMS_JSON] =
  "追加パラメータが正しいJSON形式ではありません";

// 状態リセット用（model-picker.js と共有）
let setModelPool = null;
let setModelProviderKey = null;

export function bindFormState({ setPool, setProviderKey }) {
  setModelPool = setPool;
  setModelProviderKey = setProviderKey;
}
void setModelPool;
void setModelProviderKey;

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
  if (modelSel) modelSel.innerHTML = '<option value="">（モデルを選択または手動入力）</option>';
  if (setModelPool) setModelPool([]);
  if (setModelProviderKey) setModelProviderKey("");
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
  // 動的 import で循環参照を回避
  const { renderModelList } = await import("./model-list.js");
  const { updateButtonModelSelects } = await import("./options-buttons.js");
  await renderModelList();
  await updateButtonModelSelects();
}

// ===== 編集モード：既存設定をフォームへ流し込み =====
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
  if (setModelPool) setModelPool([]);
  if (setModelProviderKey) setModelProviderKey(providerKey);
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

export {
  editConfig,
  showEditButtons,
  clearApiForm,
  buildConfigFromForm,
  validateForm,
  saveConfigsAndRefresh
};
