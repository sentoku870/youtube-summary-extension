// tests/__helpers__/chrome-mock.js — chrome.* API の共通モック
// テスト間で重複していた global.chrome 設定を共通化。

/**
 * 標準的な chrome ストレージモックを生成する。
 * - runtime.id (isExtensionContextValid() が true 判定)
 * - storage.local.get / set / remove (jest.fn で差し替え可能)
 * - storage.onChanged.addListener / removeListener
 *
 * @param {object} [opts]
 * @param {string} [opts.runtimeId="test-extension-id"]
 * @param {object} [opts.overrides] - 部分上書き（例: { storage: { local: { get: customMock } } }）
 * @returns {object} chrome モックオブジェクト
 */
function createChromeMock(opts) {
  const o = opts || {};
  const id = o.runtimeId != null ? o.runtimeId : "test-extension-id";
  const base = {
    runtime: {
      id: id,
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() }
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
      },
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() }
    }
  };
  // 部分上書きをマージ
  if (o.overrides) {
    if (o.overrides.runtime) Object.assign(base.runtime, o.overrides.runtime);
    if (o.overrides.storage) {
      if (o.overrides.storage.local) {
        Object.assign(base.storage.local, o.overrides.storage.local);
      }
      if (o.overrides.storage.onChanged) {
        Object.assign(base.storage.onChanged, o.overrides.storage.onChanged);
      }
    }
  }
  return base;
}

/**
 * global.chrome に標準モックを設定する。
 * テストファイル先頭で呼び出すこと。
 *
 * @param {object} [opts] - createChromeMock と同じ
 * @returns {object} 設定された chrome モック
 */
function installChromeMock(opts) {
  const mock = createChromeMock(opts);
  global.chrome = mock;
  return mock;
}

/**
 * テスト終了時に global.chrome をクリアする。
 * beforeEach / afterEach で使用。
 */
function uninstallChromeMock() {
  delete global.chrome;
}

module.exports = {
  createChromeMock,
  installChromeMock,
  uninstallChromeMock
};
