// tests/panel-placement.test.js — panel.js のパネル配置ロジック
// 内部関数 (getWatchSecondary, waitForSecondary, ensureVisibleAndWatch,
// relocateWhenReady, placePanel) は export されていないため、
// createPanel() を介してその挙動を観測する。
//
// 注意: placePanel は waitForSecondary (100ms ポーリング) を使うため非同期。
//       runAllTimersAsync() でタイマとマイクロタスクを両方フラッシュする。

// appearance.js をモック（副作用回避）
jest.mock("../src/content/ui/appearance.js", () => ({
  applyTheme: jest.fn().mockResolvedValue(undefined),
  applyFontSize: jest.fn().mockResolvedValue(undefined),
  applyPanelHeight: jest.fn().mockResolvedValue(undefined)
}));

const { state: S } = require("../src/shared/state");
const { createPanel, getEl } = require("../src/content/ui/panel");

// テスト用：document.body の YouTube レイアウトを構築
function buildYouTubeWatchPage(opts) {
  opts = opts || {};
  document.body.innerHTML = "";

  const watch = document.createElement("ytd-watch-flexy");
  document.body.appendChild(watch);

  if (opts.related !== false) {
    const related = document.createElement("div");
    related.id = "related";
    watch.appendChild(related);
  }
  if (opts.secondaryInner) {
    const inner = document.createElement("div");
    inner.id = "secondary-inner";
    if (opts.related !== false) {
      const r = document.createElement("div");
      r.id = "related";
      inner.appendChild(r);
    }
    watch.appendChild(inner);
  }
  if (opts.secondary) {
    const sec = document.createElement("div");
    sec.id = "secondary";
    watch.appendChild(sec);
  }
  return watch;
}

describe("panel.js パネル配置 (placement)", () => {
  beforeEach(() => {
    S.panelEl = null;
    S.tabIds = ["summary", "customA", "customB"];
    S.tabs = {};
    document.body.innerHTML = "";
  });

  describe("getWatchSecondary（優先順位）", () => {
    test("1: ytd-watch-flexy #secondary-inner が最優先", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true, secondary: true, related: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const inner = document.querySelector("ytd-watch-flexy #secondary-inner");
      expect(S.panelEl.parentNode).toBe(inner);
    });

    test("secondary-inner 不在時は #secondary へフォールバック", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: false, secondary: true, related: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const sec = document.querySelector("ytd-watch-flexy #secondary");
      expect(S.panelEl.parentNode).toBe(sec);
    });

    test("ytd-watch-flexy 外の #secondary だけだと body の #secondary へ", async () => {
      jest.useFakeTimers();
      document.body.innerHTML = "";
      const sec = document.createElement("div");
      sec.id = "secondary";
      document.body.appendChild(sec);

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      // ytd-watch-flexy #secondary はマッチしないが、
      // 4番目のフォールバック「#secondary」は body 直下でもマッチする
      expect(S.panelEl.parentNode).toBe(sec);
    });

    test("#related のみのページに挿入", async () => {
      jest.useFakeTimers();
      document.body.innerHTML = "";
      const related = document.createElement("div");
      related.id = "related";
      document.body.appendChild(related);

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      // #secondary は無し、#related には挿入可
      expect(S.panelEl.parentNode).toBe(related);
    });

    test("何も無いページでは body フォールバック", async () => {
      jest.useFakeTimers();
      document.body.innerHTML = "";

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      expect(S.panelEl.parentNode).toBe(document.body);
    });
  });

  describe("waitForSecondary（タイミング）", () => {
    test("即座に #secondary-inner が見つかれば即 resolve", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true, related: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const inner = document.querySelector("#secondary-inner");
      expect(S.panelEl.parentNode).toBe(inner);
    });

    test("maxWaitMs タイムアウト後は best-effort で #related にフォールバック", async () => {
      jest.useFakeTimers();
      // #secondary は無し、#related だけある状態
      document.body.innerHTML = "";
      const related = document.createElement("div");
      related.id = "related";
      document.body.appendChild(related);

      createPanel();
      await jest.advanceTimersByTimeAsync(6000);
      jest.useRealTimers();

      expect(S.panelEl.parentNode).toBe(related);
    });
  });

  describe("placePanel（挿入位置）", () => {
    test("secondary-inner 内の #related の手前に挿入", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true, related: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const panel = S.panelEl;
      const inner = document.querySelector("#secondary-inner");
      // secondary-inner 内の #related（"watch の子"ではない方）を取得
      const relatedInInner = document.querySelector("#secondary-inner > #related");
      expect(panel.parentNode).toBe(inner);
      expect(panel.nextSibling).toBe(relatedInInner);
    });

    test("関連動画 (#related) が無い場合はそのまま append", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true, related: false });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const panel = S.panelEl;
      const inner = document.querySelector("#secondary-inner");
      expect(panel.parentNode).toBe(inner);
    });

    test("既に配置済の場合は再挿入しない（nextSibling 一致で no-op）", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true, related: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      // 2 度目の createPanel は同じ要素を返す
      const before = S.panelEl;
      const beforeParent = before.parentNode;
      const beforeNext = before.nextSibling;
      const p2 = createPanel();
      expect(p2).toBe(before);
      expect(before.parentNode).toBe(beforeParent);
      expect(before.nextSibling).toBe(beforeNext);
    });
  });

  describe("ensureVisibleAndWatch（YouTube の .hidden 自動除去）", () => {
    test("panel に __ysHiddenObs (MutationObserver) が付与される", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      expect(S.panelEl.__ysHiddenObs).toBeInstanceOf(MutationObserver);
    });

    test("createPanel 後の panel には .hidden / hidden 属性は無い", async () => {
      jest.useFakeTimers();
      buildYouTubeWatchPage({ secondaryInner: true });

      createPanel();
      await jest.runAllTimersAsync();
      jest.useRealTimers();

      const panel = S.panelEl;
      expect(panel.classList.contains("hidden")).toBe(false);
      expect(panel.hasAttribute("hidden")).toBe(false);
    });
  });
});
