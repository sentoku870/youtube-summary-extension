// ============================================================
//  appearance.js — 表示設定（フォント/テーマ/パネル高さ）のDOM反映
//  storage.js から抽出：infrastructure層は純粋なストレージI/Oのみとし、
//  DOM操作は UI層で行う（責務の分離）。
// ============================================================
import { loadFontSize, loadPanelHeight, loadThemeSetting } from "../../infrastructure/storage.js";

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
  const isDark = theme === "dark" ||
    (theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.querySelector("#yt-summary-root");
  if (root) root.setAttribute("data-theme", isDark ? "dark" : "light");
}