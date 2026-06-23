// ============================================================
//  options-buttons.js — ボタン・プロンプトタブ UI
//  3つの要約ボタンに割り当てるモデル・プロンプト・表示名、
//  「すべて保存」ハンドラを担当。
// ============================================================
import { get, set, K } from "../infrastructure/storage.js";
import { promptKey, btnTitleKey, btnApiConfigKey } from "./options-logic.js";
import { getVal, showStatus } from "./options-shared.js";

// ===== ボタンのモデル選択肢を更新 =====
export async function updateButtonModelSelects() {
  const configs = (await get(K.API_CONFIGS)) || [];
  const selectIds = ["btnApiConfig_summary", "btnApiConfig_customA", "btnApiConfig_customB"];

  selectIds.forEach(function (selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">（モデルを選択）</option>';
    configs.forEach(function (c) {
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

// ===== イベント登録（DOMContentLoaded で呼ぶ） =====
export function initButtonsTab() {
  // すべて保存
  document.getElementById("saveAllBtn").addEventListener("click", async function () {
    const saveData = {};
    saveData[promptKey("summary")] = getVal("prompt_summary").trim();
    saveData[promptKey("customA")] = getVal("prompt_customA").trim();
    saveData[promptKey("customB")] = getVal("prompt_customB").trim();
    saveData[btnTitleKey("customA")] = getVal("btnTitle_customA").trim();
    saveData[btnTitleKey("customB")] = getVal("btnTitle_customB").trim();
    saveData[btnApiConfigKey("summary")] = getVal("btnApiConfig_summary");
    saveData[btnApiConfigKey("customA")] = getVal("btnApiConfig_customA");
    saveData[btnApiConfigKey("customB")] = getVal("btnApiConfig_customB");
    saveData[K.FONT_SIZE] = getVal("fontSize");
    saveData[K.PANEL_HEIGHT] = getVal("panelHeight");
    saveData[K.THEME] = getVal("theme");
    saveData[K.SUBTITLE_LANG] = getVal("subtitleLang");
    await set(saveData);
    showStatus("status", "✓ 保存しました");
  });
}
