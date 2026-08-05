// tests/__helpers__/flush.js — 非同期フラッシュヘルパ
// Promise 解決を確実に待つためのユーティリティを集約。
// jsdom には setImmediate が無い + デバウンス付き setTimeout が絡む
// テストもあるため、Promise.resolve() ループが安定動作する。

const DEFAULT_FLUSH_LOOPS = 10;

/**
 * マイクロタスクキューを空になるまでフラッシュする。
 * 戻り値 Promise は `n` 回 await Promise.resolve() を繰り返した後 resolve する。
 * デバウンスやネスト Promise を含むテストでは、引数なし (=10 回) で十分。
 */
function flushPromises(n) {
  const loops = typeof n === "number" && n > 0 ? n : DEFAULT_FLUSH_LOOPS;
  let p = Promise.resolve();
  for (let i = 0; i < loops; i++) p = p.then(function () {});
  return p;
}

module.exports = { flushPromises };
