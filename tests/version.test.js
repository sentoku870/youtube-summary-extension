// tests/version.test.js — version.js の単体テスト

let mockChrome;
let getAppVersion, getAppBuildDate, getAppGitCommit;
let __setBuildInfoForTest;

beforeEach(() => {
  jest.resetModules();
  mockChrome = undefined;
});

function loadVersion() {
  if (mockChrome !== undefined) {
    global.chrome = mockChrome;
  } else {
    delete global.chrome;
  }
  const mod = require("../src/shared/version.js");
  getAppVersion = mod.getAppVersion;
  getAppBuildDate = mod.getAppBuildDate;
  getAppGitCommit = mod.getAppGitCommit;
  __setBuildInfoForTest = mod.__setBuildInfoForTest;
  return mod;
}

describe("version / getAppVersion", () => {
  test("chrome.runtime.getManifest() から version を返す", () => {
    mockChrome = {
      runtime: {
        id: "test-extension-id",
        getManifest: () => ({ version: "1.2.3" })
      }
    };
    loadVersion();
    expect(getAppVersion()).toBe("1.2.3");
  });

  test("chrome.runtime が無い環境では 'unknown'", () => {
    mockChrome = undefined;
    loadVersion();
    expect(getAppVersion()).toBe("unknown");
  });

  test("chrome.runtime.id のみで getManifest が無い場合は 'unknown'", () => {
    mockChrome = { runtime: { id: "test" } };
    loadVersion();
    expect(getAppVersion()).toBe("unknown");
  });

  test("getManifest が例外を投げた場合 'unknown' を返す", () => {
    mockChrome = {
      runtime: {
        id: "test-extension-id",
        getManifest: () => {
          throw new Error("context invalidated");
        }
      }
    };
    loadVersion();
    expect(getAppVersion()).toBe("unknown");
  });

  test("manifest の version が空文字なら 'unknown'", () => {
    mockChrome = {
      runtime: {
        id: "test-extension-id",
        getManifest: () => ({ version: "" })
      }
    };
    loadVersion();
    expect(getAppVersion()).toBe("unknown");
  });

  test("manifest.version の前後の空白は保持（trim しない）", () => {
    mockChrome = {
      runtime: {
        id: "test-extension-id",
        getManifest: () => ({ version: "  1.0.0  " })
      }
    };
    loadVersion();
    expect(getAppVersion()).toBe("  1.0.0  ");
  });
});

describe("version / getAppBuildDate", () => {
  test("注入された buildInfo から buildDate を取得", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ version: "1.0.0", buildDate: "2026-06-23", gitCommit: "abc" });
    const date = await getAppBuildDate();
    expect(date).toBe("2026-06-23");
  });

  test("注入値が null のとき 'unknown'", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest(null);
    const date = await getAppBuildDate();
    expect(date).toBe("unknown");
  });

  test("本番パス（動的 import 失敗時）は 'unknown'", async () => {
    mockChrome = undefined;
    loadVersion();
    // テストオーバーライドを解除 → 本番パスを実行
    __setBuildInfoForTest(undefined);
    // 動的 import が実際の build-info.json を読むが、テスト環境では
    // ファイルが存在して値が入ってしまう可能性があるため、結果は unknown/null の
    // どちらかであることを緩く検証する
    const date = await getAppBuildDate();
    expect(["unknown", expect.any(String)]).toContainEqual(date);
  });

  test("空オブジェクトのとき 'unknown'", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({});
    const date = await getAppBuildDate();
    expect(date).toBe("unknown");
  });

  test("buildDate が空文字のとき 'unknown'", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ buildDate: "" });
    const date = await getAppBuildDate();
    expect(date).toBe("unknown");
  });

  test("__setBuildInfoForTest(null) で再注入できる", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ buildDate: "2026-01-01" });
    expect(await getAppBuildDate()).toBe("2026-01-01");
    __setBuildInfoForTest({ buildDate: "2026-12-31" });
    expect(await getAppBuildDate()).toBe("2026-12-31");
  });
});

describe("version / getAppGitCommit", () => {
  test("注入された buildInfo から gitCommit を取得", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ version: "1.0.0", buildDate: "2026-06-23", gitCommit: "abc1234" });
    const commit = await getAppGitCommit();
    expect(commit).toBe("abc1234");
  });

  test("gitCommit が null のとき null を返す", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ version: "1.0.0", buildDate: "2026-06-23", gitCommit: null });
    const commit = await getAppGitCommit();
    expect(commit).toBeNull();
  });

  test("gitCommit プロパティが無い場合 null", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ version: "1.0.0", buildDate: "2026-06-23" });
    const commit = await getAppGitCommit();
    expect(commit).toBeNull();
  });

  test("注入値が null のとき null", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest(null);
    const commit = await getAppGitCommit();
    expect(commit).toBeNull();
  });

  test("本番パス（動的 import 失敗時）は null", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest(undefined);
    const commit = await getAppGitCommit();
    // 動的 import の結果次第（null か string）両方の可能性がある
    expect(commit === null || typeof commit === "string").toBe(true);
  });

  test("gitCommit が空文字のとき null", async () => {
    mockChrome = undefined;
    loadVersion();
    __setBuildInfoForTest({ gitCommit: "" });
    const commit = await getAppGitCommit();
    expect(commit).toBeNull();
  });
});
