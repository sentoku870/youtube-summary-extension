// ============================================================
//  transcript-fetcher/player-captions.js
//  YouTube プレイヤー UI 上に表示される字幕 DOM を読み取るフォールバック。
//  字幕トラック取得が失敗した場合の最後の砦として使う。
// ============================================================

const PLAYER_CAPTION_SELECTORS = [
  ".ytp-caption-segment",
  ".captions-text span",
  ".caption-window span"
];

/**
 * プレイヤー上の字幕 DOM からテキストを抽出する。
 * @returns {string[]} 字幕テキストの配列（時系列順）
 */
export function fetchPlayerCaptions() {
  const out = [];
  document.querySelectorAll(PLAYER_CAPTION_SELECTORS.join(", ")).forEach(function (el) {
    const t = (el.textContent || "").trim();
    if (t) out.push(t);
  });
  return out;
}
