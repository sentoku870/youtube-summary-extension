// tests/options-display.test.js — 表示設定タブ（options-display.js）のテスト

jest.mock("../src/options/ui/toast.js", () => ({
  saveToast: jest.fn()
}));

const mockStorage = {
  setCalls: []
};

jest.mock("../src/infrastructure/storage.js", () => {
  const actual = jest.requireActual("../src/infrastructure/storage.js");
  return {
    ...actual,
    K: actual.K,
    set: jest.fn((obj) => {
      mockStorage.setCalls.push(obj);
      return Promise.resolve();
    })
  };
});

let initDisplayTab, flushDisplaySaves, setThemeActiveFromValue, syncPresets;

function buildOptionsDom() {
  document.body.innerHTML = "";
  const theme = document.createElement("select");
  theme.id = "theme";
  for (const v of ["auto", "light", "dark"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    theme.appendChild(opt);
  }
  document.body.appendChild(theme);
  const themeCards = document.createElement("div");
  themeCards.id = "themeCards";
  document.body.appendChild(themeCards);
  const fontSize = document.createElement("input");
  fontSize.id = "fontSize";
  fontSize.type = "number";
  document.body.appendChild(fontSize);
  const fontSizePresets = document.createElement("div");
  fontSizePresets.id = "fontSizePresets";
  document.body.appendChild(fontSizePresets);
  const panelHeight = document.createElement("input");
  panelHeight.id = "panelHeight";
  panelHeight.type = "number";
  document.body.appendChild(panelHeight);
  const panelHeightPresets = document.createElement("div");
  panelHeightPresets.id = "panelHeightPresets";
  document.body.appendChild(panelHeightPresets);
  const subtitleLang = document.createElement("select");
  subtitleLang.id = "subtitleLang";
  for (const v of ["auto", "en", "ja"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    subtitleLang.appendChild(opt);
  }
  document.body.appendChild(subtitleLang);
  const status = document.createElement("div");
  status.id = "displayAutoSaveStatus";
  document.body.appendChild(status);
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockStorage.setCalls = [];
  buildOptionsDom();
  const od = require("../src/options/options-display.js");
  initDisplayTab = od.initDisplayTab;
  flushDisplaySaves = od.flushDisplaySaves;
  setThemeActiveFromValue = od.setThemeActiveFromValue;
  syncPresets = od.syncPresets;
});

describe("options-display", () => {
  describe("initDisplayTab", () => {
    test("テーマカードが 3 つ（auto / light / dark）作られる", () => {
      initDisplayTab();
      const cards = document.querySelectorAll(".theme-card");
      expect(cards.length).toBe(3);
      expect(document.querySelector('.theme-card[data-theme="auto"]')).not.toBeNull();
      expect(document.querySelector('.theme-card[data-theme="light"]')).not.toBeNull();
      expect(document.querySelector('.theme-card[data-theme="dark"]')).not.toBeNull();
    });

    test("フォントサイズプリセットチップが 8 個（13-20px）作られる", () => {
      initDisplayTab();
      const chips = document.querySelectorAll("#fontSizePresets .preset-chip");
      expect(chips.length).toBe(8);
      expect(chips[0].getAttribute("data-value")).toBe("13");
      expect(chips[7].getAttribute("data-value")).toBe("20");
    });

    test("パネル高さプリセットチップが 3 個（1050/1100/1150）作られる", () => {
      initDisplayTab();
      const chips = document.querySelectorAll("#panelHeightPresets .preset-chip");
      expect(chips.length).toBe(3);
      expect(chips[0].getAttribute("data-value")).toBe("1050");
      expect(chips[1].getAttribute("data-value")).toBe("1100");
      expect(chips[2].getAttribute("data-value")).toBe("1150");
    });

    test("テーマカードに role=radio と tabindex=0 が付与", () => {
      initDisplayTab();
      const cards = document.querySelectorAll(".theme-card");
      cards.forEach((c) => {
        expect(c.getAttribute("role")).toBe("radio");
        expect(c.getAttribute("tabindex")).toBe("0");
        expect(c.getAttribute("aria-checked")).toBe("false");
      });
    });
  });

  describe("setThemeActiveFromValue", () => {
    test("指定値に一致するカードに .active と aria-checked=true を付与", () => {
      initDisplayTab();
      setThemeActiveFromValue("dark");
      const dark = document.querySelector('.theme-card[data-theme="dark"]');
      const light = document.querySelector('.theme-card[data-theme="light"]');
      expect(dark.classList.contains("active")).toBe(true);
      expect(dark.getAttribute("aria-checked")).toBe("true");
      expect(light.classList.contains("active")).toBe(false);
    });
  });

  describe("syncPresets", () => {
    test("フォントサイズ値に一致するチップに .active", () => {
      initDisplayTab();
      syncPresets("15", null);
      const chip = document.querySelector('#fontSizePresets .preset-chip[data-value="15"]');
      expect(chip.classList.contains("active")).toBe(true);
      const other = document.querySelector('#fontSizePresets .preset-chip[data-value="13"]');
      expect(other.classList.contains("active")).toBe(false);
    });

    test("パネル高さに一致するチップに .active", () => {
      initDisplayTab();
      syncPresets(null, "1150");
      const chip = document.querySelector('#panelHeightPresets .preset-chip[data-value="1150"]');
      expect(chip.classList.contains("active")).toBe(true);
    });
  });

  describe("テーマカードのクリックで selectTheme 経由の自動保存", () => {
    test("dark カード click → theme select の値と .active 反映 + デバウンス保存", async () => {
      jest.useFakeTimers();
      initDisplayTab();
      const card = document.querySelector('.theme-card[data-theme="dark"]');
      card.click();
      expect(document.getElementById("theme").value).toBe("dark");
      expect(card.classList.contains("active")).toBe(true);
      // 300ms デバウンス後に commitSave → set 呼ばれる
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
      const lastCall = mockStorage.setCalls[mockStorage.setCalls.length - 1];
      expect(lastCall.theme).toBe("dark");
      jest.useRealTimers();
    });

    test("light カード click → light が active になり他は解除", () => {
      initDisplayTab();
      // 先に dark を active にする
      setThemeActiveFromValue("dark");
      // light を click
      document.querySelector('.theme-card[data-theme="light"]').click();
      expect(document.querySelector('.theme-card[data-theme="light"]').classList.contains("active")).toBe(true);
      expect(document.querySelector('.theme-card[data-theme="dark"]').classList.contains("active")).toBe(false);
    });

    test("カードに Enter キー押下でも選択される", () => {
      initDisplayTab();
      const card = document.querySelector('.theme-card[data-theme="auto"]');
      card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(document.getElementById("theme").value).toBe("auto");
    });

    test("カードに Space キー押下でも選択される", () => {
      initDisplayTab();
      const card = document.querySelector('.theme-card[data-theme="light"]');
      card.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      expect(document.getElementById("theme").value).toBe("light");
    });
  });

  describe("プリセットチップ click", () => {
    test("フォントサイズ 15px チップ click → input に 15 が入り active", () => {
      initDisplayTab();
      const chip = document.querySelector('#fontSizePresets .preset-chip[data-value="15"]');
      chip.click();
      expect(document.getElementById("fontSize").value).toBe("15");
      expect(chip.classList.contains("active")).toBe(true);
    });

    test("パネル高さ 1150 チップ click → input に 1150 が入る", () => {
      initDisplayTab();
      const chip = document.querySelector('#panelHeightPresets .preset-chip[data-value="1150"]');
      chip.click();
      expect(document.getElementById("panelHeight").value).toBe("1150");
    });
  });

  describe("直接 input 入力", () => {
    test("fontSize 入力 → syncPresetActiveState 経由で active 再評価", () => {
      initDisplayTab();
      const input = document.getElementById("fontSize");
      input.value = "18";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const chip = document.querySelector('#fontSizePresets .preset-chip[data-value="18"]');
      expect(chip.classList.contains("active")).toBe(true);
    });

    test("fontSize 入力で 300ms 後に chrome.storage.set 呼ばれる", async () => {
      jest.useFakeTimers();
      initDisplayTab();
      const input = document.getElementById("fontSize");
      input.value = "16";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
      const lastCall = mockStorage.setCalls[mockStorage.setCalls.length - 1];
      expect(lastCall.fontSize).toBe("16");
      jest.useRealTimers();
    });
  });

  describe("flushDisplaySaves", () => {
    test("デバウンス中の保存を即時コミット", async () => {
      jest.useFakeTimers();
      initDisplayTab();
      const input = document.getElementById("fontSize");
      input.value = "17";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // タイマー未進行
      jest.advanceTimersByTime(100);
      await flushDisplaySaves();
      await flushMicrotasks();
      const lastCall = mockStorage.setCalls[mockStorage.setCalls.length - 1];
      expect(lastCall.fontSize).toBe("17");
      jest.useRealTimers();
    });
  });

  describe("保存成功インジケータ", () => {
    test("保存後に ✓ 自動保存しました 表示", async () => {
      jest.useFakeTimers();
      initDisplayTab();
      const input = document.getElementById("fontSize");
      input.value = "14";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
      const status = document.getElementById("displayAutoSaveStatus");
      expect(status.classList.contains("saved")).toBe(true);
      expect(status.textContent).toContain("自動保存しました");
      jest.useRealTimers();
    });
  });

  describe("字幕言語 change で保存", () => {
    test("subtitleLang change → デバウンス後に set される", async () => {
      jest.useFakeTimers();
      initDisplayTab();
      const sel = document.getElementById("subtitleLang");
      sel.value = "en";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(350);
      await flushMicrotasks();
      const lastCall = mockStorage.setCalls[mockStorage.setCalls.length - 1];
      expect(lastCall.subtitleLang).toBe("en");
      jest.useRealTimers();
    });
  });
});
