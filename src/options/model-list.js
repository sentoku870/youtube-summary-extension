// ============================================================
//  model-list.js — 登録済みモデル一覧の描画
//  #modelList への event delegation 1個に統合（D-2 適用）。
//  編集・削除ボタンのハンドラを editConfig / deleteConfig に委譲。
// ============================================================
import { get, set, K } from "../../infrastructure/storage.js";
import { showStatus } from "./options-shared.js";

// 編集関数の参照（initListEvents で初期化）
let editConfigFn = null;
let deleteConfigFn = null;

export function bindListHandlers({ onEdit, onDelete }) {
  editConfigFn = onEdit;
  deleteConfigFn = onDelete;
}

// ===== 削除ハンドラ =====
async function deleteConfig(id) {
  const configs = (await get(K.API_CONFIGS)) || [];
  const newConfigs = configs.filter(function (c) {
    return c.id !== id;
  });
  await set({ [K.API_CONFIGS]: newConfigs });
  showStatus("status", "✓ 削除しました");
  await renderModelList();
  const { updateButtonModelSelects } = await import("./options-buttons.js");
  await updateButtonModelSelects();
}

// ===== 一覧描画 =====
async function renderModelList() {
  const listEl = document.getElementById("modelList");
  if (!listEl) return;
  const configs = (await get(K.API_CONFIGS)) || [];

  listEl.innerHTML = "";
  if (configs.length === 0) {
    listEl.innerHTML =
      '<li class="empty-msg">まだ登録されていません。上のフォームから追加してください。</li>';
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

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "編集";
    editBtn.setAttribute("data-action", "edit");
    editBtn.setAttribute("data-config-id", c.id);
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "secondary";
    delBtn.style.background = "#d32f2f";
    delBtn.textContent = "削除";
    delBtn.setAttribute("data-action", "delete");
    delBtn.setAttribute("data-config-id", c.id);
    actions.appendChild(delBtn);

    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

// ===== event delegation 登録（initModelsTab から呼ぶ） =====
function initListEvents() {
  const listEl = document.getElementById("modelList");
  if (!listEl) return;
  listEl.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-config-id");
    if (!id) return;
    if (btn.dataset.action === "edit" && editConfigFn) editConfigFn(id);
    else if (btn.dataset.action === "delete" && deleteConfigFn) deleteConfigFn(id);
  });
}

export { renderModelList, initListEvents, deleteConfig };
