// ============================================================
//  abort-chain.js — AbortSignal/Controller のチェイニング
//  親が abort されたら子も abort される（または逆も可）。
//  動画切替時の「漏れなく全部止める」を保証する。
// ============================================================

/**
 * 親 AbortSignal に連動する子 AbortController を作成する
 * - 親が abort された時点で子も abort される
 * - 戻り値の controller.abort() を呼んでも親には伝播しない（単方向）
 * - disconnect() で連動を解除
 *
 * @param {AbortSignal} parentSignal - 親の AbortSignal
 * @returns {{ controller: AbortController, disconnect: () => void }}
 */
export function linkAbortSignal(parentSignal) {
  const controller = new AbortController();
  if (!parentSignal) {
    return { controller: controller, disconnect: function() {} };
  }
  const onAbort = function() { controller.abort("parent-aborted"); };
  if (parentSignal.aborted) {
    controller.abort("parent-already-aborted");
    return { controller: controller, disconnect: function() {} };
  }
  parentSignal.addEventListener("abort", onAbort, { once: true });
  return {
    controller: controller,
    disconnect: function() { parentSignal.removeEventListener("abort", onAbort); }
  };
}
