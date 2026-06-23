// tests/constants.test.js — src/shared/constants.js のスナップショットテスト
// 数値定数・文字列定数の意図しない変更を検出する目的。
const constants = require("../src/shared/constants");

describe("src/shared/constants", () => {
  // ===== API 関連 =====
  describe("API 関連", () => {
    test("API_TIMEOUT_MS = 30000", () => {
      expect(constants.API_TIMEOUT_MS).toBe(30000);
    });

    test("API_MAX_RETRIES_STREAM = 3", () => {
      expect(constants.API_MAX_RETRIES_STREAM).toBe(3);
    });

    test("API_MAX_RETRIES_NONSTREAM = 2", () => {
      expect(constants.API_MAX_RETRIES_NONSTREAM).toBe(2);
    });

    test("API_RETRY_BASE_WAIT_MS = 1500", () => {
      expect(constants.API_RETRY_BASE_WAIT_MS).toBe(1500);
    });

    test("API_RETRY_NET_BASE_WAIT_MS = 1000", () => {
      expect(constants.API_RETRY_NET_BASE_WAIT_MS).toBe(1000);
    });
  });

  // ===== 全体処理タイムアウト =====
  describe("全体処理タイムアウト", () => {
    test("GLOBAL_TIMEOUT_MS = 180000（3分）", () => {
      expect(constants.GLOBAL_TIMEOUT_MS).toBe(180000);
    });
  });

  // ===== Map-Reduce 並列処理 =====
  describe("Map-Reduce", () => {
    test("MAX_CONCURRENCY = 5", () => {
      expect(constants.MAX_CONCURRENCY).toBe(5);
    });

    test("CHUNK_MAX_ATTEMPTS = 2", () => {
      expect(constants.CHUNK_MAX_ATTEMPTS).toBe(2);
    });
  });

  // ===== トークン計算 =====
  describe("トークン計算", () => {
    test("CONTEXT_WINDOW_USABLE_RATIO = 0.8", () => {
      expect(constants.CONTEXT_WINDOW_USABLE_RATIO).toBe(0.8);
    });

    test("DEFAULT_MAX_TOKENS = 4096", () => {
      expect(constants.DEFAULT_MAX_TOKENS).toBe(4096);
    });

    test("DEFAULT_TEMPERATURE = 0.3", () => {
      expect(constants.DEFAULT_TEMPERATURE).toBe(0.3);
    });

    test("MIN_USABLE_TOKENS = 1", () => {
      expect(constants.MIN_USABLE_TOKENS).toBe(1);
    });
  });

  // ===== DOM / UI =====
  describe("DOM / UI", () => {
    test("TIMESTAMP_DELEGATION_FLAG = 'ysTimestampBound'", () => {
      expect(constants.TIMESTAMP_DELEGATION_FLAG).toBe("ysTimestampBound");
    });

    test("TS_LINK_CLASS = 'ys-timestamp-link'", () => {
      expect(constants.TS_LINK_CLASS).toBe("ys-timestamp-link");
    });
  });

  // ===== 旧 STORAGE_KEYS が削除されたことの検証 =====
  describe("旧 STORAGE_KEYS (削除済み)", () => {
    test("STORAGE_KEYS は export されていない", () => {
      expect(constants.STORAGE_KEYS).toBeUndefined();
    });
  });
});
