// ============================================================
//  panel.js — DOM生成・CSS読み込み・ボタン制御（ESM版）
//  state は直接 import。UI層の他モジュールも ESM import を使用。
//
//  【重要】配置ロジック改善
//  - YouTube の右カラム(#secondary / #secondary-inner)はページ読み込み後に
//    非同期レンダリングされるため、出現まで待ってから配置する。
//  - YouTube 側が #secondary-inner 配下の未知要素に .hidden を付与して
//    display:none にしてしまうのを監視して即座に除去する。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { applyTheme, applyFontSize, applyPanelHeight } from "./appearance.js";
import { createLogger } from "../../shared/logger.js";
import "./sidebar.css";

const log = createLogger("panel");

// ===== DOM 検索キャッシュ =====
// querySelector を毎フレーム呼ぶと CPU 負荷になる。
// 同一セレクタの結果をパネルインスタンス毎にキャッシュする。
// パネル破棄時はキャッシュも自動的に無効化（WeakMap）。
// null 結果はキャッシュしない（動的に追加される要素を考慮）。
const elCache = new WeakMap();

// ===== 内部ヘルパー =====
export function getEl(id) {
  const panel = S.panelEl;
  if (!panel) return null;
  let cache = elCache.get(panel);
  if (!cache) {
    cache = new Map();
    elCache.set(panel, cache);
  }
  if (cache.has(id)) {
    const cached = cache.get(id);
    // ノードが DOM から切り離されていたら再検索
    if (cached && cached.isConnected) return cached;
  }
  const el = panel.querySelector(id);
  if (el) cache.set(id, el);
  return el || null;
}

// ===== ボタン制御 =====
export function disableAllButtons() {
  const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
  btns.forEach(function (b) {
    b.disabled = true;
  });
}

export function enableAllButtons() {
  const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
  btns.forEach(function (b) {
    b.disabled = false;
  });
}

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
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
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
  }, 30000);
}

// ===== パネルの配置（非同期） =====
// createPanel() から呼ばれる。secondary-inner が現れるまで待ち、
// 関連動画の上（#related の手前）に挿入する。
// 戻り値: Promise（配置完了後にテーマ・フォントサイズを適用するため）
function placePanel(panel) {
  return waitForSecondary(5000)
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

// ===== サイドバーDOM生成 =====
export function createPanel() {
  if (S.panelEl) return S.panelEl;

  S.tabIds = ["summary", "customA", "customB"];
  S.tabs = {};
  S.tabIds.forEach(function (id) {
    S.tabs[id] = {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    };
  });

  S.panelEl = document.createElement("div");
  S.panelEl.id = "yt-summary-root";
  S.panelEl.innerHTML =
    '<div class="ys-tab-row">' +
    '<button id="ys-btn-summary" class="ys-tab-btn">📝 要約</button>' +
    '<button id="ys-btn-customA" class="ys-tab-btn">📊 分析</button>' +
    '<button id="ys-btn-customB" class="ys-tab-btn">💡 考察</button>' +
    "</div>" +
    '<div id="ys-panel" style="display:none">' +
    '<div id="ys-error"></div>' +
    '<div id="ys-content-area">' +
    '<div id="ys-summaryText" class="ys-md"></div>' +
    '<div id="ys-progress" style="display:none;padding:8px;background:#444;color:#fff;border-radius:4px;font-size:12px;margin:4px 0;"></div>' +
    '<div id="ys-infoRow">' +
    '<span id="ys-infoLabel"></span>' +
    '<button id="ys-copyBtn" class="ys-action-btn" style="display:none;margin-left:8px;">📋 コピー</button>' +
    '<button id="ys-regenBtn" class="ys-action-btn" style="display:none;margin-left:4px;">🔄 再生成</button>' +
    "</div>" +
    '<div id="ys-chatHistory"></div>' +
    "</div>" +
    '<div id="ys-chatArea" style="display:none;">' +
    '<div class="chat-row">' +
    '<textarea id="ys-chatInput" rows="1" placeholder="質問を入力... (Enter=送信 / Shift+Enter=改行)"></textarea>' +
    '<button id="ys-chatClearBtn">クリア</button>' +
    "</div>" +
    "</div>" +
    "</div>";

  disableAllButtons();
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) btnSummary.textContent = "⏳ 字幕取得中...";

  // 配置（非同期：#secondary が現れるまで待ってから配置）
  // テーマ・フォントサイズは「配置完了後」に適用する
  // （applyTheme/applyFontSize が document.querySelector で要素を探すため、
  //   挿入前に呼ぶと null になり適用されないバグを修正）
  placePanel(S.panelEl).then(function () {
    applyTheme();
    applyFontSize();
    applyPanelHeight();
  });

  return S.panelEl;
}
