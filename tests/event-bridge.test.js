// tests/event-bridge.test.js — event-bus → UI 更新の橋渡し
// TRANSCRIPT_READY / TRANSCRIPT_FAILED / TRANSCRIPT_RETRY の各購読を検証。
const { uiState: S } = require("../src/shared/state");
const { emit } = require("../src/shared/event-bus");
const { EVENTS } = require("../src/shared/event-bus");

// panel.js / tabs.js / transcript.js をモック（重いチェーン回避）
jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn(),
  enableAllButtons: jest.fn()
}));
jest.mock("../src/content/ui/tabs.js", () => ({
  applyButtonTitles: jest.fn(),
  switchTab: jest.fn()
}));
jest.mock("../src/domain/transcript.js", () => ({
  retryTranscript: jest.fn()
}));

const { getEl, enableAllButtons } = require("../src/content/ui/panel");
const { applyButtonTitles, switchTab } = require("../src/content/ui/tabs");
const { retryTranscript } = require("../src/domain/transcript");

// event-bridge.js の import で on() が呼ばれる
require("../src/content/ui/event-bridge");

describe("event-bridge", () => {
  beforeEach(() => {
    // 注意: clearAll() は使わない。event-bridge.js は import 時に
    // on() でリスナーを登録する。それを消すと emit でハンドラが
    // 呼ばれず検証できない。
    // 代わりに jest.clearAllMocks() でモックの呼び出し履歴だけリセット。
    jest.clearAllMocks();
    S.panelEl = null;
  });

  // イベント購読はモジュールロード時に1度だけ登録される。
  // ここでは EVENTS の購読ハンドラが呼ばれているかを検証する。

  test("TRANSCRIPT_READY で applyButtonTitles が呼ばれる", () => {
    emit(EVENTS.TRANSCRIPT_READY, { transcript: { all: ["x"] } });
    expect(applyButtonTitles).toHaveBeenCalled();
  });

  test("TRANSCRIPT_FAILED: ボタンが存在する場合に UI 更新する", () => {
    const btn = document.createElement("button");
    btn.id = "ys-btn-summary";
    document.body.appendChild(btn);
    getEl.mockImplementation(function (sel) {
      if (sel === "#ys-btn-summary") return btn;
      return null;
    });

    emit(EVENTS.TRANSCRIPT_FAILED, { reason: "all-retries-exhausted" });

    expect(btn.textContent).toBe("⏳ 字幕取得失敗（再試行）");
    expect(btn.disabled).toBe(false);
    expect(typeof btn.onclick).toBe("function");

    // クリックで retryTranscript が呼ばれる
    btn.onclick();
    expect(retryTranscript).toHaveBeenCalled();

    // ★ 他ボタン（B/C）は字幕取得失敗中でも押せるようにする。
    //   別タブを押せば AI 実行側で transcript を再取得しにいく。
    expect(enableAllButtons).toHaveBeenCalled();

    document.body.removeChild(btn);
  });

  test("TRANSCRIPT_FAILED: #ys-btn-summary が無い場合はスキップ", () => {
    getEl.mockReturnValue(null);
    expect(() => emit(EVENTS.TRANSCRIPT_FAILED, {})).not.toThrow();
  });

  test("TRANSCRIPT_RETRY: 「字幕取得中...」表示・disabled・onclick 解除", () => {
    const btn = document.createElement("button");
    btn.id = "ys-btn-summary";
    btn.textContent = "古いテキスト";
    btn.disabled = false;
    btn.onclick = function () {};
    document.body.appendChild(btn);
    getEl.mockImplementation(function (sel) {
      if (sel === "#ys-btn-summary") return btn;
      return null;
    });

    emit(EVENTS.TRANSCRIPT_RETRY, {});

    expect(btn.textContent).toBe("⏳ 字幕取得中...");
    expect(btn.disabled).toBe(true);
    expect(btn.onclick).toBeNull();

    document.body.removeChild(btn);
  });

  test("TRANSCRIPT_RETRY: ボタンが無い場合はスキップ", () => {
    getEl.mockReturnValue(null);
    expect(() => emit(EVENTS.TRANSCRIPT_RETRY, {})).not.toThrow();
  });

  // ===== A-3: SUMMARY_RETRY_CLICKED =====
  describe("SUMMARY_RETRY_CLICKED", () => {
    test("activeTab があれば switchTab が呼ばれる", () => {
      S.activeTab = "summary";
      emit(EVENTS.SUMMARY_RETRY_CLICKED, { activeTab: "summary" });
      expect(switchTab).toHaveBeenCalledWith("summary");
    });

    test("activeTab が null や未定義なら switchTab は呼ばれない", () => {
      S.activeTab = null;
      emit(EVENTS.SUMMARY_RETRY_CLICKED, { activeTab: null });
      expect(switchTab).not.toHaveBeenCalled();
    });

    test("payload がない場合は switchTab は呼ばれない", () => {
      S.activeTab = "summary";
      emit(EVENTS.SUMMARY_RETRY_CLICKED);
      expect(switchTab).not.toHaveBeenCalled();
    });

    test("payload.activeTab が falsy な値でも安全", () => {
      S.activeTab = "summary";
      emit(EVENTS.SUMMARY_RETRY_CLICKED, { activeTab: "" });
      expect(switchTab).not.toHaveBeenCalled();
    });
  });
});
