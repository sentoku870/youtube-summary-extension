// tests/event-bus.test.js — event-busの単体テスト
// P0-P1: EVENTS シムを削除し、DOM_EVENTS / INTERNAL_EVENTS の責務分離を
// コード上で明確化。
const { on, off, emit, clearAll, DOM_EVENTS, INTERNAL_EVENTS } = require("../src/shared/event-bus");

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

  test("DOM_EVENTS は生の DOM イベントのみを含む", () => {
    expect(DOM_EVENTS).toEqual({ YT_NAVIGATE_FINISH: "yt-navigate-finish" });
  });

  test("INTERNAL_EVENTS は内部イベントのみを含む", () => {
    expect(INTERNAL_EVENTS.NAV_FINISH).toBe("nav:finish");
    expect(INTERNAL_EVENTS.TRANSCRIPT_READY).toBe("transcript-ready");
    expect(INTERNAL_EVENTS.TRANSCRIPT_FAILED).toBe("transcript-failed");
    expect(INTERNAL_EVENTS.TRANSCRIPT_RETRY).toBe("transcript-retry");
    expect(INTERNAL_EVENTS.SUMMARY_RETRY_CLICKED).toBe("summary:retry-clicked");
    // DOM_EVENTS 専用のキーは含まれない
    expect(INTERNAL_EVENTS.YT_NAVIGATE_FINISH).toBeUndefined();
  });

  test("DOM_EVENTS と INTERNAL_EVENTS のキーは重複しない", () => {
    const domKeys = Object.keys(DOM_EVENTS);
    const internalKeys = Object.keys(INTERNAL_EVENTS);
    const overlap = domKeys.filter(function (k) {
      return internalKeys.indexOf(k) !== -1;
    });
    expect(overlap).toEqual([]);
  });

  test("clearAll で全リスナーがクリアされる", () => {
    const cb = jest.fn();
    on("test", cb);
    clearAll();
    emit("test");
    expect(cb).not.toHaveBeenCalled();
  });
});
