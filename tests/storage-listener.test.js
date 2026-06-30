// tests/storage-listener.test.js — chrome.storage.onChanged リスナー管理のテスト
const helpers = require("./__helpers__/index.cjs");

const { bindStorageListener, unbindStorageListener } = require("../src/content/ui/storage-listener");
const { uiState } = helpers;

describe("storage-listener", () => {
  let addCalls;
  let removeCalls;

  beforeEach(() => {
    helpers.resetStates();
    addCalls = [];
    removeCalls = [];
    helpers.installChromeMock({
      overrides: {
        storage: {
          onChanged: {
            addListener: jest.fn((fn) => addCalls.push(fn)),
            removeListener: jest.fn((fn) => removeCalls.push(fn))
          }
        }
      }
    });
  });

  afterEach(() => {
    unbindStorageListener();
    helpers.uninstallChromeMock();
  });

  describe("bindStorageListener", () => {
    test("初回呼び出しで addListener が呼ばれる", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      expect(addCalls.length).toBe(1);
      expect(uiState.storageOnChangedListener).toBeTruthy();
    });

    test("pagehide クリーンアップが初回のみ登録される", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      bindStorageListener(onUpdate);
      bindStorageListener(onUpdate);
      expect(uiState.storageOnChangedCleanupBound).toBe(true);
      // pagehide リスナーは window に追加済み（重複なし）
    });

    test("再呼び出し時は既存リスナーを removeListener で解放", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const firstListener = uiState.storageOnChangedListener;
      bindStorageListener(onUpdate);
      expect(removeCalls.length).toBe(1);
      expect(removeCalls[0]).toBe(firstListener);
      expect(addCalls.length).toBe(2);
      // 新しいリスナーが登録されている
      expect(uiState.storageOnChangedListener).not.toBe(firstListener);
    });

    test("chrome.storage.onChanged がない場合は warn ログのみで例外を投げない", () => {
      helpers.uninstallChromeMock();
      // storage.onChanged が undefined
      global.chrome = { runtime: { id: "x" } };
      helpers.resetStates();
      const onUpdate = jest.fn();
      expect(() => bindStorageListener(onUpdate)).not.toThrow();
      // 実装の現状: addListener 失敗時も S.storageOnChangedListener は設定済み
      // (cleanup 時に removeListener 失敗は吸収される)
      expect(typeof uiState.storageOnChangedListener).toBe("function");
      // addListener 失敗時は pagehide クリーンアップの登録もスキップされる
      expect(uiState.storageOnChangedCleanupBound).toBe(false);
    });

    test("btnTitle_ キーの変更で onUpdate が呼ばれる（デバウンス 150ms）", (done) => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      // addCalls に登録されたリスナーを直接呼び出す
      const listener = addCalls[0];
      listener({ btnTitle_summary: { newValue: "X" } });
      // デバウンス中なのでまだ呼ばれない
      expect(onUpdate).not.toHaveBeenCalled();
      setTimeout(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
        done();
      }, 200);
    });

    test("prompt_ キーの変更で onUpdate が呼ばれる", (done) => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const listener = addCalls[0];
      listener({ prompt_summary: { newValue: "X" } });
      setTimeout(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
        done();
      }, 200);
    });

    test("無関係なキー（例: theme）の変更では onUpdate は呼ばれない", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const listener = addCalls[0];
      listener({ theme: { newValue: "dark" } });
      expect(onUpdate).not.toHaveBeenCalled();
    });

    test("複数キー変更で1度だけデバウンスされる", (done) => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const listener = addCalls[0];
      listener({ btnTitle_summary: { newValue: "A" } });
      listener({ prompt_customA: { newValue: "B" } });
      listener({ btnTitle_customB: { newValue: "C" } });
      setTimeout(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
        done();
      }, 200);
    });

    test("btnTitle と prompt の混在でも1度だけ呼ばれる", (done) => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const listener = addCalls[0];
      listener({
        theme: { newValue: "dark" }, // 無関係
        btnTitle_summary: { newValue: "X" },
        prompt_summary: { newValue: "Y" }
      });
      setTimeout(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
        done();
      }, 200);
    });
  });

  describe("unbindStorageListener", () => {
    test("リスナーを解放し removeListener を呼ぶ", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const registered = uiState.storageOnChangedListener;
      unbindStorageListener();
      expect(removeCalls.length).toBe(1);
      expect(removeCalls[0]).toBe(registered);
      expect(uiState.storageOnChangedListener).toBe(null);
    });

    test("デバウンスタイマーもクリアされる", (done) => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      const listener = addCalls[0];
      listener({ btnTitle_summary: { newValue: "X" } });
      unbindStorageListener();
      // タイマー解除後は呼ばれない
      setTimeout(() => {
        expect(onUpdate).not.toHaveBeenCalled();
        done();
      }, 200);
    });

    test("未登録時に呼んでも例外を投げない", () => {
      expect(() => unbindStorageListener()).not.toThrow();
      expect(uiState.storageOnChangedListener).toBe(null);
    });

    test("二重呼び出しでも安全", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      unbindStorageListener();
      expect(() => unbindStorageListener()).not.toThrow();
    });
  });

  describe("removeListener 失敗時のフォールバック", () => {
    test("chrome.storage.onChanged.removeListener が throw しても unbindStorageListener はクラッシュしない", () => {
      const onUpdate = jest.fn();
      bindStorageListener(onUpdate);
      // removeListener が例外を投げるケースをシミュレート
      global.chrome.storage.onChanged.removeListener = jest.fn(() => {
        throw new Error("context invalidated");
      });
      expect(() => unbindStorageListener()).not.toThrow();
    });
  });
});