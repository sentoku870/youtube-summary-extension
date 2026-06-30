// ============================================================
//  appearance.js — 表示設定（フォント/テーマ/パネル高さ）のDOM反映
//  storage.js から抽出：infrastructure層は純粋なストレージI/Oのみとし、
//  DOM操作は UI層で行う（責務の分離）。
// ============================================================
import {
  loadFontSize,
  loadPanelHeight,
  loadThemeSetting
} from "../../infrastructure/storage-config.js";

// T1-P7: prefers-color-scheme 結果を MediaQueryList 単位でキャッシュ
// 同一セッション内の applyTheme 呼び出しごとに matchMedia を再評価する無駄を削減。
// ユーザー/システムが実際に切替えたとき（change イベント）はキャッシュを無効化。
// WeakMap を使うことで、テストや別経路で生成された別インスタンスでは自然に
// キャッシュミスとなる（テスト間の状態リークを防止）。
const darkCache = new WeakMap();
function prefersDarkCached() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (!mq) return false;
  if (darkCache.has(mq)) return darkCache.get(mq);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", function () {
      darkCache.delete(mq);
    });
  }
  darkCache.set(mq, mq.matches);
  return mq.matches;
}

// フォントサイズを #yt-summary-root の CSS変数に反映
export async function applyFontSize() {
  const size = await loadFontSize();
  const s = document.querySelector("#yt-summary-root");
  if (s) s.style.setProperty("--fs-base", size + "px");
}

// パネル高さ上限を #ys-panel の CSS変数に反映
// （max-height を設定し、これを超えるとパネル内でスクロール）
export async function applyPanelHeight() {
  const height = await loadPanelHeight();
  const panel = document.querySelector("#ys-panel");
  if (panel) panel.style.setProperty("--ys-panel-max-height", height + "px");
}

// テーマ属性を #yt-summary-root に反映
export async function applyTheme() {
  const theme = await loadThemeSetting();
  const isDark = theme === "dark" || (theme === "auto" && prefersDarkCached());
  const root = document.querySelector("#yt-summary-root");
  if (root) root.setAttribute("data-theme", isDark ? "dark" : "light");
}
