// tests/state.test.js — state.js の単体テスト
const stateModule = require("../src/shared/state");
const { uiState, sessionState, resetSession, createInitialSessionState, createInitialTabState } =
  stateModule;

describe("uiState（UI 状態）", () => {
  test("期待される全プロパティを持つ", () => {
    expect(uiState).toHaveProperty("panelEl", null);
    expect(uiState).toHaveProperty("activeTab", null);
    expect(uiState).toHaveProperty("eventsBound", false);
    expect(uiState).toHaveProperty("tabs");
    expect(uiState).toHaveProperty("tabIds", ["summary", "customA", "customB"]);
    expect(uiState).toHaveProperty("initialized", false);
    expect(uiState).toHaveProperty("lastInitTime", 0);
  });

  test("tabs は空オブジェクト", () => {
    expect(Object.keys(uiState.tabs)).toHaveLength(0);
  });
});

describe("sessionState（セッション状態）", () => {
  test("期待される全プロパティを持つ", () => {
    expect(sessionState).toHaveProperty("transcriptText", "");
    expect(sessionState).toHaveProperty("preloadedTranscript", null);
    expect(sessionState).toHaveProperty("transcriptReady", false);
    expect(sessionState).toHaveProperty("videoMeta", null);
    expect(sessionState).toHaveProperty("abortController", null);
    expect(sessionState).toHaveProperty("pendingRetry", false);
    expect(sessionState).toHaveProperty("_transcriptPromise", null);
    expect(sessionState).toHaveProperty("_switchGen", 0);
  });
});

describe("createInitialSessionState", () => {
  test("呼び出しごとに独立したインスタンスを返す", () => {
    const s1 = createInitialSessionState();
    const s2 = createInitialSessionState();
    s1.transcriptText = "modified";
    expect(s2.transcriptText).toBe("");
  });
});

describe("resetSession", () => {
  test("sessionState を初期値にリセット", () => {
    sessionState.transcriptText = "dirty";
    sessionState.preloadedTranscript = { all: ["x"] };
    sessionState.videoMeta = { title: "t" };
    sessionState.abortController = { abort: function () {} };

    resetSession();

    expect(sessionState.transcriptText).toBe("");
    expect(sessionState.preloadedTranscript).toBeNull();
    expect(sessionState.videoMeta).toBeNull();
    expect(sessionState.abortController).toBeNull();
  });
});

describe("createInitialTabState", () => {
  test("期待される全プロパティを持つ", () => {
    const t = createInitialTabState();
    expect(t).toHaveProperty("generated", false);
    expect(t).toHaveProperty("content", "");
    expect(t).toHaveProperty("config", null);
    expect(t).toHaveProperty("modelLabel", "");
    expect(t).toHaveProperty("transcriptCount", 0);
    expect(t).toHaveProperty("chatHistory");
    expect(Array.isArray(t.chatHistory)).toBe(true);
    expect(t.chatHistory).toHaveLength(0);
  });

  test("呼び出しごとに独立したインスタンスを返す", () => {
    const t1 = createInitialTabState();
    const t2 = createInitialTabState();
    t1.content = "test";
    expect(t2.content).toBe("");
  });
});
