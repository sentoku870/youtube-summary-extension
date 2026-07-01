// tests/appearance.test.js — 表示設定（フォント/パネル高さ/テーマ）の DOM 反映
// Phase A-2: storage.js が re-export ハブになったため、spy は元モジュール (storage-config) に対して行う。
const storageConfig = require("../src/infrastructure/storage-config");
const { uiState: S } = require("../src/shared/state");

// storage-config.js の loadFontSize / loadPanelHeight / loadThemeSetting をモック
jest.spyOn(storageConfig, "loadFontSize").mockResolvedValue("14");
jest.spyOn(storageConfig, "loadPanelHeight").mockResolvedValue("900");
jest.spyOn(storageConfig, "loadThemeSetting").mockResolvedValue("auto");

const storage = storageConfig; // 後方互換 (テスト本体では storage.X 形式で参照)

// テスト対象（モック適用後に require）
const { applyFontSize, applyPanelHeight, applyTheme } = require("../src/content/ui/appearance");

describe("appearance", () => {
  beforeEach(() => {
    // 各テストで root / panel 要素を新規に作り直す
    document.body.innerHTML = "";
  });

  // ===== applyFontSize =====
  describe("applyFontSize", () => {
    test("loadFontSize の値（文字列）を px 付きで CSS 変数に反映", async () => {
      storage.loadFontSize.mockResolvedValueOnce("16");
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      document.body.appendChild(root);

      await applyFontSize();

      expect(root.style.getPropertyValue("--fs-base")).toBe("16px");
    });

    test("#yt-summary-root が無い場合は no-op", async () => {
      storage.loadFontSize.mockResolvedValueOnce("20");
      await expect(applyFontSize()).resolves.toBeUndefined();
    });
  });

  // ===== applyPanelHeight =====
  describe("applyPanelHeight", () => {
    test("loadPanelHeight の値（文字列）を px 付きで CSS 変数に反映", async () => {
      storage.loadPanelHeight.mockResolvedValueOnce("800");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      document.body.appendChild(panel);

      await applyPanelHeight();

      expect(panel.style.getPropertyValue("--ys-panel-max-height")).toBe("800px");
    });

    test("#ys-panel が無い場合は no-op", async () => {
      storage.loadPanelHeight.mockResolvedValueOnce("1000");
      await expect(applyPanelHeight()).resolves.toBeUndefined();
    });
  });

  // ===== applyTheme =====
  describe("applyTheme", () => {
    function makeRoot() {
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      document.body.appendChild(root);
      return root;
    }

    function setMatchMedia(matches) {
      Object.defineProperty(window, "matchMedia", {
        value: jest.fn().mockImplementation(function (query) {
          return {
            matches: matches,
            media: query,
            addListener: jest.fn(),
            removeListener: jest.fn()
          };
        }),
        configurable: true,
        writable: true
      });
    }

    afterEach(() => {
      // テスト後に matchMedia を元の挙動に戻す
      if (typeof window.matchMedia !== "function" || window.matchMedia._isMock) {
        Object.defineProperty(window, "matchMedia", {
          value: function (q) {
            return {
              matches: false,
              media: q,
              addListener: function () {},
              removeListener: function () {}
            };
          },
          configurable: true,
          writable: true
        });
      }
    });

    test("theme='dark' → data-theme='dark'", async () => {
      storage.loadThemeSetting.mockResolvedValueOnce("dark");
      const root = makeRoot();
      await applyTheme();
      expect(root.getAttribute("data-theme")).toBe("dark");
    });

    test("theme='light' → data-theme='light'", async () => {
      storage.loadThemeSetting.mockResolvedValueOnce("light");
      const root = makeRoot();
      await applyTheme();
      expect(root.getAttribute("data-theme")).toBe("light");
    });

    test("theme='auto' + prefers-color-scheme: dark → data-theme='dark'", async () => {
      setMatchMedia(true);
      storage.loadThemeSetting.mockResolvedValueOnce("auto");
      const root = makeRoot();
      await applyTheme();
      expect(root.getAttribute("data-theme")).toBe("dark");
    });

    test("theme='auto' + prefers-color-scheme: light → data-theme='light'", async () => {
      setMatchMedia(false);
      storage.loadThemeSetting.mockResolvedValueOnce("auto");
      const root = makeRoot();
      await applyTheme();
      expect(root.getAttribute("data-theme")).toBe("light");
    });

    test("theme='auto' で window.matchMedia が無い場合は light 扱い", async () => {
      const orig = window.matchMedia;
      Object.defineProperty(window, "matchMedia", {
        value: undefined,
        configurable: true,
        writable: true
      });
      storage.loadThemeSetting.mockResolvedValueOnce("auto");
      const root = makeRoot();
      await applyTheme();
      expect(root.getAttribute("data-theme")).toBe("light");
      Object.defineProperty(window, "matchMedia", {
        value: orig,
        configurable: true,
        writable: true
      });
    });

    test("#yt-summary-root が無い場合は no-op", async () => {
      storage.loadThemeSetting.mockResolvedValueOnce("dark");
      await expect(applyTheme()).resolves.toBeUndefined();
    });
  });

  // ===== T3-S1: uiState.panelEl を直接参照する（DOM 挿入前でも動く） =====
  describe("T3-S1: uiState.panelEl 直参照", () => {
    test("applyFontSize: DOM に無く uiState.panelEl にあればスタイル適用される", async () => {
      storage.loadFontSize.mockResolvedValueOnce("17");
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      // body には append しない（DOM 未挿入）
      S.panelEl = root;
      try {
        await applyFontSize();
        expect(root.style.getPropertyValue("--fs-base")).toBe("17px");
      } finally {
        S.panelEl = null;
      }
    });

    test("applyPanelHeight: uiState.panelEl 配下の #ys-panel を querySelector で探して適用", async () => {
      storage.loadPanelHeight.mockResolvedValueOnce("1234");
      const root = document.createElement("div");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      root.appendChild(panel);
      S.panelEl = root;
      try {
        await applyPanelHeight();
        expect(panel.style.getPropertyValue("--ys-panel-max-height")).toBe("1234px");
      } finally {
        S.panelEl = null;
      }
    });

    test("applyTheme: uiState.panelEl 直参照で data-theme が反映される", async () => {
      storage.loadThemeSetting.mockResolvedValueOnce("dark");
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      S.panelEl = root;
      try {
        await applyTheme();
        expect(root.getAttribute("data-theme")).toBe("dark");
      } finally {
        S.panelEl = null;
      }
    });

    test("uiState.panelEl も DOM にも無い場合は no-op（クラッシュしない）", async () => {
      storage.loadFontSize.mockResolvedValueOnce("20");
      S.panelEl = null;
      document.body.innerHTML = "";
      await expect(applyFontSize()).resolves.toBeUndefined();
    });
  });
});
