// ============================================================
//  ui/confirm.js — 削除確認モーダル（共通UI）
//  window.confirm() は ESC で閉じない・スタイル不可・非推奨気味。
//  カスタムモーダルで「OK / キャンセル」を Promise で返す。
// ============================================================

const DEFAULT_TITLE = "確認";
const DEFAULT_OK_LABEL = "削除";
const DEFAULT_CANCEL_LABEL = "キャンセル";

let activeOverlay = null;

function closeModal(overlay) {
  if (!overlay) return;
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  if (activeOverlay === overlay) activeOverlay = null;
  document.removeEventListener("keydown", onKeydown);
}

function onKeydown(e) {
  if (!activeOverlay) return;
  if (e.key === "Escape") {
    e.preventDefault();
    const overlay = activeOverlay;
    closeModal(overlay);
    // ESC 押下時はキャンセル扱い（resolve(false) を呼ぶ）
    // Promise 解決のため、activeOverlay._resolver() を呼ぶ
    if (typeof overlay._resolver === "function") overlay._resolver(false);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const okBtn = activeOverlay.querySelector(".ys-confirm-ok");
    if (okBtn) okBtn.click();
  }
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function confirmDialog(options) {
  const opts = options || {};
  return new Promise(function (resolve) {
    // 既にモーダルが開いていれば閉じる（前の Promise を false で解決）
    if (activeOverlay) {
      const prevOverlay = activeOverlay;
      if (typeof prevOverlay._resolver === "function") prevOverlay._resolver(false);
      closeModal(prevOverlay);
    }

    const overlay = document.createElement("div");
    overlay.className = "ys-confirm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ys-confirm-title");

    const modal = el("div", "ys-confirm-modal");
    const titleEl = el("h3", "ys-confirm-title", opts.title || DEFAULT_TITLE);
    titleEl.id = "ys-confirm-title";
    const messageEl = el("p", "ys-confirm-message", opts.message || "実行しますか？");
    const actions = el("div", "ys-confirm-actions");
    const cancelBtn = el(
      "button",
      "ys-confirm-cancel secondary",
      opts.cancelLabel || DEFAULT_CANCEL_LABEL
    );
    cancelBtn.type = "button";
    const okBtn = el("button", "ys-confirm-ok", opts.okLabel || DEFAULT_OK_LABEL);
    okBtn.type = "button";

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    modal.appendChild(titleEl);
    modal.appendChild(messageEl);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    cancelBtn.addEventListener("click", function () {
      closeModal(overlay);
      resolve(false);
    });
    okBtn.addEventListener("click", function () {
      closeModal(overlay);
      resolve(true);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeModal(overlay);
        resolve(false);
      }
    });

    // ESC キー押下時に resolve(false) を呼べるよう resolver を保持
    overlay._resolver = resolve;

    document.body.appendChild(overlay);
    activeOverlay = overlay;
    document.addEventListener("keydown", onKeydown);
    // requestAnimationFrame で次フレームにフォーカス。
    // 旧 setTimeout(0) よりレイアウト確定後にフォーカスされチラつきを抑える。
    // rAF 非対応環境では setTimeout(0) にフォールバック。
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : function (cb) {
            return setTimeout(cb, 0);
          };
    raf(function () {
      okBtn.focus();
    });
  });
}
