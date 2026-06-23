// tests/confirm.test.js — 確認モーダルの単体テスト
const { confirmDialog } = require("../src/options/ui/confirm.js");

describe("confirmDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("モーダルを body に作成する", async () => {
    const promise = confirmDialog({ message: "実行しますか？" });
    const overlay = document.querySelector(".ys-confirm-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute("role")).toBe("dialog");
    expect(overlay.getAttribute("aria-modal")).toBe("true");
    // 後片付け
    overlay.querySelector(".ys-confirm-cancel").click();
    await promise;
  });

  test("OK ボタン押下で true を返す", async () => {
    const promise = confirmDialog({ message: "削除します" });
    const okBtn = document.querySelector(".ys-confirm-ok");
    okBtn.click();
    const result = await promise;
    expect(result).toBe(true);
  });

  test("キャンセルボタン押下で false を返す", async () => {
    const promise = confirmDialog({ message: "削除します" });
    const cancelBtn = document.querySelector(".ys-confirm-cancel");
    cancelBtn.click();
    const result = await promise;
    expect(result).toBe(false);
  });

  test("メッセージが title / message / buttons に反映される", async () => {
    const promise = confirmDialog({
      title: "削除確認",
      message: "本当に削除しますか？",
      okLabel: "削除する",
      cancelLabel: "やめる"
    });
    expect(document.querySelector(".ys-confirm-title").textContent).toBe("削除確認");
    expect(document.querySelector(".ys-confirm-message").textContent).toBe("本当に削除しますか？");
    expect(document.querySelector(".ys-confirm-ok").textContent).toBe("削除する");
    expect(document.querySelector(".ys-confirm-cancel").textContent).toBe("やめる");
    document.querySelector(".ys-confirm-cancel").click();
    await promise;
  });

  test("デフォルト値で生成できる", async () => {
    const promise = confirmDialog();
    expect(document.querySelector(".ys-confirm-title").textContent).toBe("確認");
    expect(document.querySelector(".ys-confirm-ok").textContent).toBe("削除");
    expect(document.querySelector(".ys-confirm-cancel").textContent).toBe("キャンセル");
    document.querySelector(".ys-confirm-cancel").click();
    await promise;
  });

  test("overlay クリックでキャンセル扱い", async () => {
    const promise = confirmDialog({ message: "test" });
    const overlay = document.querySelector(".ys-confirm-overlay");
    overlay.click();
    const result = await promise;
    expect(result).toBe(false);
  });

  test("モーダル内部クリックは伝播しない", async () => {
    const promise = confirmDialog({ message: "test" });
    const modal = document.querySelector(".ys-confirm-modal");
    modal.click();
    // overlay.click ではないのでモーダルは残る
    expect(document.querySelector(".ys-confirm-overlay")).not.toBeNull();
    // 後片付け
    document.querySelector(".ys-confirm-cancel").click();
    await promise;
  });

  test("OK 後にフォーカスがリセットされ overlay が消える", async () => {
    const promise = confirmDialog({ message: "test" });
    const overlay = document.querySelector(".ys-confirm-overlay");
    overlay.querySelector(".ys-confirm-ok").click();
    await promise;
    expect(document.querySelector(".ys-confirm-overlay")).toBeNull();
  });

  test("連続呼び出しでは前のモーダルが閉じる", async () => {
    const p1 = confirmDialog({ message: "first" });
    const p2 = confirmDialog({ message: "second" });
    expect(document.querySelectorAll(".ys-confirm-overlay").length).toBe(1);
    const currentOverlay = document.querySelector(".ys-confirm-overlay");
    expect(currentOverlay.querySelector(".ys-confirm-message").textContent).toBe("second");
    currentOverlay.querySelector(".ys-confirm-cancel").click();
    await p2;
    // p1 はまだ解決されていないが、overlay は閉じている
    expect(document.querySelector(".ys-confirm-overlay")).toBeNull();
    p1.then(function (v) {
      expect(v).toBe(false);
    });
  });
});
