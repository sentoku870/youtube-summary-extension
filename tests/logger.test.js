// tests/logger.test.js — createLogger の単体テスト
const { createLogger, redactSecrets } = require("../src/shared/logger");

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

describe("redactSecrets", () => {
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
  test("オブジェクト内の apiKey を [REDACTED] に置換", () => {
    expect(redactSecrets({ apiKey: "sk-12345678abcdef" })).toEqual({ apiKey: "[REDACTED]" });
  });

  test("スネークケース api_key / 大文字小文字混在 APIKey も対象", () => {
    expect(redactSecrets({ api_key: "sk-12345678xx", APIKey: "sk-abcdefghi" })).toEqual({
      api_key: "[REDACTED]",
      APIKey: "[REDACTED]"
    });
  });

  test("authorization ヘッダの値を [REDACTED] に", () => {
    expect(redactSecrets({ authorization: "Bearer abcdefgh1234" })).toEqual({
      authorization: "[REDACTED]"
    });
  });

  test("文字列中の sk- パターンをマスク", () => {
    expect(redactSecrets("error: sk-12345678abcdefgh token invalid")).toBe(
      "error: [REDACTED] token invalid"
    );
  });

  test("Bearer xxx 文字列をマスク", () => {
    expect(redactSecrets("Authorization: Bearer abcdefgh1234xxxxx")).toBe(
      "Authorization: Bearer [REDACTED]"
    );
  });

  test("無関係なキーはそのまま", () => {
    expect(redactSecrets({ model: "gpt-4", url: "https://api.example.com" })).toEqual({
      model: "gpt-4",
      url: "https://api.example.com"
    });
  });

  test("循環参照でもクラッシュしない", () => {
    const obj = { a: 1 };
    obj.self = obj;
    expect(() => redactSecrets(obj)).not.toThrow();
    expect(redactSecrets(obj).self).toBe("[Circular]");
  });

  test("入れ子のオブジェクトも再帰 redaction", () => {
    expect(redactSecrets({ outer: { inner: { apiKey: "sk-12345678abcdef" } } })).toEqual({
      outer: { inner: { apiKey: "[REDACTED]" } }
    });
  });

  test("logger.log 経由で API キーがマスクされる", () => {
    const log = createLogger("secrets");
    log.log({ apiKey: "sk-12345678abcdef", model: "gpt-4" });
    expect(logSpy).toHaveBeenCalledWith("[YouTube 要約][secrets]", {
      apiKey: "[REDACTED]",
      model: "gpt-4"
    });
  });

  test("Groq (gsk_) キーをマスク", () => {
    expect(redactSecrets("token: gsk_abcdefgh12345678")).toBe("token: [REDACTED]");
  });

  test("Google API キー (AIzaSy...) をマスク", () => {
    expect(redactSecrets("AIzaSyAbcdefghijk1234567")).toBe("[REDACTED]");
  });

  test("OAuth access_token キーをオブジェクト内でマスク", () => {
    expect(redactSecrets({ access_token: "ya29.abcdefghijk" })).toEqual({
      access_token: "[REDACTED]"
    });
  });

  test("password / cookie / token キーをマスク", () => {
    expect(redactSecrets({ password: "p", cookie: "c=1", token: "t", note: "ok" })).toEqual({
      password: "[REDACTED]",
      cookie: "[REDACTED]",
      token: "[REDACTED]",
      note: "ok"
    });
  });

  test("bearer (小文字) 文字列もマスク", () => {
    expect(redactSecrets("Authorization: bearer abcdefgh1234567890")).toBe(
      "Authorization: Bearer [REDACTED]"
    );
  });

  test("Authorization ヘッダキーはセンシティブキーマッチで完全マスク", () => {
    expect(redactSecrets({ Authorization: "Bearer abcdefgh1234567890" })).toEqual({
      Authorization: "[REDACTED]"
    });
  });
});
