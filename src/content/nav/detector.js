// ============================================================
//  nav/detector.js — SPA ナビゲーション検出と初期化
//  5 つのイベントソース（yt-navigate-finish / yt-page-data-updated /
//  popstate / hashchange / pageshow）+ URL ポーリングフォールバックで
//  YouTube の SPA 動画切替を検出する。
//  index.js の Port/Adapter 注入とは独立に動作するため、
//  UI 層 (event-bridge.js / message-handler.js) のテストからも
//  startNavigationDetection() をモックなしで呼び出せる。
// ============================================================
import { DOM_EVENTS, INTERNAL_EVENTS, emit, on } from "../../shared/event-bus.js";
import { isYouTubeWatchPage } from "../../shared/utils.js";
import { createLogger } from "../../shared/logger.js";
import { setUiState } from "../../shared/state.js";
import { applyButtonTitles } from "../ui/tabs-ui.js";
import { bindStorageListener } from "../ui/storage-listener.js";
import { handleNavigation, setSafeInit } from "./resetter.js";

const log = createLogger("nav/detector");

const FALLBACK_POLL_INTERVAL_MS = 10000;
const FALLBACK_POLL_MAX_IDLE_MS = 5 * 60 * 1000;

// B-4: YouTube は同じ動画切替で yt-navigate-finish と yt-page-data-updated を
// 両方発火するため、両方が NAV_FINISH にブリッジされて handleNavigation が
// リセット → 再 init を 2 回実行してしまう。短時間 (200ms) 内の同一 URL 通知は
// 2 回目以降をスキップして二重処理を防ぐ。
const NAV_DEDUPE_WINDOW_MS = 200;

let fallbackTimerId = null;
let lastObservedUrl = null;
let lastNavAt = 0;
let lastHandledUrl = null;
let lastHandledAt = 0;
let navigationInitialized = false;

// ===== フォールバックポーリング =====
function stopFallbackPolling() {
  if (fallbackTimerId !== null) {
    clearInterval(fallbackTimerId);
    fallbackTimerId = null;
  }
}

function startFallbackPolling() {
  if (fallbackTimerId !== null) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  fallbackTimerId = setInterval(function () {
    const url = location.href;
    if (url !== lastObservedUrl) {
      lastObservedUrl = url;
      lastNavAt = Date.now();
      // N-4: 直接 handleNavigation() を呼ばず、emit 経由で NAV_DEDUPE ガードを通す。
      // SPA イベントとポーリングが同じ URL を検出しても二重リセットを防ぐ。
      if (isYouTubeWatchPage(url)) {
        emit(INTERNAL_EVENTS.NAV_FINISH, { url: url });
      }
      return;
    }
    if (Date.now() - lastNavAt > FALLBACK_POLL_MAX_IDLE_MS) {
      stopFallbackPolling();
    }
  }, FALLBACK_POLL_INTERVAL_MS);
}

// ===== BFCache / pageshow 復元対応 =====
function bindPageShowHandler() {
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted && isYouTubeWatchPage(location.href)) {
      log.log("BFCache から復元されました。再初期化します。");
      setUiState({ initialized: false });
      handleNavigation();
      // B-1: pagehide で chrome.storage.onChanged リスナーが解除されているため、
      // 復元時に applyButtonTitles を呼んでボタン表示とストレージ監視を再有効化する。
      // bindStorageListener は冪等 (内部で旧リスナーを removeListener する) なので
      // 安全に再呼び出し可能。
      try {
        bindStorageListener(applyButtonTitles);
      } catch (e) {
        log.warn("BFCache 復元時の storage listener 再登録に失敗:", e);
      }
    }
  });
}

// ===== visibilitychange でポーリングを一時停止 / 再開 =====
function bindVisibilityHandler() {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      stopFallbackPolling();
    } else if (document.visibilityState === "visible") {
      lastNavAt = Date.now();
      lastObservedUrl = location.href;
      startFallbackPolling();
    }
  });
}

// ===== 内部用: スポーンイベントリスナーを束ねる =====
function bindDomBridges() {
  document.addEventListener(DOM_EVENTS.YT_NAVIGATE_FINISH, function () {
    emit(INTERNAL_EVENTS.NAV_FINISH, { url: location.href });
  });
  document.addEventListener("yt-page-data-updated", function () {
    emit(INTERNAL_EVENTS.NAV_FINISH, { url: location.href });
  });
  // N-3: popstate にも hashchange と同じ #t=NN 抑制を入れる。
  // 戻る/進むで #t= ハッシュが残っていると無条件で handleNavigation が
  // 走ってしまい、#ys-panel がリセットされる問題があった。
  window.addEventListener("popstate", function () {
    if (/[#&]t=\d+/.test(location.hash)) return;
    emit(INTERNAL_EVENTS.NAV_FINISH, { url: location.href });
  });
  window.addEventListener("hashchange", function () {
    if (/[#&]t=\d+/.test(location.hash)) return;
    emit(INTERNAL_EVENTS.NAV_FINISH, { url: location.href });
  });
  on(INTERNAL_EVENTS.NAV_FINISH, function (payload) {
    if (!payload || !payload.url || !isYouTubeWatchPage(payload.url)) return;
    // B-4: 同一 URL の短時間連発を 1 回の handleNavigation にまとめる。
    // 異なる URL の場合はガードを無視（通常の動画切替）。
    const now = Date.now();
    if (lastHandledUrl === payload.url && now - lastHandledAt < NAV_DEDUPE_WINDOW_MS) {
      log.log("NAV_FINISH dedupe: skip (same url within " + NAV_DEDUPE_WINDOW_MS + "ms)");
      return;
    }
    lastHandledUrl = payload.url;
    lastHandledAt = now;
    handleNavigation();
  });
}

/**
 * ナビゲーション検出を開始する（冪等）。
 * index.js から safeInit を引数で渡すことで、
 * 動画切替時に再初期化が走る。
 *
 * @param {Function} onReinit - 動画切替時に呼ぶ再初期化関数
 */
export function startNavigationDetection(onReinit) {
  if (navigationInitialized) return;
  navigationInitialized = true;
  setSafeInit(onReinit);
  lastObservedUrl = location.href;
  lastNavAt = Date.now();

  bindDomBridges();
  bindPageShowHandler();
  bindVisibilityHandler();
  startFallbackPolling();
}

// テスト用: 内部状態をリセット（ナビゲーションを停止し再初期化可能にする）
// 本体冒頭のガードで prod ビルド時は即 return するため、
// 実コストは export 1 つ分のコストのみ。
export function __resetNavigationForTest() {
  if (!globalThis.__DEV__) return;
  stopFallbackPolling();
  setSafeInit(null);
  lastObservedUrl = null;
  lastNavAt = 0;
  lastHandledUrl = null;
  lastHandledAt = 0;
  navigationInitialized = false;
}
