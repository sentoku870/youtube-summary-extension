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
});
