// tests/toast.test.js — トースト通知の単体テスト
const { saveToast, errorToast } = require("../src/options/ui/toast.js");

describe("toast", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("saveToast は .ys-toast-container を body に作成する", () => {
    saveToast("✓ 保存しました");
    const container = document.querySelector(".ys-toast-container");
    expect(container).not.toBeNull();
    expect(container.getAttribute("role")).toBe("status");
    expect(container.getAttribute("aria-live")).toBe("polite");
  });

  test("トースト要素がコンテナに追加される", () => {
    saveToast("テストメッセージ");
    const toast = document.querySelector(".ys-toast");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe("テストメッセージ");
    expect(toast.className).toContain("ys-toast-success");
  });

  test("errorToast は error クラスを付与", () => {
    errorToast("エラー");
    const toast = document.querySelector(".ys-toast");
    expect(toast.className).toContain("ys-toast-error");
  });

  test("複数のトーストをスタックできる", () => {
    saveToast("1");
    saveToast("2");
    saveToast("3");
    const toasts = document.querySelectorAll(".ys-toast");
    expect(toasts.length).toBe(3);
  });

  test("click で即時消去", () => {
    saveToast("clickable");
    const toast = document.querySelector(".ys-toast");
    expect(toast).not.toBeNull();
    toast.click();
    expect(document.querySelector(".ys-toast")).toBeNull();
  });

  test("duration 経過後に自動消去", () => {
    jest.useFakeTimers();
    saveToast("auto dismiss", 1000);
    expect(document.querySelector(".ys-toast")).not.toBeNull();
    jest.advanceTimersByTime(1100);
    expect(document.querySelector(".ys-toast")).toBeNull();
    jest.useRealTimers();
  });

  test("errorToast はより長い duration (4000ms) を持つ", () => {
    jest.useFakeTimers();
    errorToast("長時間エラー");
    jest.advanceTimersByTime(3000);
    expect(document.querySelector(".ys-toast")).not.toBeNull();
    jest.advanceTimersByTime(1100);
    expect(document.querySelector(".ys-toast")).toBeNull();
    jest.useRealTimers();
  });

  test("空メッセージは何もしない", () => {
    saveToast("");
    expect(document.querySelector(".ys-toast")).toBeNull();
  });

  test("コンテナは再利用される", () => {
    saveToast("1回目");
    const first = document.querySelector(".ys-toast-container");
    saveToast("2回目");
    const second = document.querySelector(".ys-toast-container");
    expect(first).toBe(second);
  });
});
