// tests/jest.setup.cjs — Jest 実行時に必ず適用されるグローバルセットアップ
// src/ 内のガード（if (!globalThis.__DEV__) return;）をテスト側で有効化する。
// Vite では NODE_ENV=production のとき globalThis.__DEV__ が false に置換される。
// また content/index.js の自動初期化副作用（waitForYtdApp）を抑制して、
// テストがモジュール副作用に左右されないようにする。
globalThis.__DEV__ = true;
globalThis.__TEST_NO_AUTO_INIT__ = true;
