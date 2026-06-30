// tests/api-stream.test.js — SSE ストリームパーサの単体テスト
const helpers = require("./__helpers__/index.cjs");
helpers.installChromeMock();

const { readStream } = require("../src/domain/api-stream");
const { YsAbortError } = require("../src/infrastructure/errors");

// TextEncoder / TextDecoder の polyfill
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// ReadableStreamDefaultReader のモック
function createMockReader(chunks) {
  let i = 0;
  return {
    read: async function () {
      if (i >= chunks.length) {
        return { done: true, value: undefined };
      }
      const chunk = chunks[i++];
      return { done: false, value: new TextEncoder().encode(chunk) };
    }
  };
}

describe("readStream", () => {
  test("SSE データをパースして onChunk を呼ぶ", async () => {
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      "data: [DONE]\n\n"
    ]);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onChunk).toHaveBeenCalledWith("Hello");
    expect(onChunk).toHaveBeenCalledWith("Hello World");
    expect(onDone).toHaveBeenCalledWith("Hello World");
  });

  test("複数行バッファをまたいでパース", async () => {
    // 1チャンクに複数行、SSE イベントをまたぐ
    const reader = createMockReader([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n',
      '\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\n'
    ]);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onChunk).toHaveBeenCalledWith("A");
    expect(onChunk).toHaveBeenCalledWith("AB");
  });

  test("data: 以外の行は無視", async () => {
    const reader = createMockReader([
      ": comment line\n",
      'data: {"choices":[{"delta":{"content":"X"}}]}\n\n'
    ]);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onChunk).toHaveBeenCalledWith("X");
  });

  test("不正な JSON のチャンクはスキップして次へ", async () => {
    const warnSpy = jest.spyOn(console, "error").mockImplementation(function () {});
    const reader = createMockReader([
      "data: {invalid json}\n\n",
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'
    ]);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onChunk).toHaveBeenCalledWith("OK");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("空 chunk はスキップ", async () => {
    const reader = createMockReader(["", "data: ", '{"choices":[]}\n\n']);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    // choices が空なので onChunk は呼ばれない
    expect(onChunk).not.toHaveBeenCalled();
  });

  test("ストリーム完了時に onDone が呼ばれる", async () => {
    const reader = createMockReader(['data: {"choices":[{"delta":{"content":"Z"}}]}\n\n']);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onDone).toHaveBeenCalledWith("Z");
  });

  test("reader.read() が DOMException AbortError を throw した場合 YsAbortError で throw", async () => {
    const reader = {
      read: async function () {
        // 実装は `e instanceof DOMException && e.name === "AbortError"` で判定
        // jsdom の DOMException を使って本物の AbortError を作る
        throw new DOMException("aborted", "AbortError");
      }
    };
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await expect(readStream(reader, onChunk, onDone)).rejects.toBeInstanceOf(YsAbortError);
  });

  test("reader.read() がその他のエラーを throw した場合も throw", async () => {
    const reader = {
      read: async function () {
        throw new Error("network error");
      }
    };
    await expect(readStream(reader, jest.fn(), jest.fn())).rejects.toThrow("network error");
  });

  test("空のストリームでも onDone が呼ばれる", async () => {
    const reader = createMockReader([]);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    await readStream(reader, onChunk, onDone);
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith("");
  });
});
