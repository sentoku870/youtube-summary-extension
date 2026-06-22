// tests/api.test.js — API層の単体テスト
const { buildRequestConfig, readStream, callChatAPIStream } = require("../src/domain/api");

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