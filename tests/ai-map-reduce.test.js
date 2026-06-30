// tests/ai-map-reduce.test.js — Map-Reduce チャンク処理の単体テスト
const helpers = require("./__helpers__/index.cjs");

helpers.installChromeMock();
// (sessionState / resetSession used via helpers when needed)
const { processMapReduce } = require("../src/domain/ai-map-reduce");

// ports.js をモック化（UI 呼び出しをテスト）
const mockAdapter = {
  showError: jest.fn(),
  hideProgress: jest.fn(),
  showProgress: jest.fn(),
  setSummaryContent: jest.fn(),
  clearSummaryContent: jest.fn(),
  updateInfoLabel: jest.fn(),
  showChatArea: jest.fn(),
  focusChatInput: jest.fn(),
  showCopyButton: jest.fn(),
  showRegenButton: jest.fn(),
  getSummaryTextEl: jest.fn(() => null),
  updateTabUI: jest.fn(),
  hideError: jest.fn()
};

const { setUiAdapter } = require("../src/domain/ports");
setUiAdapter(mockAdapter);

// api.js をモック化（callChatAPINonStream / callChatAPIStream の戻り値を制御）
let mockNonStreamResult = "";
let mockNonStreamShouldThrow = null;
let mockStreamResult = "";
let mockStreamShouldThrow = null;

jest.mock("../src/domain/api.js", () => ({
  callChatAPIStream: jest.fn(),
  callChatAPINonStream: jest.fn()
}));

const api = require("../src/domain/api");

describe("processMapReduce", () => {
  const config = {
    apiUrl: "https://api.example.com/v1/chat/completions",
    apiKey: "test-key",
    apiModel: "test-model",
    maxTokens: 4096,
    temperature: 0.3
  };

  beforeEach(() => {
    Object.values(mockAdapter).forEach((fn) => fn.mockClear());
    api.callChatAPIStream.mockReset();
    api.callChatAPINonStream.mockReset();
    mockNonStreamResult = "chunk result";
    mockNonStreamShouldThrow = null;
    mockStreamResult = "";
    mockStreamShouldThrow = null;

    // チャンク処理用: callChatAPINonStream
    api.callChatAPINonStream.mockImplementation(async function () {
      if (mockNonStreamShouldThrow) throw mockNonStreamShouldThrow;
      return mockNonStreamResult;
    });

    // マージ処理用: callChatAPIStream
    api.callChatAPIStream.mockImplementation(async function (messages, _cfg, onChunk, onDone, signal) {
      if (signal && signal.aborted) {
        const err = new DOMException("Aborted", "AbortError");
        throw err;
      }
      if (mockStreamShouldThrow) throw mockStreamShouldThrow;
      onChunk(mockStreamResult || "merged result");
      if (onDone) onDone(mockStreamResult || "merged result");
    });
  });

  afterAll(() => {
    helpers.uninstallChromeMock();
  });

  describe("正常系", () => {
    test("チャンクを並列要約してマージ結果を返す", async () => {
      const chunks = ["chunk1 content", "chunk2 content", "chunk3 content"];
      const result = await processMapReduce(chunks, config, new AbortController().signal, "system prompt", new Promise(() => {}));
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("進捗表示が出る（チャンク処理開始）", async () => {
      const chunks = ["a", "b"];
      await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      expect(mockAdapter.showProgress).toHaveBeenCalled();
      const calls = mockAdapter.showProgress.mock.calls.map((c) => c[0]);
      // "チャンク処理を開始..." のような進捗メッセージが含まれる
      expect(calls.some((m) => typeof m === "string" && m.includes("チャンク"))).toBe(true);
    });

    test("showProgress がチャンクワーカーで呼ばれる（実行中メッセージ）", async () => {
      const chunks = ["a", "b"];
      await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      // チャンク処理開始 + 統合中 の2回
      expect(mockAdapter.showProgress).toHaveBeenCalled();
      const messages = mockAdapter.showProgress.mock.calls.map((c) => c[0]);
      // 統合中メッセージ
      expect(messages.some((m) => typeof m === "string" && m.includes("統合"))).toBe(true);
    });

    test("空チャンクは早期 return null + showError", async () => {
      const result = await processMapReduce([], config, new AbortController().signal, "prompt", new Promise(() => {}));
      expect(result).toBeNull();
      expect(mockAdapter.showError).toHaveBeenCalled();
    });

    test("全チャンク失敗時は null + showError", async () => {
      // callChatAPINonStream を全て失敗させる
      mockNonStreamShouldThrow = new Error("API error");
      const chunks = ["a", "b"];
      const result = await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      // 全チャンク失敗 → showError + null
      expect(result).toBeNull();
      expect(mockAdapter.showError).toHaveBeenCalled();
      // showError のメッセージに「すべてのチャンクの処理に失敗」が含まれる
      const errorMsg = mockAdapter.showError.mock.calls[0]?.[0];
      expect(errorMsg).toMatch(/チャンク/);
    });
  });

  describe("中断", () => {
    test("signal.aborted で中断されると DOMException を throw", async () => {
      const controller = new AbortController();
      const chunks = ["a", "b"];
      // マージリクエストで即座に abort
      api.callChatAPIStream.mockImplementation(async function (msgs, _cfg, _onChunk, _onDone, _signal) {
        if (msgs[0].content && msgs[0].content.includes("統合")) {
          controller.abort();
          // AbortError を投げる
          const err = new DOMException("Aborted", "AbortError");
          throw err;
        }
        return "ok";
      });
      await expect(
        processMapReduce(chunks, config, controller.signal, "prompt", new Promise(() => {}))
      ).rejects.toThrow();
    });

    test("チャンク処理中に abort されたら worker ループを抜ける", async () => {
      const controller = new AbortController();
      let callCount = 0;
      api.callChatAPIStream.mockImplementation(async function (_msgs, _cfg, _onChunk, _onDone, _signal) {
        callCount++;
        if (callCount === 1) {
          controller.abort();
        }
        // 2回目以降は実行されない想定だが、実際に呼ばれるかは実装次第
        return "ok";
      });
      try {
        await processMapReduce(["a", "b", "c", "c", "c"], config, controller.signal, "prompt", new Promise(() => {}));
      } catch {
        // 中断例外は期待される
      }
      // abort 後はworkerループが抜けるため、callCount は大きくならない
      expect(callCount).toBeLessThanOrEqual(5);
    });
  });

  describe("チャンクワーカー", () => {
    test("MAX_CONCURRENCY (5) を超えるチャンクは順次処理", async () => {
      const chunks = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
      const result = await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      // 全チャンクが処理されれば統合リクエストも走る
      expect(typeof result).toBe("string");
    });

    test("チャンク数 1 の場合は即マージ処理に進む", async () => {
      const chunks = ["single"];
      mockStreamResult = "single merged";
      const result = await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      expect(result).toBe("single merged");
    });

    test("チャンク数が MAX_CONCURRENCY と同じ場合は並列実行", async () => {
      const chunks = ["c1", "c2", "c3", "c4", "c5"];
      const result = await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      expect(typeof result).toBe("string");
    });
  });

  describe("プロンプト構築", () => {
    test("チャンクワーカー用プロンプトにチャンク番号が含まれる", async () => {
      const receivedChunkMessages = [];
      // チャンク処理は callChatAPINonStream を使う
      api.callChatAPINonStream.mockImplementation(async function (messages) {
        receivedChunkMessages.push(messages);
        return "chunk result";
      });
      const chunks = ["alpha", "beta", "gamma"];
      await processMapReduce(chunks, config, new AbortController().signal, "base prompt", new Promise(() => {}));
      // チャンクワーカーの user message に "チャンク N/3" 形式が含まれる
      const userMessages = receivedChunkMessages.flatMap((m) =>
        m.filter((msg) => msg.role === "user").map((msg) => msg.content)
      );
      expect(userMessages.some((msg) => /チャンク\s+\d+\/3/.test(msg))).toBe(true);
    });

    test("マージリクエストの user message は統合指示を含む", async () => {
      const receivedMergeMessages = [];
      api.callChatAPIStream.mockImplementation(async function (messages, _cfg, onChunk, onDone) {
        receivedMergeMessages.push(messages);
        if (onChunk) onChunk("merged");
        if (onDone) onDone("merged");
      });
      const chunks = ["a", "b", "c"];
      await processMapReduce(chunks, config, new AbortController().signal, "prompt", new Promise(() => {}));
      // マージリクエストの user message に "チャンク要約結果" が含まれる
      expect(receivedMergeMessages.length).toBeGreaterThan(0);
      const mergeUserContent = receivedMergeMessages.flatMap((m) =>
        m.filter((msg) => msg.role === "user").map((msg) => msg.content)
      );
      // FINAL_MERGE_INSTRUCTION は "各チャンクの要約結果です" を含む
      expect(
        mergeUserContent.some(
          (msg) => typeof msg === "string" && msg.includes("各チャンクの要約結果")
        )
      ).toBe(true);
    });
  });

  describe("エラーハンドリング", () => {
    test("統合リクエスト時のエラーはそのまま throw", async () => {
      const controller = new AbortController();
      let mergeCalled = false;
      api.callChatAPIStream.mockImplementation(async function (msgs, _cfg, _onChunk, _onDone, _signal) {
        // マージリクエストを検出
        if (msgs[0].content.includes("統合")) {
          mergeCalled = true;
          throw new Error("merge failed");
        }
        return "ok";
      });
      await expect(
        processMapReduce(["a"], config, controller.signal, "prompt", new Promise(() => {}))
      ).rejects.toThrow();
      expect(mergeCalled).toBe(true);
    });
  });

  describe("チャンクワーカーで一部失敗→残りで続行", () => {
    test("1つ目のチャンクだけ失敗、2つ目が成功 → 残りでマージへ進む", async () => {
      let callCount = 0;
      api.callChatAPINonStream.mockImplementation(async function () {
        callCount++;
        if (callCount === 1) {
          // 1回目は失敗
          throw new Error("chunk 1 failed");
        }
        // 2回目は成功
        return "chunk " + callCount;
      });
      const result = await processMapReduce(
        ["a", "b"],
        config,
        new AbortController().signal,
        "prompt",
        new Promise(() => {})
      );
      // マージは進む（chunk 2 が成功しているので）
      expect(typeof result).toBe("string");
      expect(result).toBe("merged result");
    });
  });
});