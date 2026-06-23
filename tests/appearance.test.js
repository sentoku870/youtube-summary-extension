// tests/appearance.test.js — 表示設定（フォント/パネル高さ/テーマ）の DOM 反映
const storage = require("../src/infrastructure/storage");

// storage.js の loadFontSize / loadPanelHeight / loadThemeSetting をモック
jest.spyOn(storage, "loadFontSize").mockResolvedValue("14");
jest.spyOn(storage, "loadPanelHeight").mockResolvedValue("900");
jest.spyOn(storage, "loadThemeSetting").mockResolvedValue("auto");

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
});
