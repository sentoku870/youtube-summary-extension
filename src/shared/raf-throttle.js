// ============================================================
//  raf-throttle.js — requestAnimationFrame ベースのスロットル
//  連続呼び出しの間隔が intervalMs 未満なら次フレームにまとめて実行。
//  ストリーミング描画など、毎フレーム呼ぶと DOM 再描画が重い処理向け。
// ============================================================

/**
 * RAF + 時間ベースのスロットル関数を生成する
 * @param {Function} fn - 実行する関数（最後に渡された引数で呼ばれる）
 * @param {number} [intervalMs=60] - 最低実行間隔（ミリ秒）
 * @returns {Function & { flush: Function }} スロットル済み関数。flush() で保留を破棄して即時1回実行
 */
export function createRafThrottle(fn, intervalMs) {
  const minInterval = typeof intervalMs === "number" ? intervalMs : 60;
  let lastRunAt = 0;
  let scheduledHandle = 0;
  let pendingArg = undefined;

  function runNow() {
    scheduledHandle = 0;
    lastRunAt = Date.now();
    fn(pendingArg);
  }

  function throttled(arg) {
    pendingArg = arg;
    const now = Date.now();
    if (now - lastRunAt >= minInterval) {
      runNow();
    } else if (!scheduledHandle) {
      scheduledHandle = requestAnimationFrame(runNow);
    }
  }

  // 保留中のフレームを破棄し、即時に1回だけ実行する
  throttled.flush = function flush(arg) {
    if (typeof arg !== "undefined") pendingArg = arg;
    if (scheduledHandle) {
      cancelAnimationFrame(scheduledHandle);
      scheduledHandle = 0;
    }
    runNow();
  };

  return throttled;
}
