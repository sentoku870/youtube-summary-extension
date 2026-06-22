// tests/errors.test.js — カスタムエラークラスの単体テスト
const { YsAbortError, YsTimeoutError, YsAPIError } = require("../src/infrastructure/errors");

describe("YsAbortError", () => {
  test("デフォルトメッセージが設定される", () => {
    const err = new YsAbortError();
    expect(err.message).toBe("API呼び出しが中断されました。");
    expect(err.name).toBe("YsAbortError");
    expect(err instanceof Error).toBe(true);
  });

  test("カスタムメッセージを設定できる", () => {
    const err = new YsAbortError("カスタムメッセージ");
    expect(err.message).toBe("カスタムメッセージ");
    expect(err.name).toBe("YsAbortError");
  });
});

describe("YsTimeoutError", () => {
  test("デフォルトメッセージが設定される", () => {
    const err = new YsTimeoutError();
    expect(err.message).toBe("API応答がタイムアウトしました。");
    expect(err.name).toBe("YsTimeoutError");
    expect(err instanceof Error).toBe(true);
  });

  test("カスタムメッセージを設定できる", () => {
    const err = new YsTimeoutError("タイムアウト");
    expect(err.message).toBe("タイムアウト");
  });
});

describe("YsAPIError", () => {
  test("ステータスコードとステータステキストを保持する", () => {
    const err = new YsAPIError("エラーです", 429, "Too Many Requests");
    expect(err.message).toBe("エラーです");
    expect(err.name).toBe("YsAPIError");
    expect(err.status).toBe(429);
    expect(err.statusText).toBe("Too Many Requests");
    expect(err instanceof Error).toBe(true);
  });

  test("デフォルトメッセージが設定される", () => {
    const err = new YsAPIError("APIエラー", 500, "Internal Server Error");
    expect(err.message).toBe("APIエラー");
    expect(err.status).toBe(500);
    expect(err.statusText).toBe("Internal Server Error");
  });
});