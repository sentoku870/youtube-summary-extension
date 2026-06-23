// tests/state.test.js — state.js の単体テスト
const { state, createInitialState, createInitialTabState } = require("../src/shared/state");

describe("createInitialState", () => {
  test("期待される全プロパティを持つ", () => {
    const s = createInitialState();
    expect(s).toHaveProperty("panelEl", null);
    expect(s).toHaveProperty("activeTab", null);
    expect(s).toHaveProperty("eventsBound", false);
    expect(s).toHaveProperty("tabs");
    expect(s).toHaveProperty("tabIds", ["summary", "customA", "customB"]);
    expect(s).toHaveProperty("transcriptText", "");
    expect(s).toHaveProperty("preloadedTranscript", null);
    expect(s).toHaveProperty("transcriptReady", false);
    expect(s).toHaveProperty("videoMeta", null);
    expect(s).toHaveProperty("abortController", null);
    expect(s).toHaveProperty("pendingRetry", false);
    expect(s).toHaveProperty("initialized", false);
    expect(s).toHaveProperty("lastInitTime", 0);
  });

  test("呼び出しごとに独立したインスタンスを返す", () => {
    const s1 = createInitialState();
    const s2 = createInitialState();
    s1.tabs.foo = "bar";
    expect(s2.tabs.foo).toBeUndefined();
  });

  test("tabs は空オブジェクト", () => {
    const s = createInitialState();
    expect(Object.keys(s.tabs)).toHaveLength(0);
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

describe("state（シングルトン）", () => {
  test("createInitialState と同じ構造を持つ", () => {
    const fresh = createInitialState();
    // 既存stateに加えた変更を除外するため、キーセットを比較
    for (const key in fresh) {
      expect(state).toHaveProperty(key);
    }
  });

  test("tabIds に期待される3つのIDが含まれる", () => {
    expect(state.tabIds).toContain("summary");
    expect(state.tabIds).toContain("customA");
    expect(state.tabIds).toContain("customB");
  });
});