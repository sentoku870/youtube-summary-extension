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

  // ===== キーボードハンドリング =====
  describe("キーボード操作", () => {
    test("Escape キーでモーダルが閉じて false を返す", async () => {
      const promise = confirmDialog({ message: "test" });
      // requestAnimationFrame を待たずに keydown イベントを送る
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const result = await promise;
      expect(result).toBe(false);
      expect(document.querySelector(".ys-confirm-overlay")).toBeNull();
    });

    test("Enter キーで OK ボタンがクリックされ true を返す", async () => {
      const promise = confirmDialog({ message: "test" });
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      const result = await promise;
      expect(result).toBe(true);
      expect(document.querySelector(".ys-confirm-overlay")).toBeNull();
    });

    test("無関係なキー（例: a）は何もせず false にも true にもしない", () => {
      const promise = confirmDialog({ message: "test" });
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      // モーダルは開いたまま
      expect(document.querySelector(".ys-confirm-overlay")).not.toBeNull();
      // 後片付け
      document.querySelector(".ys-confirm-cancel").click();
      return promise;
    });

    test("モーダル閉じた後の keydown は無視される", () => {
      const promise1 = confirmDialog({ message: "first" });
      const overlay = document.querySelector(".ys-confirm-overlay");
      overlay.querySelector(".ys-confirm-cancel").click();
      return promise1.then(function () {
        // 閉じた後にもう一度 Escape を送っても何もしない（activeOverlay が null）
        expect(() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        }).not.toThrow();
      });
    });

    test("2 回連続呼び出しでもキーリスナは1つだけ", async () => {
      const p1 = confirmDialog({ message: "first" });
      const p2 = confirmDialog({ message: "second" });
      // Escape で閉じる
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const r2 = await p2;
      expect(r2).toBe(false);
      // p1 も閉じられている（連続呼び出しで前のモーダルが破棄されたため）
      const r1 = await p1;
      expect(r1).toBe(false);
    });
  });

  // ★ C-5: pagehide イベントでモーダルが閉じて false で resolve される
  test("pagehide イベントで pending Promise が false で resolve される", async () => {
    const promise = confirmDialog({ message: "test" });
    expect(document.querySelector(".ys-confirm-overlay")).not.toBeNull();
    // pagehide 発火
    window.dispatchEvent(new Event("pagehide"));
    const result = await promise;
    expect(result).toBe(false);
    expect(document.querySelector(".ys-confirm-overlay")).toBeNull();
  });
});
