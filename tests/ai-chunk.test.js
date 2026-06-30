// tests/ai-chunk.test.js — 単一チャンク処理（リトライ対応）の単体テスト

// chrome.storage モック（依存解決前に設定）
global.chrome = {
  runtime: { id: "test-extension-id" },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() }
  }
};

jest.mock("../src/domain/api.js", () => ({
  callChatAPINonStream: jest.fn()
}));

const mockUi = {
  showProgress: jest.fn(),
  showError: jest.fn()
};

jest.mock("../src/domain/ports.js", () => ({
  getUiAdapter: jest.fn(() => mockUi)
}));

const { callChatAPINonStream } = require("../src/domain/api.js");
const { processSingleChunk } = require("../src/domain/ai-chunk.js");

describe("ai-chunk / processSingleChunk", () => {
  const config = { apiKey: "k", apiUrl: "https://api.example.com", apiModel: "m" };
  const chunkMessages = [{ role: "user", content: "要約して" }];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1回目で成功 → success: true, result に文字列", async () => {
    callChatAPINonStream.mockResolvedValueOnce("要約結果");
    const r = await processSingleChunk(chunkMessages, config, undefined, 0, 3, 3);
    expect(r).toEqual({ success: true, result: "要約結果" });
    expect(callChatAPINonStream).toHaveBeenCalledTimes(1);
  });

  test("1回失敗→2回成功 → success: true（リトライでリカバリ）", async () => {
    callChatAPINonStream.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce("ok");
    const r = await processSingleChunk(chunkMessages, config, undefined, 1, 3, 3);
    expect(r).toEqual({ success: true, result: "ok" });
    expect(callChatAPINonStream).toHaveBeenCalledTimes(2);
  });

  test("maxAttempts 回すべて失敗 → success: false, result: null", async () => {
    callChatAPINonStream.mockRejectedValue(new Error("always fail"));
    const r = await processSingleChunk(chunkMessages, config, undefined, 2, 3, 3);
    expect(r).toEqual({ success: false, result: null });
    expect(callChatAPINonStream).toHaveBeenCalledTimes(3);
  });

  test("AbortError は即座に上位に throw（リトライしない）", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    callChatAPINonStream.mockRejectedValue(abortErr);
    await expect(processSingleChunk(chunkMessages, config, undefined, 0, 3, 3)).rejects.toBe(
      abortErr
    );
    expect(callChatAPINonStream).toHaveBeenCalledTimes(1);
  });

  test("showProgress がチャンク idx/total 表示で呼ばれる", async () => {
    callChatAPINonStream.mockResolvedValueOnce("done");
    await processSingleChunk(chunkMessages, config, undefined, 2, 5, 3);
    expect(mockUi.showProgress).toHaveBeenCalledWith("📄 チャンク 3/5 を要約中...");
    expect(mockUi.showProgress).toHaveBeenCalledWith("📄 完了");
  });

  test("リトライ時に 'リトライ中' メッセージが showProgress で表示される", async () => {
    callChatAPINonStream.mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce("ok");
    await processNonStreamWithFakeTimers();
    expect(mockUi.showProgress).toHaveBeenCalledWith("⚠️ チャンク 1 リトライ中");
  });

  // ヘルパ: setTimeout を fake timers で進める
  async function processNonStreamWithFakeTimers() {
    jest.useFakeTimers();
    const p = processSingleChunk(chunkMessages, config, undefined, 0, 3, 3);
    // 内部リトライ待機 (500ms) を進める
    await jest.advanceTimersByTimeAsync(600);
    const r = await p;
    jest.useRealTimers();
    return r;
  }
});
