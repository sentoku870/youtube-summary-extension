// tests/transcript.test.js — 字幕取得ロジックの単体テスト
// transcript.js の fetchTranscript / preloadTranscript / retryTranscript を検証

// ----- モック準備 -----
// state.js のモック（sessionState オブジェクトを共有）
// ※ jest.mock 内で参照する変数は "mock" プレフィックス必須
const mockSessionState = {
  preloadedTranscript: null,
  transcriptReady: false,
  _transcriptPromise: null,
  _transcriptGen: 0,
  pendingRetry: false
};
jest.mock("../src/shared/state.js", function () {
  return { sessionState: mockSessionState };
});

// loadSubtitleLang のモック
const mockLoadSubtitleLang = jest.fn();
jest.mock("../src/infrastructure/storage.js", function () {
  return { loadSubtitleLang: mockLoadSubtitleLang };
});

// event-bus のモック（emit をスパイ）
const mockEmit = jest.fn();
const mockOn = jest.fn();
jest.mock("../src/shared/event-bus.js", function () {
  return {
    emit: mockEmit,
    on: mockOn,
    EVENTS: {
      TRANSCRIPT_READY: "TRANSCRIPT_READY",
      TRANSCRIPT_FAILED: "TRANSCRIPT_FAILED",
      TRANSCRIPT_RETRY: "TRANSCRIPT_RETRY"
    }
  };
});

// fetchYtTranscript のモック
const mockFetchYtTranscript = jest.fn();
jest.mock("../src/domain/transcript-fetcher.js", function () {
  return { fetchYtTranscript: mockFetchYtTranscript };
});

// ----- テスト対象（モック適用後に require） -----
const { fetchTranscript, preloadTranscript, retryTranscript } = require("../src/domain/transcript");

// 各テスト前にモック・stateをリセット
beforeEach(function () {
  mockSessionState.preloadedTranscript = null;
  mockSessionState.transcriptReady = false;
  mockSessionState._transcriptPromise = null;
  mockSessionState._transcriptGen = 0;
  mockSessionState.pendingRetry = false;
  mockLoadSubtitleLang.mockReset();
  mockEmit.mockReset();
  mockFetchYtTranscript.mockReset();
});

// ===== fetchTranscript =====
describe("fetchTranscript", function () {
  test("preloadedTranscript があればそれを返す", async function () {
    mockSessionState.preloadedTranscript = { all: ["cached"] };
    const r = await fetchTranscript();
    expect(r).toEqual({ all: ["cached"] });
    expect(mockFetchYtTranscript).not.toHaveBeenCalled();
  });

  test("lang=auto の場合は config undefined で fetchYtTranscript を呼ぶ", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["a"] });
    const r = await fetchTranscript();
    expect(mockFetchYtTranscript).toHaveBeenCalledWith(undefined);
    expect(r).toEqual({ all: ["a"] });
  });

  test("lang が指定されていれば { lang } を渡す", async function () {
    mockLoadSubtitleLang.mockResolvedValue("en");
    mockFetchYtTranscript.mockResolvedValue({ all: ["en1"] });
    const r = await fetchTranscript();
    expect(mockFetchYtTranscript).toHaveBeenCalledWith({ lang: "en" });
    expect(r).toEqual({ all: ["en1"] });
  });

  test("ロード中のPromiseがあればそれに乗る（競合防止）", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["shared"] });
    // 1回目を await せずに2つ同時に呼ぶ
    const p1 = fetchTranscript();
    const p2 = fetchTranscript();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ all: ["shared"] });
    expect(r2).toEqual({ all: ["shared"] });
    // fetchYtTranscript は1回しか呼ばれない
    expect(mockFetchYtTranscript).toHaveBeenCalledTimes(1);
  });

  test("取得失敗時はエラーを再送し _transcriptPromise をクリア", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockRejectedValue(new Error("network"));
    await expect(fetchTranscript()).rejects.toThrow("network");
    expect(mockSessionState._transcriptPromise).toBeNull();
  });
});

// ===== preloadTranscript =====
describe("preloadTranscript", function () {
  test("成功時は preloadedTranscript を設定し TRANSCRIPT_READY を emit", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["ok1", "ok2"] });

    await preloadTranscript();

    expect(mockSessionState.transcriptReady).toBe(true);
    expect(mockSessionState.preloadedTranscript).toEqual({ all: ["ok1", "ok2"] });
    expect(mockEmit).toHaveBeenCalledWith("TRANSCRIPT_READY", {
      transcript: { all: ["ok1", "ok2"] }
    });
  });

  test("transcriptReady=true なら何もしない", async function () {
    mockSessionState.transcriptReady = true;
    await preloadTranscript();
    expect(mockFetchYtTranscript).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  test("字幕が空配列の場合はリトライして最終的に TRANSCRIPT_FAILED を emit", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: [] });
    // setTimeout を即時解決するようモック
    jest.useFakeTimers();
    const p = preloadTranscript();
    // リトライ待ちをすべて進める
    await jest.runAllTimersAsync();
    await p;
    jest.useRealTimers();

    expect(mockSessionState.transcriptReady).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith("TRANSCRIPT_FAILED", { reason: "all-retries-exhausted" });
  });

  test("例外時もリトライし、全失敗で TRANSCRIPT_FAILED を emit", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockRejectedValue(new Error("fail"));
    jest.useFakeTimers();
    const p = preloadTranscript();
    await jest.runAllTimersAsync();
    await p;
    jest.useRealTimers();

    expect(mockSessionState.transcriptReady).toBe(false);
    expect(mockEmit).toHaveBeenCalledWith("TRANSCRIPT_FAILED", { reason: "all-retries-exhausted" });
    // 3回リトライした
    expect(mockFetchYtTranscript).toHaveBeenCalledTimes(3);
  });
});

// ===== retryTranscript =====
describe("retryTranscript", function () {
  test("pendingRetry=true の場合は何もしない", async function () {
    mockSessionState.pendingRetry = true;
    await retryTranscript();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockFetchYtTranscript).not.toHaveBeenCalled();
  });

  test("TRANSCRIPT_RETRY を emit して preloadTranscript を実行", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["retry-ok"] });

    await retryTranscript();

    // TRANSCRIPT_RETRY が emit される
    expect(mockEmit).toHaveBeenCalledWith("TRANSCRIPT_RETRY", {});
    // 成功時は TRANSCRIPT_READY も emit される
    expect(mockEmit).toHaveBeenCalledWith("TRANSCRIPT_READY", {
      transcript: { all: ["retry-ok"] }
    });
    expect(mockSessionState.pendingRetry).toBe(false);
    expect(mockSessionState.transcriptReady).toBe(true);
  });

  test("実行前にキャッシュをクリアする", async function () {
    mockSessionState.preloadedTranscript = { all: ["old"] };
    mockSessionState.transcriptReady = true;
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["new"] });

    await retryTranscript();

    expect(mockSessionState.preloadedTranscript).toEqual({ all: ["new"] });
  });
});

// ===== T2-E9: 世代カウンタによる race prevention =====
describe("世代カウンタによる古い結果の破棄", function () {
  test("preload 開始後に _transcriptGen を進めると古い結果を破棄", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    // 取得が遅れて完了する transcript
    let resolveFetch;
    mockFetchYtTranscript.mockImplementation(function () {
      return new Promise(function (r) {
        resolveFetch = r;
      });
    });

    const p = preloadTranscript();
    // loadSubtitleLang 解決と fetchYtTranscript 呼び出しを待つ
    await new Promise(function (r) {
      setTimeout(r, 0);
    });
    expect(resolveFetch).toBeDefined();
    // 動画切り替えをシミュレート: 世代を進める
    mockSessionState._transcriptGen = 1;
    // 古い transcript を返す
    resolveFetch({ all: ["stale"] });
    await p;

    // 古い結果は破棄され、transcriptReady は false のまま
    expect(mockSessionState.transcriptReady).toBe(false);
    expect(mockSessionState.preloadedTranscript).toBeNull();
    // TRANSCRIPT_READY は emit されない
    expect(mockEmit).not.toHaveBeenCalledWith("TRANSCRIPT_READY", expect.anything());
  });

  test("世代が一致していれば結果を反映", async function () {
    mockLoadSubtitleLang.mockResolvedValue("auto");
    mockFetchYtTranscript.mockResolvedValue({ all: ["fresh"] });

    await preloadTranscript();

    expect(mockSessionState.transcriptReady).toBe(true);
    expect(mockSessionState.preloadedTranscript).toEqual({ all: ["fresh"] });
  });
});
