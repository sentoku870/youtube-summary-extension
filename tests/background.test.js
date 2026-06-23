// tests/background.test.js — Service Worker の単体テスト
// chrome.tabs.onUpdated リスナーと isYouTubeWatchUrl 判定の検証。
// グローバルな chrome.tabs API をモックして動作を再現する。

// Service Worker グローバルをモック
const tabListeners = [];
const tabRemovedListeners = [];
const installedListeners = [];
const messageListeners = [];

global.chrome = {
  tabs: {
    onUpdated: {
      addListener: jest.fn(function (fn) {
        tabListeners.push(fn);
      })
    },
    onRemoved: {
      addListener: jest.fn(function (fn) {
        tabRemovedListeners.push(fn);
      })
    },
    onMoved: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn().mockResolvedValue()
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn(function (fn) {
        installedListeners.push(fn);
      })
    },
    onMessage: {
      addListener: jest.fn(function (fn) {
        messageListeners.push(fn);
      })
    }
  }
};

// Service Worker は副作用で chrome.tabs.onUpdated.addListener を呼ぶ
// グローバル状態をクリーンに保つため、各テスト前にリスナーをリセット
function loadBackgroundFresh() {
  // リスナーをリセット
  tabListeners.length = 0;
  tabRemovedListeners.length = 0;
  installedListeners.length = 0;
  messageListeners.length = 0;
  // sendMessage のモックを再注入
  global.chrome.tabs.sendMessage = jest.fn().mockResolvedValue();
  // モジュールキャッシュをクリア
  jest.resetModules();
  require("../src/background/background.js");
}

beforeEach(() => {
  loadBackgroundFresh();
});

describe("background.js", () => {
  test("起動時に onUpdated, onRemoved, onInstalled リスナーが登録される", () => {
    expect(tabListeners.length).toBe(1);
    expect(tabRemovedListeners.length).toBe(1);
    expect(installedListeners.length).toBe(1);
  });

  test("isYouTubeWatchUrl: youtube.com/watch を含む URL は true", function () {
    const handler = tabListeners[0];
    // ハンドラ内で sendMessage が呼ばれるかを spy で検証
    handler(
      1,
      { url: "https://www.youtube.com/watch?v=abc" },
      { url: "https://www.youtube.com/watch?v=abc" }
    );
    expect(global.chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      action: "ysTabUpdated",
      url: "https://www.youtube.com/watch?v=abc",
      title: ""
    });
  });

  test("isYouTubeWatchUrl: /shorts/ を含む URL も true", function () {
    const handler = tabListeners[0];
    handler(2, {}, { url: "https://www.youtube.com/shorts/xyz123" });
    expect(global.chrome.tabs.sendMessage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ url: "https://www.youtube.com/shorts/xyz123" })
    );
  });

  test("YouTube 以外の URL では sendMessage しない", function () {
    const handler = tabListeners[0];
    handler(3, {}, { url: "https://example.com/page" });
    expect(global.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  test("tab.url が undefined の場合は sendMessage しない", function () {
    const handler = tabListeners[0];
    handler(4, {}, { url: undefined });
    expect(global.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  test("同じ URL への重複通知は抑制される", function () {
    const handler = tabListeners[0];
    handler(5, {}, { url: "https://www.youtube.com/watch?v=abc" });
    handler(5, {}, { url: "https://www.youtube.com/watch?v=abc" });
    expect(global.chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("URL が変わった場合は再度通知される", function () {
    const handler = tabListeners[0];
    handler(6, {}, { url: "https://www.youtube.com/watch?v=video1" });
    handler(6, {}, { url: "https://www.youtube.com/watch?v=video2" });
    expect(global.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("content script 未ロード時の sendMessage 失敗は握りつぶされる", async function () {
    global.chrome.tabs.sendMessage = jest
      .fn()
      .mockRejectedValue(new Error("Could not establish connection"));
    const handler = tabListeners[0];
    handler(7, {}, { url: "https://www.youtube.com/watch?v=abc" });
    // 拒否された Promise を await しても例外にならないことを確認
    await expect(
      global.chrome.tabs.sendMessage.mock.results[0].value.catch(() => {})
    ).resolves.toBeUndefined();
  });

  test("onRemoved で state が削除される（次の更新で再通知）", function () {
    const handler = tabListeners[0];
    const removedHandler = tabRemovedListeners[0];

    // 1回目: 通知
    handler(8, {}, { url: "https://www.youtube.com/watch?v=video1" });
    // タブを閉じる
    removedHandler(8);
    // 同じ URL で再度開く → 通知される（state がクリアされたため）
    handler(8, {}, { url: "https://www.youtube.com/watch?v=video1" });
    expect(global.chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  // ===== Phase H #6: ysGetTabState ハンドラ (content script 起動時バッファ提供) =====
  test("起動時に onMessage リスナーが登録される", () => {
    expect(messageListeners.length).toBe(1);
  });

  test("ysGetTabState: 該当タブの状態を返す", () => {
    const updater = tabListeners[0];
    updater(10, {}, { url: "https://www.youtube.com/watch?v=stored" });
    const msgHandler = messageListeners[0];
    const sendResponse = jest.fn();
    const result = msgHandler({ action: "ysGetTabState" }, { tab: { id: 10 } }, sendResponse);
    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=stored",
      title: ""
    });
  });

  test("ysGetTabState: 状態がないタブは url: null を返す", () => {
    const msgHandler = messageListeners[0];
    const sendResponse = jest.fn();
    msgHandler({ action: "ysGetTabState" }, { tab: { id: 999 } }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ url: null, title: null });
  });

  test("ysGetTabState: sender.tab がない場合は url: null", () => {
    const msgHandler = messageListeners[0];
    const sendResponse = jest.fn();
    msgHandler({ action: "ysGetTabState" }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ url: null, title: null });
  });

  test("ysGetTabState 以外のメッセージは false を返す (handle しない)", () => {
    const msgHandler = messageListeners[0];
    const sendResponse = jest.fn();
    const result = msgHandler({ action: "otherAction" }, {}, sendResponse);
    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
