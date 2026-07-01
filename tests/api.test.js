// tests/api.test.js — API層の単体テスト
const { callChatAPIStream, callChatAPINonStream } = require("../src/domain/api");
const { fetchWithRetry, handleErrorResponse } = require("../src/domain/api-retry");
const { readStream } = require("../src/domain/api-stream");
const { buildAuthHeaders, isOpenRouterUrl } = require("../src/domain/api-auth");
const { buildRequestConfig } = require("../src/domain/api-internals");

// YsAPIError の参照（ステータス情報の検証用）
const { YsAPIError, YsAbortError, YsTimeoutError } = require("../src/infrastructure/errors");

// TextEncoder/TextDecoder のポリフィル（jsdom環境では未定義のため）
const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require("util");
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = NodeTextDecoder;
}
if (typeof TextEncoder === "undefined") {
  global.TextEncoder = NodeTextEncoder;
}

// fetch のモック
global.fetch = jest.fn();

// ReadableStream のモック
function createMockStream(chunks) {
  let index = 0;
  return {
    getReader() {
      return {
        read() {
          if (index < chunks.length) {
            const encoder = new TextEncoder();
            return Promise.resolve({
              done: false,
              value: encoder.encode(chunks[index++])
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
        cancel() {}
      };
    }
  };
}

// ReadableStream が存在しない場合のフォールバック
if (typeof ReadableStream === "undefined") {
  global.ReadableStream = function () {};
}

// ===== buildRequestConfig のテスト =====
describe("buildRequestConfig", () => {
  test("基本的な設定を正しく構築する", () => {
    const config = {
      apiKey: "test-key",
      apiUrl: "https://api.test.com",
      apiModel: "gpt-4o",
      maxTokens: "4096",
      temperature: "0.3"
    };
    const messages = [{ role: "user", content: "hello" }];
    const result = buildRequestConfig(config, messages, false);

    const body = JSON.parse(result.body);
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual(messages);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.3);
    expect(result.headers["Authorization"]).toBe("Bearer test-key");
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  test("OpenRouter用のヘッダーを追加する", () => {
    const config = {
      apiKey: "test-key",
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiModel: "gpt-4o",
      maxTokens: "4096",
      temperature: "0.3"
    };
    const result = buildRequestConfig(config, [{ role: "user", content: "hi" }], true);
    expect(result.headers["HTTP-Referer"]).toBe("https://chrome.google.com/webstore");
    expect(result.headers["X-Title"]).toBe("YouTube Summary Extension");
  });

  test("extraParamsをbodyにマージする", () => {
    const config = {
      apiKey: "test-key",
      apiUrl: "https://api.test.com",
      apiModel: "gpt-4o",
      maxTokens: "4096",
      temperature: "0.3",
      extraParams: '{"top_p": 0.9, "frequency_penalty": 0.5}'
    };
    const result = buildRequestConfig(config, [{ role: "user", content: "hi" }], true);
    const body = JSON.parse(result.body);
    expect(body.top_p).toBe(0.9);
    expect(body.frequency_penalty).toBe(0.5);
    expect(body.model).toBe("gpt-4o"); // 既存のプロパティは上書きされない
  });

  test("stream引数が正しく反映される", () => {
    const config = {
      apiKey: "key",
      apiUrl: "https://api.test.com",
      apiModel: "gpt-4o"
    };
    const streamTrue = buildRequestConfig(config, [], true);
    expect(JSON.parse(streamTrue.body).stream).toBe(true);

    const streamFalse = buildRequestConfig(config, [], false);
    expect(JSON.parse(streamFalse.body).stream).toBe(false);
  });
});

// ===== readStream のテスト =====
describe("readStream", () => {
  test("SSEデータを正しくパースする", async () => {
    const sseData =
      "data: " +
      JSON.stringify({
        choices: [{ delta: { content: "Hello" } }]
      }) +
      "\n\ndata: " +
      JSON.stringify({
        choices: [{ delta: { content: " World" } }]
      }) +
      "\n\ndata: [DONE]\n\n";

    const reader = createMockStream([sseData]).getReader();
    const onChunk = jest.fn();
    const onDone = jest.fn();

    await readStream(reader, onChunk, onDone);

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls[0][0]).toBe("Hello");
    expect(onChunk.mock.calls[1][0]).toBe("Hello World");
    expect(onDone).toHaveBeenCalledWith("Hello World");
  });

  test("不正なJSON行をスキップする", async () => {
    const sseData = "data: invalid json\n\ndata: [DONE]\n\n";
    const reader = createMockStream([sseData]).getReader();
    const onChunk = jest.fn();
    const onDone = jest.fn();

    await readStream(reader, onChunk, onDone);

    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith("");
  });
});

describe("callChatAPIStream", () => {
  beforeEach(() => {
    global.fetch.mockReset();
  });

  test("ストリーミング応答を処理する", async () => {
    const sseData =
      "data: " +
      JSON.stringify({
        choices: [{ delta: { content: "Hello" } }]
      }) +
      "\n\ndata: " +
      JSON.stringify({
        choices: [{ delta: { content: " World" } }]
      }) +
      "\n\ndata: [DONE]\n\n";

    global.fetch.mockResolvedValue({
      ok: true,
      body: createMockStream([sseData])
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await callChatAPIStream(
      [{ role: "user", content: "test" }],
      {
        apiKey: "test-key",
        apiUrl: "https://api.test.com",
        apiModel: "gpt-4o",
        maxTokens: "4096",
        temperature: "0.3"
      },
      onChunk,
      onDone
    );

    expect(onChunk).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    expect(onDone.mock.calls[0][0]).toBe("Hello World");
  });

  test("OpenRouterのヘッダーが正しく設定される", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      body: createMockStream(["data: [DONE]\n\n"])
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await callChatAPIStream(
      [{ role: "user", content: "test" }],
      {
        apiKey: "test-key",
        apiUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiModel: "gpt-4o",
        maxTokens: "4096",
        temperature: "0.3"
      },
      onChunk,
      onDone
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "HTTP-Referer": "https://chrome.google.com/webstore",
          "X-Title": "YouTube Summary Extension"
        })
      })
    );
  });

  test("APIエラー時に適切なエラーメッセージを投げる", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests")
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await expect(
      callChatAPIStream(
        [{ role: "user", content: "test" }],
        {
          apiKey: "test-key",
          apiUrl: "https://api.test.com",
          apiModel: "gpt-4o",
          maxTokens: "4096",
          temperature: "0.3"
        },
        onChunk,
        onDone
      )
    ).rejects.toThrow("APIの利用制限中です");
  });

  test("extraParamsがbodyにマージされる", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      body: createMockStream(["data: [DONE]\n\n"])
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await callChatAPIStream(
      [{ role: "user", content: "test" }],
      {
        apiKey: "test-key",
        apiUrl: "https://api.test.com",
        apiModel: "gpt-4o",
        maxTokens: "4096",
        temperature: "0.3",
        extraParams: '{"max_tokens": 8192, "top_p": 0.9}'
      },
      onChunk,
      onDone
    );

    const callArgs = global.fetch.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe("gpt-4o");
    expect(body.top_p).toBe(0.9);
  });

  test("ストリームパースエラーでも処理が継続する", async () => {
    const sseData = "data: invalid json\n\ndata: [DONE]\n\n";

    global.fetch.mockResolvedValue({
      ok: true,
      body: createMockStream([sseData])
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await callChatAPIStream(
      [{ role: "user", content: "test" }],
      {
        apiKey: "test-key",
        apiUrl: "https://api.test.com",
        apiModel: "gpt-4o",
        maxTokens: "4096",
        temperature: "0.3"
      },
      onChunk,
      onDone
    );

    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});

// ===== isOpenRouterUrl / buildAuthHeaders のテスト =====
describe("isOpenRouterUrl", () => {
  test("OpenRouter の URL を正しく判定する", () => {
    expect(isOpenRouterUrl("https://openrouter.ai/api/v1/chat/completions")).toBe(true);
    expect(isOpenRouterUrl("https://api.deepseek.com/v1/chat/completions")).toBe(false);
    expect(isOpenRouterUrl("")).toBe(false);
  });
});

describe("buildAuthHeaders", () => {
  test("通常のエンドポイントは Bearer 認証のみ", () => {
    const h = buildAuthHeaders("https://api.deepseek.com/v1/chat/completions", "key-123");
    expect(h["Authorization"]).toBe("Bearer key-123");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["HTTP-Referer"]).toBeUndefined();
    expect(h["X-Title"]).toBeUndefined();
  });

  test("OpenRouter には HTTP-Referer / X-Title を付与", () => {
    const h = buildAuthHeaders("https://openrouter.ai/api/v1/chat/completions", "or-key");
    expect(h["Authorization"]).toBe("Bearer or-key");
    expect(h["HTTP-Referer"]).toBe("https://chrome.google.com/webstore");
    expect(h["X-Title"]).toBe("YouTube Summary Extension");
  });
});

// ===== handleErrorResponse のテスト =====
describe("handleErrorResponse", () => {
  test("429エラー時にレート制限メッセージでYsAPIErrorを投げる", async () => {
    const response = {
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "rate limited"
    };
    await expect(handleErrorResponse(response)).rejects.toThrow("APIの利用制限中");
  });

  test("5xxエラー時にサーバーエラーメッセージでYsAPIErrorを投げる", async () => {
    const response = {
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "unavailable"
    };
    await expect(handleErrorResponse(response)).rejects.toThrow(
      "APIサーバーでエラーが発生しました"
    );
  });

  test("4xxエラー時に詳細を含むメッセージでYsAPIErrorを投げる", async () => {
    const response = {
      status: 400,
      statusText: "Bad Request",
      text: async () => "invalid request"
    };
    await expect(handleErrorResponse(response)).rejects.toThrow("APIエラー (400)");
  });

  test("YsAPIErrorとして投げられ、status/statusTextを保持する", async () => {
    const response = { status: 429, statusText: "Too Many Requests", text: async () => "" };
    try {
      await handleErrorResponse(response);
      throw new Error("例外が投げられるべき");
    } catch (e) {
      expect(e).toBeInstanceOf(YsAPIError);
      expect(e.status).toBe(429);
      expect(e.statusText).toBe("Too Many Requests");
    }
  });

  test("エラーテキストが100文字超の場合は末尾を省略する", async () => {
    const longText = "x".repeat(200);
    const response = { status: 400, statusText: "Bad Request", text: async () => longText };
    await expect(handleErrorResponse(response)).rejects.toThrow("...");
  });
});

// ===== callChatAPINonStream のテスト =====
describe("callChatAPINonStream", () => {
  beforeEach(() => {
    global.fetch.mockReset();
  });

  test("正常時にchoices[0].message.contentを返す", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "要約結果" } }] })
    });

    const result = await callChatAPINonStream([{ role: "user", content: "test" }], {
      apiKey: "k",
      apiUrl: "https://api.test.com",
      apiModel: "gpt-4o"
    });
    expect(result).toBe("要約結果");
  });

  test("response.ok=falseの場合はYsAPIErrorを投げる", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "server error"
    });

    await expect(
      callChatAPINonStream([{ role: "user", content: "test" }], {
        apiKey: "k",
        apiUrl: "https://api.test.com",
        apiModel: "gpt-4o"
      })
    ).rejects.toThrow("APIサーバーでエラー");
  });

  test("contentが欠損している場合は空文字を返す", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] })
    });

    const result = await callChatAPINonStream([{ role: "user", content: "test" }], {
      apiKey: "k",
      apiUrl: "https://api.test.com",
      apiModel: "gpt-4o"
    });
    expect(result).toBe("");
  });

  test("abortSignalがfetchOptionsのsignalに渡される", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "x" } }] })
    });

    const controller = new AbortController();
    await callChatAPINonStream(
      [{ role: "user", content: "test" }],
      { apiKey: "k", apiUrl: "https://api.test.com", apiModel: "gpt-4o" },
      controller.signal
    );

    // fetchWithRetry が内部 AbortController を作って外部 signal を橋渡しするため、
    // 受け取った signal は何らかの AbortSignal インスタンスであることを検証
    const callArgs = global.fetch.mock.calls[0][1];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });
});

// ===== fetchWithRetry のテスト =====
describe("fetchWithRetry", () => {
  beforeEach(() => {
    global.fetch.mockReset();
  });

  test("初回成功時はfetchを1回だけ呼ぶ", async () => {
    global.fetch.mockResolvedValue({ ok: true });

    const response = await fetchWithRetry("https://api.test.com", { headers: {}, body: "{}" }, 3);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
  });

  test("429エラーからリトライして成功する", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true });

    jest.useFakeTimers();
    const promise = fetchWithRetry("https://api.test.com", { headers: {}, body: "{}" }, 3);
    await jest.runAllTimersAsync();
    const response = await promise;
    jest.useRealTimers();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(true);
  });

  test("5xxエラーでリトライ上限に達した場合は最後のresponseを返す", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    jest.useFakeTimers();
    const promise = fetchWithRetry("https://api.test.com", { headers: {}, body: "{}" }, 2);
    await jest.runAllTimersAsync();
    const response = await promise;
    jest.useRealTimers();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(503);
  });

  test("外部abortSignalで中断時はYsAbortErrorを投げる", async () => {
    // fetchは渡されたsignalのabortイベントでAbortErrorにする
    global.fetch = jest.fn(function (url, opts) {
      return new Promise(function (resolve, reject) {
        opts.signal.addEventListener("abort", function () {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    const external = new AbortController();
    const options = { headers: {}, body: "{}", signal: external.signal };

    const promise = fetchWithRetry("https://api.test.com", options, 3);
    // リスナ登録は同期的に行われるので即座にabortしてよい
    external.abort();

    await expect(promise).rejects.toBeInstanceOf(YsAbortError);
  });

  test("タイムアウト時（内部abort）はYsTimeoutErrorを投げる", async () => {
    // 外部signalなし → 内部setTimeoutによるabort → TimeoutError になる経路
    global.fetch = jest.fn(function (url, opts) {
      return new Promise(function (resolve, reject) {
        opts.signal.addEventListener("abort", function () {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    jest.useFakeTimers();
    const promise = fetchWithRetry("https://api.test.com", { headers: {}, body: "{}" }, 3);
    // API_TIMEOUT_MS (30000ms) 経過で内部 abort が発火
    jest.advanceTimersByTime(30000);
    await expect(promise).rejects.toBeInstanceOf(YsTimeoutError);
    jest.useRealTimers();
  });

  test("ネットワークエラーでリトライ上限に達した場合は例外を投げる", async () => {
    // 注: フェイクタイマーとmockRejectedValueの組み合わせはJest 29で
    // microtaskのフラッシュ順序問題を起こすため、実タイマーで検証（約1秒）
    global.fetch.mockRejectedValue(new Error("network down"));

    await expect(
      fetchWithRetry("https://api.test.com", { headers: {}, body: "{}" }, 2)
    ).rejects.toThrow("network down");

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // ★ A4: 既に abort 済みの signal を渡された場合は即座に YsAbortError
  // (旧実装では addEventListener が過去イベントを再送しないため、
  //  リクエストが完走するまで API コールが続いてしまっていた)
  test("外部 signal が既に abort 済みなら fetch を呼ばず YsAbortError を投げる", async () => {
    const external = new AbortController();
    external.abort(); // 呼び出し時点で既に abort
    const options = { headers: {}, body: "{}", signal: external.signal };

    await expect(fetchWithRetry("https://api.test.com", options, 3)).rejects.toBeInstanceOf(
      YsAbortError
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
