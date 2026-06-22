// tests/event-bus.test.js — event-busの単体テスト
const { on, off, emit, clearAll, EVENTS } = require("../src/shared/event-bus");

beforeEach(() => {
  clearAll();
});

describe("event-bus", () => {
  test("on/emit でリスナーが呼ばれる", () => {
    const cb = jest.fn();
    on("test", cb);
    emit("test", { value: 1 });
    expect(cb).toHaveBeenCalledWith({ value: 1 });
  });

  test("複数リスナーが全て呼ばれる", () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    on("test", cb1);
    on("test", cb2);
    emit("test");
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  test("off でリスナーが解除される", () => {
    const cb = jest.fn();
    on("test", cb);
    off("test", cb);
    emit("test");
    expect(cb).not.toHaveBeenCalled();
  });

  test("on の戻り値（unsubscribe関数）で解除できる", () => {
    const cb = jest.fn();
    const unsubscribe = on("test", cb);
    unsubscribe();
    emit("test");
    expect(cb).not.toHaveBeenCalled();
  });

  test("存在しないイベントの emit は何もしない", () => {
    expect(() => emit("nonexistent")).not.toThrow();
  });

  test("リスナー内で例外が投げられても他のリスナーは継続する", () => {
    const errorCb = jest.fn(() => {
      throw new Error("test error");
    });
    const normalCb = jest.fn();
    // console.error を抑制
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    on("test", errorCb);
    on("test", normalCb);
    emit("test");
    expect(errorCb).toHaveBeenCalled();
    expect(normalCb).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("emit 中に off されても安全（コピーしてイテレート）", () => {
    const cb1 = jest.fn(() => {
      off("test", cb2);
    });
    const cb2 = jest.fn();
    on("test", cb1);
    on("test", cb2);
    emit("test");
    // cb1 は実行され、cb2 もこの emit サイクルでは実行される
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  test("EVENTS 定数が期待される値を持つ", () => {
    expect(EVENTS.YT_NAVIGATE_FINISH).toBe("yt-navigate-finish");
    expect(EVENTS.TRANSCRIPT_READY).toBe("transcript-ready");
    expect(EVENTS.SUMMARY_UPDATED).toBe("summary-updated");
    expect(EVENTS.TAB_CHANGED).toBe("tab-changed");
    expect(EVENTS.STATE_RESET).toBe("state-reset");
  });

  test("clearAll で全リスナーがクリアされる", () => {
    const cb = jest.fn();
    on("test", cb);
    clearAll();
    emit("test");
    expect(cb).not.toHaveBeenCalled();
  });
});