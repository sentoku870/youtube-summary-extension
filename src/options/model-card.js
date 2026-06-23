// ============================================================
//  model-card.js — 登録済みモデル一覧のカード描画 + フォーム配置
//  カード型 UI + 検索フィルタ + インライン展開フォームの DOM 移動を担当。
//  編集・複製・削除ボタンのハンドラは model-form.js / model-list の
//  残存機能（後方互換）に委譲。
// ============================================================
import { get, K } from "../infrastructure/storage.js";
import { cssEscape } from "./options-logic.js";
import { filterConfigCards, extractHost } from "./model-filter.js";

let searchKeyword = "";
let onEditFn = null;
let onDuplicateFn = null;
let onDeleteFn = null;
let formContainerEl = null;
let modelListEl = null;
let onFormClosedFn = null;
let rememberedEditingId = null; // 編集中カード id（再描画で失わないため）

export function bindCardHandlers(handlers) {
  onEditFn = handlers.onEdit;
  onDuplicateFn = handlers.onDuplicate;
  onDeleteFn = handlers.onDelete;
  if (handlers && typeof handlers.onFormClosed === "function") {
    onFormClosedFn = handlers.onFormClosed;
  }
}

export function setFormContainer(el) {
  formContainerEl = el;
}

// ===== カードの DOM 構築 =====
function buildCard(c) {
  const li = document.createElement("li");
  li.className = "model-card";
  li.setAttribute("data-config-id", c.id);

  const summary = document.createElement("div");
  summary.className = "card-summary";
  summary.setAttribute("role", "button");
  summary.setAttribute("tabindex", "0");
  summary.setAttribute("aria-label", c.label + " の編集を開く");

  const host = extractHost(c.apiUrl);

  const body = document.createElement("div");
  body.className = "card-body";

  const labelRow = document.createElement("div");
  labelRow.className = "card-label";
  const labelText = document.createElement("span");
  labelText.textContent = c.label || "(ラベルなし)";
  labelRow.appendChild(labelText);

  const detail = document.createElement("div");
  detail.className = "card-detail";
  const modelSpan = document.createElement("span");
  modelSpan.textContent = "🤖 " + (c.apiModel || "—");
  const hostSpan = document.createElement("span");
  hostSpan.textContent = "🔗 " + (host || "—");
  detail.appendChild(modelSpan);
  detail.appendChild(hostSpan);

  body.appendChild(labelRow);
  body.appendChild(detail);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "secondary";
  editBtn.textContent = "編集";
  editBtn.setAttribute("data-action", "edit");
  editBtn.setAttribute("data-config-id", c.id);
  editBtn.setAttribute("aria-label", c.label + " を編集");
  actions.appendChild(editBtn);

  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.className = "secondary";
  dupBtn.textContent = "複製";
  dupBtn.setAttribute("data-action", "duplicate");
  dupBtn.setAttribute("data-config-id", c.id);
  dupBtn.setAttribute("aria-label", c.label + " を複製");
  actions.appendChild(dupBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "danger";
  delBtn.textContent = "削除";
  delBtn.setAttribute("data-action", "delete");
  delBtn.setAttribute("data-config-id", c.id);
  delBtn.setAttribute("aria-label", c.label + " を削除");
  actions.appendChild(delBtn);

  const toggle = document.createElement("span");
  toggle.className = "card-toggle";
  toggle.textContent = "▶";
  toggle.setAttribute("aria-hidden", "true");

  summary.appendChild(body);
  summary.appendChild(actions);
  summary.appendChild(toggle);

  li.appendChild(summary);
  return li;
}

function buildNewCardPlaceholder() {
  const li = document.createElement("li");
  li.className = "model-card new-card editing";
  li.setAttribute("data-new", "true");
  return li;
}

function buildEmptyMessage() {
  const li = document.createElement("li");
  li.className = "empty-msg";
  li.setAttribute("data-empty", "true");
  const text = document.createElement("div");
  text.textContent = "まだモデルが登録されていません。";
  const cta = document.createElement("button");
  cta.type = "button";
  cta.id = "emptyAddBtn";
  cta.className = "primary empty-cta";
  cta.textContent = "+ 最初のモデルを追加";
  li.appendChild(text);
  li.appendChild(cta);
  return li;
}

function buildNoMatchMessage() {
  const li = document.createElement("li");
  li.className = "empty-msg";
  li.setAttribute("data-empty", "true");
  li.textContent = "🔍 検索条件に一致するモデルがありません";
  return li;
}

// ===== 一覧描画 =====
async function renderModelList() {
  if (!modelListEl) {
    modelListEl = document.getElementById("modelList");
  }
  if (!modelListEl) return;
  const configs = (await get(K.API_CONFIGS)) || [];

  // 編集中のカード id を保持（再描画で失わないように）
  const editingCardId = getEditingCardId();

  modelListEl.replaceChildren();

  if (configs.length === 0) {
    modelListEl.appendChild(buildEmptyMessage());
    return;
  }

  const filtered = filterConfigCards(configs, searchKeyword);
  if (filtered.length === 0) {
    modelListEl.appendChild(buildNoMatchMessage());
    return;
  }

  for (let i = 0; i < filtered.length; i++) {
    modelListEl.appendChild(buildCard(filtered[i]));
  }

  // 編集中だったカードを復元
  if (editingCardId && formContainerEl && !formContainerEl.hidden) {
    if (editingCardId === "new") {
      // 新規作成モード：新しい placeholder を作ってフォームを再 attach
      const placeholder = buildNewCardPlaceholder();
      modelListEl.insertBefore(placeholder, modelListEl.firstChild);
      placeholder.appendChild(formContainerEl);
    } else {
      const card = modelListEl.querySelector(
        '.model-card[data-config-id="' + cssEscape(editingCardId) + '"]'
      );
      if (card) {
        card.classList.add("editing");
        if (formContainerEl.parentNode !== card) {
          card.appendChild(formContainerEl);
        }
      } else {
        // カードが見つからない（削除された等）→ フォームを閉じる
        rememberedEditingId = null;
        formContainerEl.hidden = true;
      }
    }
  }
}

function getEditingCardId() {
  // 1. 明示的に覚えた id があればそれを使う（再描画対応）
  if (rememberedEditingId) return rememberedEditingId;
  // 2. フォームの現在位置から判定
  if (!formContainerEl || formContainerEl.hidden) return null;
  const parent = formContainerEl.parentNode;
  if (!parent || !parent.classList || !parent.classList.contains("model-card")) return null;
  return parent.getAttribute("data-config-id") || "new";
}

// ===== 検索キーワード設定 + 再描画 =====
function setSearchKeyword(kw) {
  searchKeyword = kw || "";
  return renderModelList();
}

// ===== フォームの配置（新規） =====
function attachFormAsNew() {
  if (!formContainerEl || !modelListEl) return;
  // 既存の editing 状態をクリア
  clearEditingState();
  const placeholder = buildNewCardPlaceholder();
  modelListEl.insertBefore(placeholder, modelListEl.firstChild);
  placeholder.appendChild(formContainerEl);
  formContainerEl.hidden = false;
  rememberedEditingId = "new";
  // スクロールして見せる
  setTimeout(function () {
    placeholder.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

// ===== フォームの配置（編集） =====
function attachFormToCard(id) {
  if (!formContainerEl || !modelListEl || !id) return;
  clearEditingState();
  const card = modelListEl.querySelector('.model-card[data-config-id="' + cssEscape(id) + '"]');
  if (!card) return;
  card.classList.add("editing");
  card.appendChild(formContainerEl);
  formContainerEl.hidden = false;
  rememberedEditingId = id;
  setTimeout(function () {
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

// ===== フォームのデタッチ（保存・キャンセル時） =====
function detachForm() {
  if (!formContainerEl) return;
  clearEditingState();
  formContainerEl.hidden = true;
  if (formContainerEl.parentNode) formContainerEl.parentNode.removeChild(formContainerEl);
  rememberedEditingId = null;
  if (onFormClosedFn) onFormClosedFn();
}

function clearEditingState() {
  if (!modelListEl) return;
  // 編集中のカードから .editing を外し、new-card は削除
  const editingCards = modelListEl.querySelectorAll(".model-card.editing");
  editingCards.forEach(function (el) {
    if (el.getAttribute("data-new") === "true") {
      el.remove();
    } else {
      el.classList.remove("editing");
    }
  });
}

// ===== event delegation 登録 =====
function initCardEvents() {
  if (!modelListEl) {
    modelListEl = document.getElementById("modelList");
  }
  if (!modelListEl) return;
  modelListEl.addEventListener("click", function (e) {
    const emptyBtn = e.target.closest("#emptyAddBtn");
    if (emptyBtn) {
      const addBtn = document.getElementById("addModelBtn");
      if (addBtn) addBtn.click();
      return;
    }
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const id = btn.getAttribute("data-config-id");
      if (!id) return;
      if (btn.dataset.action === "edit" && onEditFn) onEditFn(id);
      else if (btn.dataset.action === "duplicate" && onDuplicateFn) onDuplicateFn(id);
      else if (btn.dataset.action === "delete" && onDeleteFn) onDeleteFn(id);
      return;
    }
    // カード本体（アクション以外）のクリック → 編集トグル
    const cardEl = e.target.closest(".model-card");
    if (cardEl) {
      const summary = e.target.closest(".card-summary");
      if (summary && onEditFn && !cardEl.hasAttribute("data-new")) {
        const id = cardEl.getAttribute("data-config-id");
        if (id) onEditFn(id);
      }
    }
  });
  modelListEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const summary = e.target.closest(".card-summary");
    if (!summary) return;
    const cardEl = summary.closest(".model-card");
    if (!cardEl) return;
    e.preventDefault();
    const id = cardEl.getAttribute("data-config-id");
    if (id && onEditFn) onEditFn(id);
  });
}

export {
  renderModelList,
  initCardEvents,
  setSearchKeyword,
  attachFormAsNew,
  attachFormToCard,
  detachForm
};
