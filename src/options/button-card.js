// ============================================================
//  button-card.js — ボタン・プロンプトタブの3カード描画 + 自動保存
//  カード型 UI で 3 つのボタン（要約/分析/考察）の
//  タイトル・プロンプト・モデル を 1 カードに集約。
//  入力変更はデバウンス（300ms）で chrome.storage に自動保存。
// ============================================================
import {
  get,
  set,
  K,
  getDefaultPrompt,
  loadButtonTitle,
  loadBtnApiConfigId
} from "../infrastructure/storage.js";
import { saveToast } from "./ui/toast.js";
import { promptKey, btnTitleKey, btnApiConfigKey } from "./options-logic.js";

const DEBOUNCE_MS = 300;
const BUTTON_KEYS = ["summary", "customA", "customB"];
const BUTTON_LABELS = {
  summary: "A",
  customA: "B",
  customB: "C"
};
const BUTTON_ICONS = {
  summary: "📝",
  customA: "📊",
  customB: "💡"
};

const buttonCardsContainer = { current: null };
const indicatorEl = { current: null };
const pendingTimers = {};
const pendingWrites = {};
let isInitialized = false;
let onModelSelectsChange = null;

export function bindButtonCardHandlers(handlers) {
  if (handlers && typeof handlers.onModelSelectsChange === "function") {
    onModelSelectsChange = handlers.onModelSelectsChange;
  }
}

// ===== DOM ヘルパ =====
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// ===== 1カードの DOM 構築 =====
function buildCard(key) {
  const card = el("div", "button-card button-card-" + key);
  card.setAttribute("data-button", key);

  const head = el("div", "card-head");
  const dot = el("span", "dot");
  dot.setAttribute("aria-hidden", "true");
  const headLabel = el("span", "label");
  headLabel.textContent = BUTTON_ICONS[key] + " " + BUTTON_LABELS[key];
  const badge = el("span", "badge", "ボタン" + (BUTTON_KEYS.indexOf(key) + 1));
  head.appendChild(dot);
  head.appendChild(headLabel);
  head.appendChild(badge);
  card.appendChild(head);

  // タイトル
  const fTitle = el("div", "field");
  const lblTitle = el("label", null, "ボタンの表示名（任意）");
  lblTitle.setAttribute("for", "btnTitle_" + key);
  const inputTitle = document.createElement("input");
  inputTitle.type = "text";
  inputTitle.id = "btnTitle_" + key;
  inputTitle.placeholder = "例: " + BUTTON_LABELS[key];
  fTitle.appendChild(lblTitle);
  fTitle.appendChild(inputTitle);
  card.appendChild(fTitle);

  // プロンプト
  const fPrompt = el("div", "field");
  const lblPrompt = el("label", null, "プロンプト");
  lblPrompt.setAttribute("for", "prompt_" + key);
  const taPrompt = document.createElement("textarea");
  taPrompt.id = "prompt_" + key;
  taPrompt.rows = 4;
  fPrompt.appendChild(lblPrompt);
  fPrompt.appendChild(taPrompt);
  card.appendChild(fPrompt);

  // モデル選択
  const fModel = el("div", "field");
  const lblModel = el("label", null, "使用するモデル");
  lblModel.setAttribute("for", "btnApiConfig_" + key);
  const selModel = document.createElement("select");
  selModel.id = "btnApiConfig_" + key;
  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "（モデルを選択）";
  selModel.appendChild(optEmpty);
  fModel.appendChild(lblModel);
  fModel.appendChild(selModel);
  const warn = el("p", "warn");
  warn.id = "btnWarn_" + key;
  warn.textContent = "⚠ モデル未選択（保存時にこのボタンは動作しません）";
  warn.style.display = "none";
  fModel.appendChild(warn);
  card.appendChild(fModel);

  return { card, inputTitle, taPrompt, selModel, warn };
}

function flushPending(key) {
  if (pendingTimers[key]) {
    clearTimeout(pendingTimers[key]);
    delete pendingTimers[key];
  }
}

function scheduleSave(key) {
  flushPending(key);
  if (indicatorEl.current) {
    indicatorEl.current.classList.remove("saved");
    indicatorEl.current.classList.add("saving");
    indicatorEl.current.textContent = "保存中…";
  }
  pendingTimers[key] = setTimeout(function () {
    commitSave(key);
  }, DEBOUNCE_MS);
}

async function commitSave(key) {
  delete pendingTimers[key];
  const titleEl = document.getElementById("btnTitle_" + key);
  const promptEl = document.getElementById("prompt_" + key);
  const modelEl = document.getElementById("btnApiConfig_" + key);
  if (!promptEl || !modelEl) return;
  const payload = {
    [btnTitleKey(key)]: titleEl ? titleEl.value.trim() : "",
    [promptKey(key)]: promptEl.value.trim(),
    [btnApiConfigKey(key)]: modelEl.value || ""
  };
  pendingWrites[key] = true;
  try {
    await set(payload);
    updateWarnVisibility(key);
    // すべての予定保存が完了したか
    const stillPending = Object.keys(pendingTimers).length > 0;
    if (!stillPending) {
      if (indicatorEl.current) {
        indicatorEl.current.classList.remove("saving");
        indicatorEl.current.classList.add("saved");
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        indicatorEl.current.textContent = "✓ 自動保存しました (" + hh + ":" + mm + ")";
        setTimeout(function () {
          if (indicatorEl.current && indicatorEl.current.classList.contains("saved")) {
            indicatorEl.current.textContent = "";
            indicatorEl.current.classList.remove("saved");
          }
        }, 2500);
      }
    }
  } catch (e) {
    errorToastInline("保存に失敗しました: " + (e.message || e));
  } finally {
    delete pendingWrites[key];
  }
}

function errorToastInline(msg) {
  saveToast("✗ " + msg);
}

function updateWarnVisibility(key) {
  const warn = document.getElementById("btnWarn_" + key);
  const modelEl = document.getElementById("btnApiConfig_" + key);
  if (!warn || !modelEl) return;
  warn.style.display = modelEl.value ? "none" : "block";
}

function bindCardEvents(refs) {
  Object.keys(refs).forEach(function (key) {
    const r = refs[key];
    if (r.inputTitle)
      r.inputTitle.addEventListener("input", function () {
        scheduleSave(key);
      });
    if (r.taPrompt)
      r.taPrompt.addEventListener("input", function () {
        scheduleSave(key);
      });
    if (r.selModel)
      r.selModel.addEventListener("change", function () {
        scheduleSave(key);
      });
  });
}

async function loadInitialValues(refs) {
  for (const key of BUTTON_KEYS) {
    const r = refs[key];
    if (!r) continue;
    const title = await loadButtonTitle(key);
    const prompt = (await get(promptKey(key))) || getDefaultPrompt(key);
    const modelId = await loadBtnApiConfigId(key);
    if (r.inputTitle) r.inputTitle.value = title || "";
    if (r.taPrompt) r.taPrompt.value = prompt || "";
    if (r.selModel) r.selModel.value = modelId || "";
    updateWarnVisibility(key);
  }
}

export async function refreshButtonModelSelects() {
  const configs = (await get(K.API_CONFIGS)) || [];
  BUTTON_KEYS.forEach(function (key) {
    const sel = document.getElementById("btnApiConfig_" + key);
    if (!sel) return;
    const currentVal = sel.value;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "（モデルを選択）";
    sel.appendChild(optEmpty);
    configs.forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label + " (" + c.apiModel + ")";
      sel.appendChild(opt);
    });
    if (currentVal && sel.querySelector('option[value="' + currentVal + '"]')) {
      sel.value = currentVal;
    }
    updateWarnVisibility(key);
  });
  if (onModelSelectsChange) onModelSelectsChange();
}

export function initButtonCards() {
  if (isInitialized) return;
  isInitialized = true;
  const container = document.getElementById("buttonCards");
  if (!container) return;
  buttonCardsContainer.current = container;
  indicatorEl.current = document.getElementById("buttonsAutoSaveStatus");

  const refs = {};
  BUTTON_KEYS.forEach(function (key) {
    const built = buildCard(key);
    container.appendChild(built.card);
    refs[key] = built;
  });
  bindCardEvents(refs);
  loadInitialValues(refs).then(function () {
    return refreshButtonModelSelects();
  });
}

export async function flushAllSaves() {
  // 全保留中の保存を即時コミット（タブ切替時など）
  for (const key of BUTTON_KEYS) {
    if (pendingTimers[key]) {
      flushPending(key);
      await commitSave(key);
    }
  }
}
