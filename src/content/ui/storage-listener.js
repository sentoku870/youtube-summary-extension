// ============================================================
//  storage-listener.js — chrome.storage.onChanged リスナー管理
//  tabs.js から分離。設定変更をデバウンスして applyButtonTitles を再実行する。
//  bindEvents 再呼び出しと pagehide 時の removeListener を一元管理。
//  Phase 2-B: uiState 書き込みを setUiState 経由に統一。
// ============================================================
import { uiState as S, setUiState } from "../../shared/state.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("storage-listener");

// モジュールローカルなデバウンスタイマー。
// モジュールが再評価されない限り維持されるが、S.storageOnChangedListener が
// 再生成されたタイミングで参照が切れていないかを保証するため、cleanup 時に clear する。
let currentDebounceTimer = null;

/**
 * chrome.storage.onChanged リスナーを登録（冪等・再登録安全）。
 * tabs.js の bindEvents() から毎回呼ばれても安全。
 */
export function bindStorageListener(onUpdate) {
  // Phase 3-7: BFCache 復元時に旧 debounce タイマーが残っていると、
  // 新 listener の onUpdate を新 listener 参照でキャプチャ済みの旧
  // callback 経由で呼んでしまう。入口で必ずクリアして状態リークを防ぐ。
  if (currentDebounceTimer) {
    clearTimeout(currentDebounceTimer);
    currentDebounceTimer = null;
  }
  try {
    // 既存リスナーを解放
    if (S.storageOnChangedListener) {
      try {
        chrome.storage.onChanged.removeListener(S.storageOnChangedListener);
      } catch {
        /* context invalidated */
      }
    }
    const listener = function (changes) {
      let shouldUpdate = false;
      for (const key in changes) {
        if (key.indexOf("btnTitle_") === 0 || key.indexOf("prompt_") === 0) {
          shouldUpdate = true;
          break;
        }
      }
      if (!shouldUpdate) return;
      clearTimeout(currentDebounceTimer);
      currentDebounceTimer = setTimeout(function () {
        onUpdate();
      }, 150);
    };
    setUiState({ storageOnChangedListener: listener });
    chrome.storage.onChanged.addListener(listener);

    // ページ離脱 / BFCache 復元失敗時にリスナーを解放（メモリリーク予防）
    if (!S.storageOnChangedCleanupBound) {
      setUiState({ storageOnChangedCleanupBound: true });
      window.addEventListener("pagehide", function () {
        unbindStorageListener();
      });
    }
  } catch {
    log.warn(
      "storage.onChanged listener could not be registered (extension context may be invalid)."
    );
  }
}

/**
 * chrome.storage.onChanged リスナーを解放。
 * pagehide 時に呼ばれるほか、テストの teardown でも使用。
 */
export function unbindStorageListener() {
  if (S.storageOnChangedListener) {
    try {
      chrome.storage.onChanged.removeListener(S.storageOnChangedListener);
    } catch {
      /* context invalidated */
    }
    setUiState({ storageOnChangedListener: null });
  }
  if (currentDebounceTimer) {
    clearTimeout(currentDebounceTimer);
    currentDebounceTimer = null;
  }
}
