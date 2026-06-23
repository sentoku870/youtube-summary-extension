// tests/abort-chain.test.js — abort signal チェイニングの単体テスト
const { linkAbortSignal } = require("../src/shared/abort-chain");

describe("linkAbortSignal", () => {
  test("親が abort されたら子も abort される", function() {
    const parent = new AbortController();
    const { controller: child } = linkAbortSignal(parent.signal);
    expect(child.signal.aborted).toBe(false);

    parent.abort();
    expect(child.signal.aborted).toBe(true);
  });

  test("子 controller.abort() は親に伝播しない（単方向）", function() {
    const parent = new AbortController();
    const { controller: child } = linkAbortSignal(parent.signal);

    child.abort();
    expect(parent.signal.aborted).toBe(false);
  });

  test("disconnect() 後は親 abort で子が abort されない", function() {
    const parent = new AbortController();
    const { controller: child, disconnect } = linkAbortSignal(parent.signal);

    disconnect();
    parent.abort();
    expect(child.signal.aborted).toBe(false);
  });

  test("親が既に abort 済みの場合は子も即座に abort", function() {
    const parent = new AbortController();
    parent.abort();
    const { controller: child } = linkAbortSignal(parent.signal);
    expect(child.signal.aborted).toBe(true);
  });

  test("parentSignal が null の場合は連動なしで controller を返す", function() {
    const { controller: child, disconnect } = linkAbortSignal(null);
    expect(child.signal.aborted).toBe(false);
    expect(typeof disconnect).toBe("function");
    // disconnect を呼んでも例外なし
    expect(() => disconnect()).not.toThrow();
  });
});
