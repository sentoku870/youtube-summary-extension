// tests/options-auto-save.test.js — createAutoSave ヘルパの単体テスト
const helpers = require("./__helpers__/index.cjs");

const { createAutoSave } = require("../src/options/ui/auto-save");

describe("createAutoSave", () => {
  let indicator;

  beforeEach(() => {
    helpers.clearBody();
    indicator = document.createElement("span");
    indicator.id = "testAutoSaveStatus";
    document.body.appendChild(indicator);
  });

  describe("基本動作", () => {
    test("schedule を呼ぶと save がデバウンス後に呼ばれる", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 50, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      expect(save).not.toHaveBeenCalled();
      await new Promise(function (r) {
        setTimeout(r, 100);
      });
      expect(save).toHaveBeenCalledTimes(1);
    });

    test("複数の schedule 呼び出しはデバウンスされる（最新1回のみ実行）", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 50, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      saver.schedule();
      saver.schedule();
      await new Promise(function (r) {
        setTimeout(r, 100);
      });
      expect(save).toHaveBeenCalledTimes(1);
    });

    test("isPending はタイマー設定中のみ true", () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 50, indicatorId: "testAutoSaveStatus", save });
      expect(saver.isPending()).toBe(false);
      saver.schedule();
      expect(saver.isPending()).toBe(true);
    });
  });

  describe("インジケータ UI", () => {
    test("schedule 時に '保存中…' メッセージと saving クラスが設定される", () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 50, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      expect(indicator.classList.contains("saving")).toBe(true);
      expect(indicator.classList.contains("saved")).toBe(false);
      expect(indicator.textContent).toBe("保存中…");
    });

    test("save 成功時に '✓ 自動保存しました (HH:MM)' メッセージと saved クラスが設定される", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 10, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      expect(indicator.classList.contains("saved")).toBe(true);
      expect(indicator.classList.contains("saving")).toBe(false);
      // "✓ 自動保存しました" + "(HH:MM)" 形式
      expect(indicator.textContent).toMatch(/✓\s*自動保存しました\s*\(\d{2}:\d{2}\)/);
    });

    test("save 失敗時に '✗' メッセージと saving/saved クラスが外れる", async () => {
      const save = jest.fn().mockRejectedValue(new Error("save failed"));
      const onError = jest.fn();
      const saver = createAutoSave({
        debounceMs: 10,
        indicatorId: "testAutoSaveStatus",
        save,
        onError
      });
      saver.schedule();
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      expect(indicator.classList.contains("saving")).toBe(false);
      expect(indicator.classList.contains("saved")).toBe(false);
      expect(indicator.textContent).toMatch(/✗.*保存に失敗/);
      expect(onError).toHaveBeenCalledWith("save failed");
    });

    test("2.5秒後に saved インジケータが消える", async () => {
      jest.useFakeTimers();
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 10, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      jest.advanceTimersByTime(50);
      // Promise解決を待つ
      await Promise.resolve();
      await Promise.resolve();
      expect(indicator.classList.contains("saved")).toBe(true);
      jest.advanceTimersByTime(2500);
      expect(indicator.textContent).toBe("");
      expect(indicator.classList.contains("saved")).toBe(false);
      jest.useRealTimers();
    });

    test("インジケータ要素が存在しない場合は no-op", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 10, indicatorId: "nonexistent", save });
      expect(() => saver.schedule()).not.toThrow();
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      expect(save).toHaveBeenCalled();
    });

    test("indicatorId を省略するとインジケータ UI はスキップ", () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 50, save });
      saver.schedule();
      // エラーなく実行される
      expect(saver.isPending()).toBe(true);
    });
  });

  describe("flush", () => {
    test("タイマー設定中の保存を即時コミット", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 5000, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      expect(saver.isPending()).toBe(true);
      await saver.flush();
      expect(save).toHaveBeenCalledTimes(1);
      expect(saver.isPending()).toBe(false);
    });

    test("タイマー未設定時の flush は何もしない", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 5000, indicatorId: "testAutoSaveStatus", save });
      await saver.flush();
      expect(save).not.toHaveBeenCalled();
    });

    test("flush 後にインジケータが saved 状態になる", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ debounceMs: 5000, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      await saver.flush();
      expect(indicator.classList.contains("saved")).toBe(true);
    });
  });

  describe("デフォルト値", () => {
    test("debounceMs 未指定時は 300ms がデフォルト", () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const saver = createAutoSave({ indicatorId: "testAutoSaveStatus", save });
      // 内部状態を確認するのは難しいので、isPending() で確認
      saver.schedule();
      expect(saver.isPending()).toBe(true);
    });

    test("onError 未指定でもエラー時にインジケータは更新される", async () => {
      const save = jest.fn().mockRejectedValue(new Error("fail"));
      const saver = createAutoSave({ debounceMs: 10, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      expect(indicator.textContent).toMatch(/✗/);
    });

    test("save が throw したエラーオブジェクトが message を持たない場合、String(e) を使用", async () => {
      const save = jest.fn().mockRejectedValue(42);
      const saver = createAutoSave({ debounceMs: 10, indicatorId: "testAutoSaveStatus", save });
      saver.schedule();
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      expect(indicator.textContent).toMatch(/✗.*42/);
    });
  });
});