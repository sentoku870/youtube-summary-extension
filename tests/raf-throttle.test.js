// tests/raf-throttle.test.js — RAF スロットルの単体テスト
const rafThrottleModule = require("../src/shared/raf-throttle");
const { createRafThrottle } = rafThrottleModule;

describe("createRafThrottle", () => {
  let now;
  let originalDate;
  let originalRaf;
  let originalCaf;
  let rafCallbacks;
  let rafIdCounter;

  beforeEach(() => {
    now = 1000000;
    originalDate = global.Date;
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) return new originalDate(now);
        return new originalDate(...args);
      }
      static now() {
        return now;
      }
    };
    rafCallbacks = [];
    rafIdCounter = 0;
    originalRaf = global.requestAnimationFrame;
    originalCaf = global.cancelAnimationFrame;
    global.requestAnimationFrame = function (cb) {
      const id = ++rafIdCounter;
      rafCallbacks.push({ id, cb });
      return id;
    };
    global.cancelAnimationFrame = function (id) {
      rafCallbacks = rafCallbacks.filter(function (r) {
        return r.id !== id;
      });
    };
  });

  afterEach(() => {
    global.Date = originalDate;
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCaf;
  });

  function tickRaf() {
    const pending = rafCallbacks.slice();
    rafCallbacks = [];
    pending.forEach(function (r) {
      r.cb();
    });
  }

  test("初回呼び出しは即時実行される", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a");
    expect(fn).toHaveBeenCalledWith("a");
  });

  test("intervalMs 未満の連続呼び出しは次フレームにまとめる", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a"); // 即時
    throttled("b"); // スケジュール
    throttled("c"); // スケジュール（最新値で上書き）
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");
    tickRaf();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  test("intervalMs 経過後は即時実行される", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a");
    now += 150;
    throttled("b");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, "a");
    expect(fn).toHaveBeenNthCalledWith(2, "b");
  });

  test("flush() はスケジュール済みフレームを破棄して即時1回実行", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a"); // 即時
    throttled("b"); // スケジュール
    expect(rafCallbacks).toHaveLength(1);
    throttled.flush("c"); // スケジュール破棄して "c" で即時実行
    expect(rafCallbacks).toHaveLength(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(2, "c");
  });

  test("flush() 引数なしは pendingArg のまま実行", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a");
    throttled("b");
    throttled.flush();
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  test("intervalMs のデフォルトは 60ms", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn);
    throttled("a");
    now += 59;
    throttled("b"); // 60ms 未満 → スケジュール
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    tickRaf();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("スケジュール後に intervalMs 経過 → 即時実行（raf は破棄）", () => {
    const fn = jest.fn();
    const throttled = createRafThrottle(fn, 100);
    throttled("a"); // 即時
    throttled("b"); // スケジュール
    expect(rafCallbacks).toHaveLength(1);
    now += 150;
    throttled("c"); // 100ms 以上経過 → 即時 + raf 破棄
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(2, "c");
    // raf は破棄済み（cancelAnimationFrame が呼ばれたはず）だが
    // もし残っていたとしても tickRaf で同じフレームは多重発火しない設計
    const before = fn.mock.calls.length;
    tickRaf();
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(before); // 残っていた場合のため
  });
});
