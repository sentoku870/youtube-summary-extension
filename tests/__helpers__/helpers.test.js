const helpers = require("./index.cjs");

describe("test helpers", () => {
  test("chrome mock install/uninstall", () => {
    helpers.installChromeMock();
    expect(global.chrome.runtime.id).toBe("test-extension-id");
    expect(typeof global.chrome.storage.local.get).toBe("function");
    helpers.uninstallChromeMock();
    expect(global.chrome).toBeUndefined();
  });

  test("state reset", () => {
    helpers.installChromeMock();
    helpers.resetStates();
    expect(helpers.sessionState.transcriptReady).toBe(false);
    expect(helpers.uiState.tabs).toEqual({});
    helpers.uninstallChromeMock();
  });

  test("setupYouTubeWatchDom", () => {
    const refs = helpers.setupYouTubeWatchDom();
    expect(refs.secondaryInner.id).toBe("secondary-inner");
    expect(document.querySelector("ytd-watch-flexy")).toBeTruthy();
  });

  test("mockNavigatorOnline", () => {
    const handle = helpers.mockNavigatorOnline(true);
    expect(navigator.onLine).toBe(true);
    expect(typeof handle.restore).toBe("function");
    handle.restore();
    // 復元後は navigator.onLine が再び真偽値として読める
    expect(typeof navigator.onLine).toBe("boolean");
  });

  test("chrome mock with overrides", () => {
    const customGet = jest.fn().mockResolvedValue({ custom: 1 });
    const mock = helpers.installChromeMock({
      overrides: { storage: { local: { get: customGet } } }
    });
    expect(mock.storage.local.get).toBe(customGet);
    helpers.uninstallChromeMock();
  });
});
