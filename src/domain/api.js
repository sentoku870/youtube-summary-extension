// ============================================================
//  api.js — API呼び出し（リファクタリング版）
//  共通ロジックを抽出し、カスタムエラークラスを利用
// ============================================================
(function () {
  "use strict";

  // ===== 共通リクエスト設定構築 =====
  function buildRequestConfig(config, messages, stream) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.apiKey,
    };
    const isOpenRouter =
      config.apiUrl && config.apiUrl.indexOf("openrouter.ai") !== -1;
    if (isOpenRouter) {
      headers["HTTP-Referer"] = "https://chrome.google.com/webstore";
      headers["X-Title"] = "YouTube Summary Extension";
    }

    const body = {
      model: config.apiModel,
      messages: messages,
      max_tokens: parseInt(config.maxTokens || "4096"),
      temperature: parseFloat(config.temperature || "0.3"),
      stream: stream,
    };

    // extraParams のマージ
    if (config.extraParams) {
      try {
        const extra = JSON.parse(config.extraParams);
        for (const key in extra) {
          if (extra.hasOwnProperty(key)) body[key] = extra[key];
        }
      } catch (e) {
        console.error("[ys] extraParams JSON parse error:", e);
      }
    }

    return { headers: headers, body: JSON.stringify(body) };
  }

  // ===== エラーレスポンス解析 =====
  async function handleErrorResponse(response) {
    let errText = "";
    try {
      errText = await response.text();
    } catch (e) {
      console.error("[ys] failed to read error response body:", e);
    }
    let statusMsg = "";
    if (response.status === 429) {
      statusMsg = "APIの利用制限中です（レート制限）。しばらく待ってから再試行してください。";
    } else if (response.status >= 500) {
      statusMsg = "APIサーバーでエラーが発生しました（" + response.status + "）。後ほど再試行してください。";
    } else {
      statusMsg = "APIエラー (" + response.status + "): " + (errText.length > 100 ? errText.substring(0, 100) + "..." : errText);
    }
    throw new YsAPIError(statusMsg, response.status, response.statusText);
  }

  // ===== リトライ付きAPI呼び出し（abortSignal対応） =====
  async function fetchWithRetry(url, options, maxRetries) {
    const externalSignal = options.signal || null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(function () {
        controller.abort();
      }, 30000);
      let abortedByExternal = false;
      let onAbortExternal = null;
      if (externalSignal) {
        onAbortExternal = function () {
          abortedByExternal = true;
          controller.abort();
        };
        externalSignal.addEventListener("abort", onAbortExternal, { once: true });
      }
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (onAbortExternal && externalSignal) {
          externalSignal.removeEventListener("abort", onAbortExternal);
        }
        if (response.ok) return response;
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < maxRetries
        ) {
          const wait = attempt * 1500;
          await new Promise(function (r) {
            setTimeout(r, wait);
          });
          continue;
        }
        return response;
      } catch (e) {
        clearTimeout(timeoutId);
        if (onAbortExternal && externalSignal) {
          externalSignal.removeEventListener("abort", onAbortExternal);
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          throw abortedByExternal
            ? new YsAbortError("API呼び出しが中断されました。")
            : new YsTimeoutError("API応答が30秒でタイムアウトしました。");
        }
        if (attempt < maxRetries) {
          await new Promise(function (r) {
            setTimeout(r, attempt * 1000);
          });
          continue;
        }
        throw e;
      }
    }
  }

  // ===== SSEパース =====
  async function readStream(reader, onChunk, onDone) {
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";
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
            onDone(accumulated);
            return;
          }
          if (line.indexOf("data: ") === 0) {
            const jsonStr = line.substring(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const delta =
                parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                accumulated += delta.content;
                onChunk(accumulated);
              }
            } catch (e) {
              console.error("[ys] JSON parse error in SSE stream:", e);
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        throw new YsAbortError("API応答が中断されました。");
      console.error("[ys] SSE stream read error:", e);
      throw e;
    }
    onDone(accumulated);
  }

  // ===== 非ストリーミングAPI呼び出し（チャンク処理用、高速） =====
  window.callChatAPINonStream = async function callChatAPINonStream(
    messages,
    config,
    abortSignal,
  ) {
    const fetchOptions = buildRequestConfig(config, messages, false);
    if (abortSignal) fetchOptions.signal = abortSignal;

    const response = await fetchWithRetry(config.apiUrl, fetchOptions, 2);

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    const data = await response.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return content || "";
  };

  // ===== ストリーミングAPI呼び出し（abortSignal対応） =====
  window.callChatAPIStream = async function callChatAPIStream(
    messages,
    config,
    onChunk,
    onDone,
    abortSignal,
  ) {
    const fetchOptions = buildRequestConfig(config, messages, true);
    if (abortSignal) fetchOptions.signal = abortSignal;

    const response = await fetchWithRetry(config.apiUrl, fetchOptions, 3);

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    const reader = response.body.getReader();
    await readStream(reader, onChunk, onDone);
  };

  // ===== Jest用: module.exportsで公開（内部関数のテスト用） =====
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildRequestConfig,
      handleErrorResponse,
      readStream,
    };
  }

})();