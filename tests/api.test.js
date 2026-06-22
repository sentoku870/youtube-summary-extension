// tests/api.test.js — API層の単体テスト
const {
  buildRequestConfig,
  readStream,
  callChatAPIStream,
  fetchModelList,
  deriveModelsUrl,
  buildAuthHeaders,
  isOpenRouterUrl,
  handleErrorResponse,
  callChatAPINonStream,
  fetchWithRetry
} = require("../src/domain/api");

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
  global.ReadableStream = function() {};
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
      apiModel: "gpt-4o",
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
    const sseData = "data: " + JSON.stringify({
      choices: [{ delta: { content: "Hello" } }]
    }) + "\n\ndata: " + JSON.stringify({
      choices: [{ delta: { content: " World" } }]
    }) + "\n\ndata: [DONE]\n\n";

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
    const sseData = "data: " + JSON.stringify({
      choices: [{ delta: { content: "Hello" } }]
    }) + "\n\ndata: " + JSON.stringify({
      choices: [{ delta: { content: " World" } }]
    }) + "\n\ndata: [DONE]\n\n";

    global.fetch.mockResolvedValue({
      ok: true,
      body: createMockStream([sseData])
    });

    const onChunk = jest.fn();
    const onDone = jest.fn();

    await callChatAPIStream(
      [{ role: "user", content: "test" }],
      { apiKey: "test-key", apiUrl: "https://api.test.com", apiModel: "gpt-4o", maxTokens: "4096", temperature: "0.3" },
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
      { apiKey: "test-key", apiUrl: "https://openrouter.ai/api/v1/chat/completions", apiModel: "gpt-4o", maxTokens: "4096", temperature: "0.3" },
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
        { apiKey: "test-key", apiUrl: "https://api.test.com", apiModel: "gpt-4o", maxTokens: "4096", temperature: "0.3" },
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
      { apiKey: "test-key", apiUrl: "https://api.test.com", apiModel: "gpt-4o", maxTokens: "4096", temperature: "0.3" },
      onChunk,
      onDone
    );

    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});

// ===== deriveModelsUrl のテスト =====
describe("deriveModelsUrl", () => {
  test("chat/completions URL から /models を導出する", () => {
    expect(deriveModelsUrl("https://api.deepseek.com/v1/chat/completions"))
      .toBe("https://api.deepseek.com/v1/models");
    expect(deriveModelsUrl("https://openrouter.ai/api/v1/chat/completions"))
      .toBe("https://openrouter.ai/api/v1/models");
    expect(deriveModelsUrl("https://api.openai.com/v1/chat/completions"))
      .toBe("https://api.openai.com/v1/models");
  });

  test("クエリ文字列を除去する", () => {
    expect(deriveModelsUrl("https://api.test.com/v1/chat/completions?foo=bar"))
      .toBe("https://api.test.com/v1/models");
  });

  test("chat/completions が含まれない場合はフォールバック", () => {
    const url = deriveModelsUrl("https://api.test.com/v1");
    expect(url).toMatch(/\/models$/);
  });

  test("空文字・無効URLのフォールバック", () => {
    expect(deriveModelsUrl("")).toBe("");
    // 文字列置換による最低限のフォールバック
    expect(deriveModelsUrl("not-a-valid-url/chat/completions"))
      .toBe("not-a-valid-url/models");
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

// ===== fetchModelList のテスト =====
describe("fetchModelList", () => {
  beforeEach(() => {
    global.fetch.mockReset();
  });

  test("OpenAI互換 /models レスポンスをパースして id 一覧を返す", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-4o" },
          { id: "gpt-4o-mini" },
          { id: "gpt-3.5-turbo" }
        ]
      })
    });

    const models = await fetchModelList(
      "https://api.test.com/v1/chat/completions",
      "key-123"
    );

    expect(models).toHaveLength(3);
    // アルファベット順でソートされる
    expect(models.map(m => m.id)).toEqual(["gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini"]);
    // GET リクエストで /models にアクセス
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test.com/v1/models",
      expect.objectContaining({ method: "GET" })
    );
  });

  test("OpenRouter レスポンス（name プロパティ付き）を label 付きで返す", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", name: "OpenAI: GPT-4o" },
          { id: "anthropic/claude-3.5-sonnet", name: "Anthropic: Claude 3.5 Sonnet" }
        ]
      })
    });

    const models = await fetchModelList(
      "https://openrouter.ai/api/v1/chat/completions",
      "or-key"
    );

    expect(models).toHaveLength(2);
    const gpt4o = models.find(m => m.id === "openai/gpt-4o");
    expect(gpt4o.label).toBe("OpenAI: GPT-4o");
    // OpenRouter 用ヘッダーが付与されている
    const callArgs = global.fetch.mock.calls[0][1];
    expect(callArgs.headers["HTTP-Referer"]).toBe("https://chrome.google.com/webstore");
    expect(callArgs.headers["X-Title"]).toBe("YouTube Summary Extension");
  });

  test("配列形式レスポンスも処理できる", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "model-a" },
        { id: "model-b" }
      ]
    });

    const models = await fetchModelList(
      "https://api.test.com/v1/chat/completions",
      "key"
    );

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("model-a");
  });

  test("id を持たない要素は除外される", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "valid-model" },
          { name: "no-id-model" },
          null,
          { id: "" }
        ]
      })
    });

    const models = await fetchModelList(
      "https://api.test.com/v1/chat/completions",
      "key"
    );

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("valid-model");
  });

  test("APIキー未入力時に分かりやすいエラー", async () => {
    await expect(
      fetchModelList("https://api.test.com/v1/chat/completions", "")
    ).rejects.toThrow("APIキーが必要");
  });

  test("URL未入力時にエラー", async () => {
    await expect(
      fetchModelList("", "key")
    ).rejects.toThrow("エンドポイントURLが未設定");
  });

  test("401/403 エラー時にAPIキー無効のメッセージ", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized"
    });

    await expect(
      fetchModelList("https://api.test.com/v1/chat/completions", "bad-key")
    ).rejects.toThrow("APIキーが無効");
  });

  test("404 エラー時に手動入力を促すメッセージ", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found"
    });

    await expect(
      fetchModelList("https://api.test.com/v1/chat/completions", "key")
    ).rejects.toThrow("手動でモデル名を入力");
  });

  test("OpenRouter のエンドポイントURLから正しく /models を導出してアクセス", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    });

    await fetchModelList(
      "https://openrouter.ai/api/v1/chat/completions",
      "or-key"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.anything()
    );
  });
});

// ===== handleErrorResponse のテスト =====
describe("handleErrorResponse", () => {
  test("429エラー時にレート制限メッセージでYsAPIErrorを投げる", async () => {
    const response = { status: 429, statusText: "Too Many Requests", text: async () => "rate limited" };
    await expect(handleErrorResponse(response)).rejects.toThrow("APIの利用制限中");
  });

  test("5xxエラー時にサーバーエラーメッセージでYsAPIErrorを投げる", async () => {
    const response = { status: 503, statusText: "Service Unavailable", text: async () => "unavailable" };
    await expect(handleErrorResponse(response)).rejects.toThrow("APIサーバーでエラーが発生しました");
  });

  test("4xxエラー時に詳細を含むメッセージでYsAPIErrorを投げる", async () => {
    const response = { status: 400, statusText: "Bad Request", text: async () => "invalid request" };
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

    const result = await callChatAPINonStream(
      [{ role: "user", content: "test" }],
      { apiKey: "k", apiUrl: "https://api.test.com", apiModel: "gpt-4o" }
    );
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
      callChatAPINonStream(
        [{ role: "user", content: "test" }],
        { apiKey: "k", apiUrl: "https://api.test.com", apiModel: "gpt-4o" }
      )
    ).rejects.toThrow("APIサーバーでエラー");
  });

  test("contentが欠損している場合は空文字を返す", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] })
    });

    const result = await callChatAPINonStream(
      [{ role: "user", content: "test" }],
      { apiKey: "k", apiUrl: "https://api.test.com", apiModel: "gpt-4o" }
    );
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

    const response = await fetchWithRetry(
      "https://api.test.com",
      { headers: {}, body: "{}" },
      3
    );

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
});