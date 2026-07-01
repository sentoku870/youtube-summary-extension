// ============================================================
//  api-stream.js — SSE (Server-Sent Events) パーサ
//  OpenAI 互換の chunked レスポンスをパースし、
//  トークン到着ごとに onChunk を呼ぶ。
// ============================================================
import { YsAbortError } from "../infrastructure/errors.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("api-stream");

/**
 * SSE ストリームをパースする
 * @param {ReadableStreamDefaultReader} reader - response.body.getReader()
 * @param {Function} onChunk - 累積テキストで呼ばれる (string)
 * @param {Function} onDone - 完了時に呼ばれる (string)
 */
export async function readStream(reader, onChunk, onDone) {
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  // reader.cancel() の結果 Promise は握り潰す（後始末のための最善努力で、
  // 失敗しても本体処理には影響させない）
  const safeCancel = function () {
    if (reader && typeof reader.cancel === "function") {
      try {
        const p = reader.cancel();
        if (p && typeof p.catch === "function") p.catch(function () {});
      } catch {
        /* ignore */
      }
    }
  };
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "data: [DONE]") {
          // 早期 return 経路でも reader を解放して接続リークを防ぐ
          safeCancel();
          onDone(accumulated);
          return;
        }
        if (line.indexOf("data: ") === 0) {
          const jsonStr = line.substring(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
            if (delta && delta.content) {
              accumulated += delta.content;
              onChunk(accumulated);
            }
          } catch (e) {
            log.error("JSON parse error in SSE stream:", e);
          }
        }
      }
    }
  } catch (e) {
    // エラー/中断時は reader を解放してから throw
    safeCancel();
    if (e instanceof DOMException && e.name === "AbortError")
      throw new YsAbortError("API応答が中断されました。");
    log.error("SSE stream read error:", e);
    throw e;
  }
  onDone(accumulated);
}
