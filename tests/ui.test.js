// tests/ui.test.js — src/content/ui/ui.js (re-export ハブ) の薄い検証
//
// ui.js は ui-progress / ui-summary / ui-buttons / ui-chat の
// re-export のみで実装を持たない。各関数の単体テストは
// tests/ui-modules.test.js に集約。
//
// ここでは re-export が壊れていないこと + XSS 対策が
// ハブ経由でも機能することのみを検証する。

const ui = require("../src/content/ui/ui");

describe("ui (re-export ハブ)", () => {
  test("ui-progress / ui-summary / ui-buttons / ui-chat から必要なシンボルが再 export されている", () => {
    const expected = [
      // ui-progress
      "showProgress",
      "hideProgress",
      "showError",
      "hideError",
      // ui-summary
      "setSummaryContent",
      "clearSummaryContent",
      "setSummaryRaw",
      "updateInfoLabel",
      "showChatArea",
      "hideChatArea",
      // ui-buttons
      "showRegenButton",
      "hideRegenButton",
      "enableRegenButton",
      "disableRegenButton",
      "showCopyButton",
      "hideCopyButton",
      // ui-chat
      "appendChatMessage",
      "appendAssistantPlaceholder",
      "updateChatMessageBody",
      "scrollContentToElement",
      "focusChatInput",
      "clearChatHistory"
    ];

    for (const name of expected) {
      expect(typeof ui[name]).toBe("function");
    }
  });

  test("XSS 対策: ui.js 経由の setSummaryRaw も textContent ベースで安全", () => {
    jest.resetModules();
    jest.doMock("../src/content/ui/panel.js", () => ({
      getEl: jest.fn(() => document.createElement("div"))
    }));
    jest.doMock("../src/domain/markdown.js", () => ({
      setMarkdown: jest.fn()
    }));
    jest.doMock("../src/domain/ai-utils.js", () => ({
      linkTimestamps: jest.fn()
    }));

    const { setSummaryRaw } = require("../src/content/ui/ui");
    const summaryEl = document.createElement("div");
    const { getEl } = require("../src/content/ui/panel");
    getEl.mockReturnValue(summaryEl);

    const evil = "<img src=x onerror=alert(1)><script>alert(1)</script>";
    setSummaryRaw(evil);

    expect(summaryEl.textContent).toBe(evil);
    expect(summaryEl.querySelector("img")).toBeNull();
    expect(summaryEl.querySelector("script")).toBeNull();

    jest.dontMock("../src/content/ui/panel.js");
    jest.dontMock("../src/domain/markdown.js");
    jest.dontMock("../src/domain/ai-utils.js");
  });
});
