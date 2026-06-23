// ============================================================
//  ui/toast.js — トースト通知（共通UI）
//  設定画面のどこからでも saveToast / errorToast を呼び出せる。
//  画面右下に固定表示し、duration ms 後に自動消去（click で即消去）。
// ============================================================

const DEFAULT_DURATION = 2000;
const ERROR_DURATION = 4000;
let containerEl = null;

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement("div");
  containerEl.className = "ys-toast-container";
  containerEl.setAttribute("role", "status");
  containerEl.setAttribute("aria-live", "polite");
  document.body.appendChild(containerEl);
  return containerEl;
}

function showToast(message, type, duration) {
  if (!message) return;
  const container = ensureContainer();
  const el = document.createElement("div");
  el.className = "ys-toast ys-toast-" + (type || "info");
  el.textContent = message;
  const ttl = duration || (type === "error" ? ERROR_DURATION : DEFAULT_DURATION);
  const dismiss = function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  };
  el.addEventListener("click", dismiss);
  container.appendChild(el);
  setTimeout(dismiss, ttl);
}

export function saveToast(msg, duration) {
  if (!msg) return;
  showToast(msg, "success", duration || DEFAULT_DURATION);
}

export function errorToast(msg, duration) {
  if (!msg) return;
  showToast(msg, "error", duration || ERROR_DURATION);
}
