// tests/__helpers__/dom-mock.js — DOM 要素生成ヘルパ
// jsdom 環境で頻繁に使う要素生成・パターンを共通化。

/**
 * div 要素を作成してテキストを設定する。
 *
 * @param {string} [text=""]
 * @param {string} [className]
 * @returns {HTMLDivElement}
 */
function makeDiv(text, className) {
  const d = document.createElement("div");
  if (className) d.className = className;
  d.textContent = text != null ? text : "";
  return d;
}

/**
 * body の innerHTML をクリアする（テスト間の分離）。
 */
function clearBody() {
  document.body.innerHTML = "";
}

/**
 * YouTube watch ページの最小限の DOM を構築する（テスト用）。
 * #primary, #secondary, #secondary-inner, ytd-watch-flexy を含める。
 *
 * @returns {object} 構築された主要要素の参照
 */
function setupYouTubeWatchDom() {
  clearBody();
  const watch = document.createElement("ytd-watch-flexy");
  const primary = document.createElement("div");
  primary.id = "primary";
  const secondary = document.createElement("div");
  secondary.id = "secondary";
  const secondaryInner = document.createElement("div");
  secondaryInner.id = "secondary-inner";
  secondary.appendChild(secondaryInner);
  watch.appendChild(primary);
  watch.appendChild(secondary);
  document.body.appendChild(watch);
  return {
    watch,
    primary,
    secondary,
    secondaryInner
  };
}

/**
 * navigator.onLine を一時的に上書きする。
 * テスト終了時に restore() を呼ぶこと。
 *
 * @param {boolean} value
 * @returns {{ restore: () => void }}
 */
function mockNavigatorOnline(value) {
  let originalDescriptor = null;
  try {
    originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
  } catch {
    originalDescriptor = null;
  }
  Object.defineProperty(navigator, "onLine", {
    value: value,
    configurable: true,
    writable: true
  });
  return {
    restore: function () {
      try {
        if (originalDescriptor) {
          Object.defineProperty(navigator, "onLine", originalDescriptor);
        } else {
          Object.defineProperty(navigator, "onLine", {
            value: true,
            configurable: true,
            writable: true
          });
        }
      } catch {
        // jsdom環境では復元できない場合がある（無視）
      }
    }
  };
}

module.exports = {
  makeDiv,
  clearBody,
  setupYouTubeWatchDom,
  mockNavigatorOnline
};
