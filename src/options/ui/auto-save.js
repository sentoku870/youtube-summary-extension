// ============================================================
//  auto-save.js — 自動保存 + インジケータ表示の共通ヘルパ（ESM版）
//  Phase B-4: button-card.js と options-display.js の重複実装を集約。
//  「保存中…」→「✓ 自動保存しました (HH:MM)」の UI 遷移と
//  デバウンス付きコミットを一体化したオブジェクトを返す。
//
//  使い方:
//    const saver = createAutoSave({
//      debounceMs: 300,
//      indicatorId: "buttonsAutoSaveStatus",
//      save: async () => { ... }  // chrome.storage への書き込み
//    });
//    inputEl.addEventListener("input", () => saver.schedule());
//    await saver.flush();  // タブ切替時の即時コミット用
// ============================================================

const DEFAULT_DEBOUNCE_MS = 300;
const SAVED_MESSAGE_DURATION_MS = 2500;

function getIndicator(id) {
  return id ? document.getElementById(id) : null;
}

function showSaving(indicator) {
  if (!indicator) return;
  indicator.classList.remove("saved");
  indicator.classList.add("saving");
  indicator.textContent = "保存中…";
}

function showSaved(indicator) {
  if (!indicator) return;
  indicator.classList.remove("saving");
  indicator.classList.add("saved");
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  indicator.textContent = "✓ 自動保存しました (" + hh + ":" + mm + ")";
  setTimeout(function () {
    if (indicator.classList.contains("saved")) {
      indicator.textContent = "";
      indicator.classList.remove("saved");
    }
  }, SAVED_MESSAGE_DURATION_MS);
}

function showError(indicator, message) {
  if (indicator) {
    indicator.classList.remove("saving", "saved");
    indicator.textContent = "✗ " + message;
  }
}

/**
 * 自動保存ヘルパを生成する
 * @param {object} opts
 * @param {number} [opts.debounceMs=300]
 * @param {string|null} [opts.indicatorId=null] - 表示インジケータ要素の id
 * @param {() => Promise<void>} opts.save - 実際の保存処理（chrome.storage 書き込み等）
 * @param {(message: string) => void} [opts.onError] - エラー通知（トースト等）
 * @returns {{ schedule, flush, isPending }}
 */
export function createAutoSave(opts) {
  const debounceMs = opts.debounceMs != null ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;
  const indicator = getIndicator(opts.indicatorId);
  const save = opts.save;
  const onError = opts.onError || function () {};

  let timer = null;

  async function commit() {
    timer = null;
    try {
      await save();
      showSaved(indicator);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      showError(indicator, "保存に失敗: " + msg);
      onError(msg);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    showSaving(indicator);
    timer = setTimeout(commit, debounceMs);
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      await commit();
    }
  }

  function isPending() {
    return timer !== null;
  }

  return { schedule, flush, isPending };
}
