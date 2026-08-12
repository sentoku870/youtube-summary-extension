// tests/options-pagehide-flush.test.js — options.js の pagehide/beforeunload フラッシュ検証
// pagehide / beforeunload でデバウンス済み保存がコミットされることを確認。

jest.mock("../src/options/button-card.js", () => ({
  initButtonCards: jest.fn(),
  refreshButtonModelSelects: jest.fn(),
  flushAllSaves: jest.fn()
}));
jest.mock("../src/options/options-display.js", () => ({
  initDisplayTab: jest.fn(),
  setThemeActiveFromValue: jest.fn(),
  syncPresets: jest.fn(),
  flushDisplaySaves: jest.fn()
}));
jest.mock("../src/options/options-models.js", () => ({
  initModelsTab: jest.fn(),
  renderModelList: jest.fn()
}));
jest.mock("../src/options/model-form.js", () => ({
  initForm: jest.fn()
}));

const helpers = require("./__helpers__/index.cjs");
helpers.installChromeMock();

const buttonCard = require("../src/options/button-card");
const optionsDisplay = require("../src/options/options-display");

// options.js の DOMContentLoaded リスナーを即座に同期実行するため
// DOMContentLoaded を発火させる。
function fireDomContentLoaded() {
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

describe("options.js: pagehide / beforeunload で未コミット保存をフラッシュ", () => {
  beforeEach(() => {
    helpers.clearBody();
    buttonCard.flushAllSaves.mockClear();
    optionsDisplay.flushDisplaySaves.mockClear();
    // 各テストで options.js を再読込すると副作用が累積するため、
    // リスナー二重登録を避ける目的で window リスナーを数える。
  });

  test("pagehide で flushAllSaves と flushDisplaySaves が呼ばれる", async () => {
    require("../src/options/options.js");
    fireDomContentLoaded();
    await helpers.flushPromises();
    buttonCard.flushAllSaves.mockClear();
    optionsDisplay.flushDisplaySaves.mockClear();

    window.dispatchEvent(new Event("pagehide"));
    await helpers.flushPromises();
    await new Promise(function (r) {
      setTimeout(r, 0);
    });

    expect(buttonCard.flushAllSaves).toHaveBeenCalled();
    expect(optionsDisplay.flushDisplaySaves).toHaveBeenCalled();
  });

  test("beforeunload でも同様にフラッシュされる", async () => {
    require("../src/options/options.js");
    fireDomContentLoaded();
    await helpers.flushPromises();
    buttonCard.flushAllSaves.mockClear();
    optionsDisplay.flushDisplaySaves.mockClear();

    window.dispatchEvent(new Event("beforeunload"));
    await helpers.flushPromises();
    await new Promise(function (r) {
      setTimeout(r, 0);
    });

    expect(buttonCard.flushAllSaves).toHaveBeenCalled();
    expect(optionsDisplay.flushDisplaySaves).toHaveBeenCalled();
  });
});
