// ============================================================
//  options-models.js — モデル管理タブのエントリポイント
//  カード描画 / フォーム表示 / 検索 / 削除確認 を束ねる。
//  フォームの DOM と値管理は model-form.js、
//  カードの描画と位置管理は model-card.js に委譲。
// ============================================================
import { get, set, K } from "../infrastructure/storage-core.js";
import { confirmDialog } from "./ui/confirm.js";
import { saveToast } from "./ui/toast.js";
import {
  renderModelList,
  initCardEvents,
  setSearchKeyword,
  attachFormAsNew,
  attachFormToCard,
  detachForm,
  setFormContainer,
  bindCardHandlers
} from "./model-card.js";
import { initForm, openFormForNew, openFormForEdit, setOnAfterSave } from "./model-form.js";
// B-3: options-buttons.js 廃止。button-card.js から直接 import。
import { refreshButtonModelSelects } from "./button-card.js";
import { generateId } from "./options-logic.js";

let isInitialized = false;

export function initModelsTab() {
  if (isInitialized) return;
  isInitialized = true;

  // 1) フォーム DOM を作る
  initForm();
  // 2) カードモジュールにフォーム参照を渡す
  const formDom = document.getElementById("modelFormContainer");
  if (formDom) setFormContainer(formDom);

  // 3) カード描画 + イベント登録
  bindCardHandlers({
    onEdit: handleEdit,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onFormClosed: handleFormClosed
  });
  initCardEvents();

  // 4) 保存成功時のコールバック
  setOnAfterSave(function () {
    detachForm();
    renderModelList().then(function () {
      return refreshButtonModelSelects();
    });
  });

  // 5) ツールバー
  const addBtn = document.getElementById("addModelBtn");
  if (addBtn) addBtn.addEventListener("click", handleAddNew);

  const searchInput = document.getElementById("modelSearchInput");
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(timer);
      const kw = searchInput.value;
      timer = setTimeout(function () {
        setSearchKeyword(kw);
      }, 150);
    });
  }

  // 6) 初期描画
  renderModelList().then(function () {
    return refreshButtonModelSelects();
  });
}

// ===== ハンドラ =====
function handleAddNew() {
  openFormForNew();
  attachFormAsNew();
}

async function handleEdit(id) {
  await openFormForEdit(id);
  attachFormToCard(id);
}

async function handleDuplicate(id) {
  // 複製 = 編集中データを「複製として保存」ボタンで保存
  // UX簡略化: 複製ボタンが押された場合、その場でフォームを開いて複製モードにする
  // （実装簡略化のため、編集と同じフォームを使い、保存ボタンが「複製として保存」に切替わる）
  const configs = (await get(K.API_CONFIGS)) || [];
  const src = configs.find(function (c) {
    return c.id === id;
  });
  if (!src) return;
  const copy = Object.assign({}, src, { id: undefined });
  delete copy.id;
  copy.label = (src.label || "無名") + " (コピー)";
  const newId = generateId();
  copy.id = newId;
  configs.push(copy);
  await set({ apiConfigs: configs });
  saveToast("✓ 複製しました");
  await renderModelList();
  await refreshButtonModelSelects();
}

async function handleDelete(id) {
  const configs = (await get(K.API_CONFIGS)) || [];
  const target = configs.find(function (c) {
    return c.id === id;
  });
  if (!target) return;
  const ok = await confirmDialog({
    title: "モデルを削除",
    message:
      "「" +
      (target.label || "無名") +
      "」を削除します。よろしいですか？\n※ この操作は取り消せません。",
    okLabel: "削除する",
    cancelLabel: "キャンセル"
  });
  if (!ok) return;
  const next = configs.filter(function (c) {
    return c.id !== id;
  });
  await set({ apiConfigs: next });
  saveToast("✓ 削除しました");
  await renderModelList();
  await refreshButtonModelSelects();
}

function handleFormClosed() {
  // 必要に応じて後処理（現状は何もしない）
}

export { renderModelList };
