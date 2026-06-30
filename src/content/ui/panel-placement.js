// ============================================================
//  panel-placement.js — YouTube 右カラムへのパネル配置戦略（ESM版）
//  Phase C-1: panel.js から分割。
//  YouTube の #secondary / #secondary-inner / #related / body への
//  段階的フォールバック配置と、.hidden 監視による表示保証を担当。
//
//  依存:
//    - createLogger: パネル配置のログ
//    - YouTube DOM (window.document 経由)
//
//  公開 API:
//    - placePanel(panel) -> Promise<void>
// ============================================================
import { createLogger } from "../../shared/logger.js";

const log = createLogger("panel-placement");

const DEFAULT_WAIT_MS = 5000;
const RELOCATE_OBSERVER_TIMEOUT_MS = 30000;
const SECONDARY_POLL_INTERVAL_MS = 100;

// ===== 動画ページのサイドバーを取得（YouTube レイアウト変更に対応） =====
// 優先順序:
//   1) ytd-watch-flexy #secondary-inner  （関連動画 #related の親。ここに入れば関連動画の上に配置可能）
//   2) #secondary-inner（一般）
//   3) ytd-watch-flexy #secondary
//   4) #secondary
//   5) #related（最後のフォールバック）
//
// 戻り値: { el, source, preferRelatedRef } または null
//   preferRelatedRef = true の場合、el の直下にある #related を基準にして
//   insertBefore(panel, #related) で「関連動画の上」に配置する。
function getWatchSecondary() {
  let el = document.querySelector("ytd-watch-flexy #secondary-inner");
  if (el) return { el: el, source: "watch-flexy #secondary-inner", preferRelatedRef: true };

  el = document.querySelector("#secondary-inner");
  if (el) return { el: el, source: "#secondary-inner", preferRelatedRef: true };

  el = document.querySelector("ytd-watch-flexy #secondary");
  if (el) return { el: el, source: "watch-flexy #secondary", preferRelatedRef: false };

  el = document.querySelector("#secondary");
  if (el) return { el: el, source: "#secondary", preferRelatedRef: false };

  el = document.querySelector("#related");
  if (el) return { el: el, source: "#related", preferRelatedRef: false };

  return null;
}

// ===== #secondary / #secondary-inner が現れるまで待つ =====
// YouTube の右カラムはページ読み込み後に非同期レンダリングされるため、
// 早すぎるフォールバック（#related や body）を防ぐ。
// source が "#secondary..." を含む場合のみ「正しい位置が見つかった」とみなす。
function waitForSecondary(maxWaitMs) {
  return new Promise(function (resolve) {
    const isSecondary = function (r) {
      return !!r && r.source.indexOf("#secondary") !== -1;
    };
    const direct = getWatchSecondary();
    if (isSecondary(direct)) {
      resolve(direct);
      return;
    }
    const start = Date.now();
    const tick = function () {
      const r = getWatchSecondary();
      if (isSecondary(r)) {
        resolve(r);
        return;
      }
      if (Date.now() - start >= maxWaitMs) {
        // タイムアウト: best-effort（#related or null）を返す
        resolve(r);
        return;
      }
      setTimeout(tick, SECONDARY_POLL_INTERVAL_MS);
    };
    setTimeout(tick, SECONDARY_POLL_INTERVAL_MS);
  });
}

// ===== YouTube 側から付与される .hidden を除去・監視 =====
// Polymer/YouTube が #secondary-inner 配下の未知要素に .hidden を付与して
// display:none にしてしまうのを防ぐ。
// 監視は WeakMap で管理（パネル破棄時に Observer も自動 GC される）
const hiddenObservers = new WeakMap();

function ensureVisibleAndWatch(panel) {
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
  }
  panel.removeAttribute("hidden");
  if (hiddenObservers.has(panel)) return;
  const mo = new MutationObserver(function () {
    if (panel.classList.contains("hidden")) {
      panel.classList.remove("hidden");
      log.warn("YouTube 側から .hidden が付与されたため除去しました");
    }
    if (panel.hasAttribute("hidden")) {
      panel.removeAttribute("hidden");
    }
  });
  mo.observe(panel, { attributes: true, attributeFilter: ["class", "hidden"] });
  hiddenObservers.set(panel, mo);
}

// ===== 配置状態をログ出力 =====
function logPlacement(panel) {
  try {
    const cs = getComputedStyle(panel);
    const parent = panel.parentNode;
    log.log(
      "パネル状態: display=" +
        cs.display +
        " width=" +
        panel.offsetWidth +
        "px" +
        " parent=" +
        (parent ? parent.tagName + "#" + parent.id : "null")
    );
  } catch {
    /* 計測失敗は無視 */
  }
}

// ===== body フォールバック後、secondary 出現で再配置 =====
function relocateWhenReady(panel) {
  const obs = new MutationObserver(function () {
    const r = getWatchSecondary();
    if (r && r.source.indexOf("#secondary") !== -1 && panel.parentNode !== r.el) {
      let refNode = null;
      if (r.preferRelatedRef) {
        const related = r.el.querySelector(":scope > #related");
        if (related) refNode = related;
      }
      r.el.insertBefore(panel, refNode);
      ensureVisibleAndWatch(panel);
      log.log("サイドバー出現につきパネルを再配置しました @ " + r.source);
      logPlacement(panel);
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  setTimeout(function () {
    obs.disconnect();
  }, RELOCATE_OBSERVER_TIMEOUT_MS);
}

/**
 * パネルを YouTube 右カラムに配置する。
 * #secondary-inner が現れるまで最大 maxWaitMs 待ち、関連動画の上に挿入する。
 * 見つからない場合は body にフォールバックし、後に #secondary が出現したら再配置する。
 *
 * @param {HTMLElement} panel - 配置対象パネル
 * @param {number} [maxWaitMs=5000] - #secondary を待つ最大時間
 * @returns {Promise<void>} 配置処理の完了（または body フォールバックの設定完了）
 */
export function placePanel(panel, maxWaitMs) {
  const wait = maxWaitMs != null ? maxWaitMs : DEFAULT_WAIT_MS;
  return waitForSecondary(wait)
    .then(function (result) {
      if (!result) {
        // どこにも入れない場合は body にフォールバックし、後で再挑戦
        log.warn("サイドバーが見つかりません。body直下にフォールバックします。");
        if (panel.parentNode !== document.body) {
          document.body.appendChild(panel);
        }
        relocateWhenReady(panel);
        ensureVisibleAndWatch(panel);
        logPlacement(panel);
        return;
      }
      const parent = result.el;
      // secondary-inner の場合は #related の手前に（関連動画の上）
      let refNode = null;
      if (result.preferRelatedRef) {
        const related = parent.querySelector(":scope > #related");
        if (related) refNode = related;
      }
      if (panel.parentNode !== parent || panel.nextSibling !== refNode) {
        parent.insertBefore(panel, refNode);
      }
      ensureVisibleAndWatch(panel);
      logPlacement(panel);
      log.log("パネルを挿入しました @ " + result.source);
    })
    .catch(function (err) {
      // 配置処理中の例外を捕捉（MutationObserver / DOM 操作の想定外失敗対策）
      log.error("パネル配置に失敗しました:", err);
      if (panel.parentNode !== document.body) {
        try {
          document.body.appendChild(panel);
        } catch {
          /* body 不在時など */
        }
      }
    });
}