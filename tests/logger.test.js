// tests/logger.test.js — createLogger の単体テスト
const { createLogger } = require("../src/shared/logger");

describe("createLogger", () => {
  let logSpy;
  let warnSpy;
  let errSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  test("log / warn / error の3メソッドを持つ", () => {
    const log = createLogger("test");
    expect(typeof log.log).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  test("log.log は [YouTube 要約][category] プレフィックス付きで console.log を呼ぶ", () => {
    const log = createLogger("mycat");
    log.log("hello", 123);
    expect(logSpy).toHaveBeenCalledWith("[YouTube 要約][mycat]", "hello", 123);
  });

  test("log.warn は [YouTube 要約][category] プレフィックス付きで console.warn を呼ぶ", () => {
    const log = createLogger("warn-cat");
    log.warn("warning message", { code: 42 });
    expect(warnSpy).toHaveBeenCalledWith("[YouTube 要約][warn-cat]", "warning message", {
      code: 42
    });
  });

  test("log.error は [YouTube 要約][category] プレフィックス付きで console.error を呼ぶ", () => {
    const log = createLogger("err-cat");
    const err = new Error("oops");
    log.error("failed:", err);
    expect(errSpy).toHaveBeenCalledWith("[YouTube 要約][err-cat]", "failed:", err);
  });

  test("複数の引数を渡せる", () => {
    const log = createLogger("multi");
    log.log("a", "b", "c", 1, 2, 3);
    expect(logSpy).toHaveBeenCalledWith("[YouTube 要約][multi]", "a", "b", "c", 1, 2, 3);
  });

  test("isDev = false (production) の場合 log() は console.log を呼ばない", () => {
    // production モードをシミュレート
    const originalLogLevel = globalThis.__LOG_LEVEL__;
    globalThis.__LOG_LEVEL__ = "production";
    // モジュール再評価が必要（isDev は起動時に評価される）
    jest.resetModules();
    const { createLogger: createLoggerProd } = require("../src/shared/logger");
    const log = createLoggerProd("prod");
    log.log("production message");
    expect(logSpy).not.toHaveBeenCalled();
    // warn / error は product でも呼ばれる
    log.warn("warn in prod");
    log.error("err in prod");
    expect(warnSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    // 元に戻す
    globalThis.__LOG_LEVEL__ = originalLogLevel;
    jest.resetModules();
  });
});
