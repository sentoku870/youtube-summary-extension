// tests/popup.test.js — src/popup/popup.js
// ポップアップ画面のロジックを検証。
// jest.isolateModules を使って各テストで popup.js を再ロードし、状態リークを防ぐ。

const fs = require("fs");
const path = require("path");

// popup.html を読み込み（body 部分のみ）
const popupHtml = fs.readFileSync(path.resolve(__dirname, "../src/popup/popup.html"), "utf-8");
const bodyMatch = popupHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
const bodyNoScript = bodyMatch ? bodyMatch[1].replace(/<script[\s\S]*?<\/script>/g, "") : "";

// 各テストで popup.js をロードするヘルパ
function loadPopup() {
  jest.isolateModules(function () {
    require("../src/popup/popup.js");
  });
}

describe("popup", () => {
  let mockChrome;

  beforeEach(() => {
    jest.resetModules();
    // DOM を再注入
    document.body.innerHTML = bodyNoScript;

    // モジュールごとに新しいモックを準備
    mockChrome = {
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn()
      },
      runtime: {
        openOptionsPage: jest.fn()
      },
      storage: {
        local: {
          get: jest.fn()
        },
        onChanged: { addListener: jest.fn() }
      }
    };
    global.chrome = mockChrome;
    global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.window.close = jest.fn();

    // デフォルトの storage 応答
    mockChrome.storage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===== 初期表示 =====
  describe("初期表示 (updateUI 自動呼出)", () => {
    test("YouTube ページでない場合、dlBtn disabled + 案内メッセージ", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://example.com/" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        expect(document.getElementById("dlBtn").disabled).toBe(true);
        expect(document.getElementById("statusText").textContent).toMatch(/YouTube動画/);
      });
    });

    test("YouTube ページ + latestSummary 無し → dlBtn enabled", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      mockChrome.storage.local.get.mockResolvedValue({});
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        expect(document.getElementById("dlBtn").disabled).toBe(false);
        expect(document.getElementById("statusText").textContent).toMatch(/字幕を取得/);
      });
    });

    test("YouTube ページ + latestSummary あり → 「✅ 要約済み」", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      mockChrome.storage.local.get.mockResolvedValue({ latestSummary: "要約済み" });
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        expect(document.getElementById("statusText").textContent).toMatch(/✅ 要約済み/);
      });
    });
  });

  // ===== getActiveYouTubeTab (間接検証) =====
  describe("getActiveYouTubeTab (間接検証)", () => {
    test("アクティブタブ取得の引数", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      });
    });

    test("タブ自体が存在しない", () => {
      mockChrome.tabs.query.mockResolvedValue([]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        expect(document.getElementById("dlBtn").disabled).toBe(true);
      });
    });
  });

  // ===== DL ボタン click =====
  describe("DL ボタン click", () => {
    function setupYouTubeTab() {
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
      ]);
    }

    test("正常系: 字幕取得 → Blob URL → ダウンロード", () => {
      setupYouTubeTab();
      mockChrome.tabs.sendMessage.mockResolvedValue({ transcript: ["line1", "line2"] });
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(URL.createObjectURL).toHaveBeenCalled();
          const blob = URL.createObjectURL.mock.calls[0][0];
          expect(blob).toBeInstanceOf(Blob);
          expect(URL.revokeObjectURL).toHaveBeenCalled();
          expect(document.getElementById("statusText").textContent).toMatch(
            /✅ 字幕をダウンロード/
          );
        });
    });

    test("sendMessage の応答が null（ページ未読込）", () => {
      setupYouTubeTab();
      mockChrome.tabs.sendMessage.mockResolvedValue(null);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(document.getElementById("statusText").textContent).toMatch(/ページを再読み込み/);
          expect(URL.createObjectURL).not.toHaveBeenCalled();
        });
    });

    test("content script が error を返した", () => {
      setupYouTubeTab();
      mockChrome.tabs.sendMessage.mockResolvedValue({ error: "字幕取得失敗" });
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(document.getElementById("statusText").textContent).toContain("字幕取得失敗");
        });
    });

    test("transcript が空配列", () => {
      setupYouTubeTab();
      mockChrome.tabs.sendMessage.mockResolvedValue({ transcript: [] });
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(document.getElementById("statusText").textContent).toMatch(/字幕が見つかりません/);
        });
    });

    test("sendMessage が例外を投げた場合", () => {
      setupYouTubeTab();
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error("network"));
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(document.getElementById("statusText").textContent).toMatch(/ページを再読み込み/);
        });
    });

    test("YouTube 以外のページで押下", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://example.com" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const dlBtn = document.getElementById("dlBtn");
          dlBtn.click();
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(mockChrome.tabs.sendMessage).not.toHaveBeenCalled();
          expect(document.getElementById("statusText").textContent).toMatch(/YouTube動画/);
        });
    });
  });

  // ===== settings ボタン =====
  describe("settings ボタン", () => {
    test("click で chrome.runtime.openOptionsPage 呼ばれる", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        const settingsBtn = document.getElementById("settingsBtn");
        settingsBtn.click();
        expect(mockChrome.runtime.openOptionsPage).toHaveBeenCalled();
      });
    });
  });

  // ===== storage.onChanged ハンドラ =====
  describe("storage.onChanged ハンドラ", () => {
    test("モジュールロード時に addListener が呼ばれている", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://example.com" }]);
      loadPopup();
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalled();
    });

    test("latestSummary 変更で updateUI (内部の tabs.query) 呼ばれる", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      })
        .then(function () {
          const listener = mockChrome.storage.onChanged.addListener.mock.calls[0][0];
          listener({ latestSummary: { newValue: "x" } });
          return new Promise(function (r) {
            setTimeout(r, 0);
          });
        })
        .then(function () {
          expect(mockChrome.tabs.query.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    test("latestSummary 以外の変更では updateUI 呼ばれない", () => {
      mockChrome.tabs.query.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=x" }]);
      loadPopup();

      return new Promise(function (r) {
        setTimeout(r, 0);
      }).then(function () {
        const queryBefore = mockChrome.tabs.query.mock.calls.length;
        const listener = mockChrome.storage.onChanged.addListener.mock.calls[0][0];
        listener({ otherKey: { newValue: "x" } });
        expect(mockChrome.tabs.query.mock.calls.length).toBe(queryBefore);
      });
    });
  });
});
