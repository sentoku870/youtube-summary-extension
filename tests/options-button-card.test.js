// tests/options-button-card.test.js — ボタンカード自動保存（button-card.js）のテスト

jest.mock("../src/options/ui/toast.js", () => ({
  saveToast: jest.fn()
}));

const mockStorage = {
  configs: [],
  setCalls: []
};

jest.mock("../src/infrastructure/storage.js", () => {
  const actual = jest.requireActual("../src/infrastructure/storage.js");
  return {
    ...actual,
    K: actual.K,
    get: jest.fn((key) => {
      if (key === "apiConfigs") return Promise.resolve(mockStorage.configs);
      if (typeof key === "string" && key.indexOf("btnTitle_") === 0) {
        return Promise.resolve(undefined);
      }
      if (typeof key === "string" && key.indexOf("btnApiConfig_") === 0) {
        return Promise.resolve(undefined);
      }
      if (typeof key === "string" && key.indexOf("prompt_") === 0) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    }),
    set: jest.fn((obj) => {
      mockStorage.setCalls.push(obj);
      return Promise.resolve();
    }),
    getDefaultPrompt: jest.fn((type) => "default-prompt-" + type),
    loadButtonTitle: jest.fn().mockResolvedValue(null),
    loadBtnApiConfigId: jest.fn().mockResolvedValue(null)
  };
});

let initButtonCards, refreshButtonModelSelects, flushAllSaves;
let set;

function buildOptionsDom() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.id = "buttonCards";
  document.body.appendChild(container);
  const indicator = document.createElement("div");
  indicator.id = "buttonsAutoSaveStatus";
  document.body.appendChild(indicator);
}

function fireInput(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// ネストされた Promise チェーンを flush するヘルパ
async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockStorage.configs = [];
  mockStorage.setCalls = [];
  buildOptionsDom();
  const bc = require("../src/options/button-card.js");
  initButtonCards = bc.initButtonCards;
  refreshButtonModelSelects = bc.refreshButtonModelSelects;
  flushAllSaves = bc.flushAllSaves;
  set = require("../src/infrastructure/storage.js").set;
});

describe("button-card", () => {
  describe("initButtonCards", () => {
    test("3 カード（summary / customA / customB）が描画される", async () => {
      initButtonCards();
      const cards = document.querySelectorAll(".button-card");
      expect(cards.length).toBe(3);
      expect(document.querySelector('.button-card-summary')).not.toBeNull();
      expect(document.querySelector('.button-card-customA')).not.toBeNull();
      expect(document.querySelector('.button-card-customB')).not.toBeNull();
    });

    test("title / prompt / model の入力要素が各カードに存在", () => {
      initButtonCards();
      expect(document.getElementById("btnTitle_summary")).not.toBeNull();
      expect(document.getElementById("prompt_summary")).not.toBeNull();
      expect(document.getElementById("btnApiConfig_summary")).not.toBeNull();
      expect(document.getElementById("btnTitle_customA")).not.toBeNull();
      expect(document.getElementById("prompt_customA")).not.toBeNull();
      expect(document.getElementById("btnApiConfig_customA")).not.toBeNull();
    });

    test("モデル未選択カードには警告メッセージが表示される", async () => {
      initButtonCards();
      // refreshButtonModelSelects は loadInitialValues の then で呼ばれる
      await refreshButtonModelSelects();
      const warn = document.getElementById("btnWarn_summary");
      expect(warn.style.display).toBe("block");
      expect(warn.textContent).toContain("モデル未選択");
    });
  });

  describe("refreshButtonModelSelects", () => {
    test("configs から各 <select> に option が追加される", async () => {
      mockStorage.configs = [
        { id: "cfg_1", label: "A-Model", apiModel: "a-1" },
        { id: "cfg_2", label: "B-Model", apiModel: "b-1" }
      ];
      initButtonCards();
      await refreshButtonModelSelects();
      const sel = document.getElementById("btnApiConfig_summary");
      // empty + 2 models = 3 options
      expect(sel.options.length).toBe(3);
      expect(sel.options[1].value).toBe("cfg_1");
      expect(sel.options[1].textContent).toContain("A-Model");
      expect(sel.options[1].textContent).toContain("a-1");
      expect(sel.options[2].value).toBe("cfg_2");
      expect(sel.options[2].textContent).toContain("B-Model");
    });

    test("モデル選択後のコミット時に btnApiConfig_* キーが保存され、payload に選択 id が入る", async () => {
      jest.useFakeTimers();
      mockStorage.configs = [{ id: "cfg_1", label: "M", apiModel: "m" }];
      initButtonCards();
      await refreshButtonModelSelects();
      const sel = document.getElementById("btnApiConfig_summary");
      sel.value = "cfg_1";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
      // set の payload に cfg_1 が入っていることを確認（commitSave まで走った証拠）
      const lastCall = set.mock.calls[set.mock.calls.length - 1][0];
      expect(lastCall.btnApiConfig_summary).toBe("cfg_1");
      jest.useRealTimers();
    });
  });

  describe("デバウンス自動保存", () => {
    test("title 入力で 300ms 後に chrome.storage.set が呼ばれる", async () => {
      jest.useFakeTimers();
      initButtonCards();
      const input = document.getElementById("btnTitle_summary");
      input.value = "MyTitle";
      fireInput(input);
      // 300ms 経過前は保存されない
      expect(set).not.toHaveBeenCalled();
      jest.advanceTimersByTime(350);
      // microtask 消化
      await Promise.resolve();
      await Promise.resolve();
      expect(set).toHaveBeenCalled();
      const lastCall = set.mock.calls[set.mock.calls.length - 1][0];
      expect(lastCall.btnTitle_summary).toBe("MyTitle");
      jest.useRealTimers();
    });

    test("連続入力で 1 回だけ保存（デバウンス）", async () => {
      jest.useFakeTimers();
      initButtonCards();
      const input = document.getElementById("btnTitle_customA");
      input.value = "v1";
      fireInput(input);
      jest.advanceTimersByTime(100);
      input.value = "v2";
      fireInput(input);
      jest.advanceTimersByTime(100);
      input.value = "v3";
      fireInput(input);
      jest.advanceTimersByTime(350);
      await Promise.resolve();
      await Promise.resolve();
      // 3 回入力したが set の呼び出しは debounce 後に 1 回
      const titleCalls = set.mock.calls.filter((c) =>
        Object.prototype.hasOwnProperty.call(c[0], "btnTitle_customA")
      );
      expect(titleCalls.length).toBe(1);
      expect(titleCalls[0][0].btnTitle_customA).toBe("v3");
      jest.useRealTimers();
    });

    test("prompt 変更で prompt_* キーが保存される", async () => {
      jest.useFakeTimers();
      initButtonCards();
      const ta = document.getElementById("prompt_customB");
      ta.value = "my prompt";
      fireInput(ta);
      jest.advanceTimersByTime(350);
      await Promise.resolve();
      await Promise.resolve();
      const lastCall = set.mock.calls[set.mock.calls.length - 1][0];
      expect(lastCall.prompt_customB).toBe("my prompt");
      jest.useRealTimers();
    });

    test("model 変更で btnApiConfig_* キーが保存される", async () => {
      jest.useFakeTimers();
      mockStorage.configs = [{ id: "cfg_99", label: "X", apiModel: "x" }];
      initButtonCards();
      await refreshButtonModelSelects();
      const sel = document.getElementById("btnApiConfig_summary");
      sel.value = "cfg_99";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(350);
      await Promise.resolve();
      await Promise.resolve();
      const lastCall = set.mock.calls[set.mock.calls.length - 1][0];
      expect(lastCall.btnApiConfig_summary).toBe("cfg_99");
      jest.useRealTimers();
    });
  });

  describe("flushAllSaves", () => {
    test("デバウンス中の保存を即時コミット", async () => {
      jest.useFakeTimers();
      initButtonCards();
      const input = document.getElementById("btnTitle_summary");
      input.value = "FlushTitle";
      fireInput(input);
      // タイマーは進めるが flush で先に処理
      jest.advanceTimersByTime(100);
      await flushAllSaves();
      await Promise.resolve();
      const lastCall = set.mock.calls[set.mock.calls.length - 1][0];
      expect(lastCall.btnTitle_summary).toBe("FlushTitle");
      jest.useRealTimers();
    });
  });

  describe("保存成功時のインジケータ", () => {
    test("保存成功で ✓ 自動保存しました 表示", async () => {
      jest.useFakeTimers();
      initButtonCards();
      const input = document.getElementById("btnTitle_summary");
      input.value = "OK";
      fireInput(input);
      jest.advanceTimersByTime(350);
      await Promise.resolve();
      await Promise.resolve();
      const indicator = document.getElementById("buttonsAutoSaveStatus");
      expect(indicator.classList.contains("saved")).toBe(true);
      expect(indicator.textContent).toContain("自動保存しました");
      jest.useRealTimers();
    });
  });

  describe("bindButtonCardHandlers / onModelSelectsChange", () => {
    test("refreshButtonModelSelects 後にコールバックが呼ばれる", async () => {
      const cb = jest.fn();
      const bc = require("../src/options/button-card.js");
      bc.bindButtonCardHandlers({ onModelSelectsChange: cb });
      initButtonCards();
      await refreshButtonModelSelects();
      expect(cb).toHaveBeenCalled();
    });

    test("bindButtonCardHandlers: handlers が null の場合は noop", () => {
      const bc = require("../src/options/button-card.js");
      expect(() => bc.bindButtonCardHandlers(null)).not.toThrow();
    });

    test("bindButtonCardHandlers: onModelSelectsChange が関数でない場合は無視", () => {
      const bc = require("../src/options/button-card.js");
      expect(() => bc.bindButtonCardHandlers({ onModelSelectsChange: "not-a-function" })).not.toThrow();
    });
  });

  describe("refreshButtonModelSelects エッジケース", () => {
    test("sel が存在しない場合はスキップ", async () => {
      initButtonCards();
      // #btnApiConfig_summary などを意図的に削除
      document.getElementById("btnApiConfig_summary")?.remove();
      document.getElementById("btnApiConfig_customA")?.remove();
      document.getElementById("btnApiConfig_customB")?.remove();
      // エラーなく実行される
      await expect(refreshButtonModelSelects()).resolves.toBeUndefined();
    });

    test("現在の選択値が存在しない option の場合は変更しない", async () => {
      // K.API_CONFIGS が空でも、空 option があるため動作する
      initButtonCards();
      // currentVal がない場合（= ""）は変更しない分岐
      const sel = document.getElementById("btnApiConfig_summary");
      sel.value = "";
      await refreshButtonModelSelects();
      expect(sel.value).toBe("");
    });
  });

  describe("flushAllSaves", () => {
    test("保留中のタイマーを即時コミット", async () => {
      initButtonCards();
      const promptEl = document.getElementById("prompt_summary");
      promptEl.value = "new value";
      // タイマーを設定
      promptEl.dispatchEvent(new Event("input"));
      // 即時コミット
      const bc = require("../src/options/button-card.js");
      await expect(bc.flushAllSaves()).resolves.toBeUndefined();
    });

    test("タイマー未設定時の flushAllSaves は noop", async () => {
      initButtonCards();
      const bc = require("../src/options/button-card.js");
      // タイマーを設定しないで flush
      await expect(bc.flushAllSaves()).resolves.toBeUndefined();
    });
  });

  describe("refreshButtonModelSelects: 現在の選択値の保持", () => {
    test("currentVal が空文字（未選択）の場合は select 値を保持", async () => {
      mockStorage.configs = [
        { id: "cfg1", label: "A", apiKey: "k", apiUrl: "https://a.com", apiModel: "m" }
      ];
      initButtonCards();
      const sel = document.getElementById("btnApiConfig_summary");
      sel.value = "";
      await refreshButtonModelSelects();
      // 空文字のまま
      expect(sel.value).toBe("");
    });
  });
});
