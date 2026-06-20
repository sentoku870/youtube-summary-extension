// ============================================================
//  ai.js — AI呼び出し・Map-Reduce要約・エラー表示
//  IIFEモジュールパターン
//  callAI はオーケストレーションのみ、サブ関数に分割
// ============================================================
(function() {
  'use strict';

  const S = window.__ysState;

  // ===== 字幕テキストをタイムスタンプ付きフォーマットに変換 =====
  function formatTranscriptWithTimestamps(transcriptItems) {
    if (!transcriptItems || transcriptItems.length === 0) return "";
    return transcriptItems.map(function(item) {
      var text = item.text || item || "";
      if (item.offset != null) {
        var ms = item.offset;
        var totalSec = Math.floor(ms / 1000);
        var min = Math.floor(totalSec / 60);
        var sec = totalSec % 60;
        var ts = "[" + min.toString().padStart(2, "0") + ":" + sec.toString().padStart(2, "0") + "] ";
        return ts + text;
      }
      return text;
    }).join("\n");
  }

  // ===== テキストノード内の[MM:SS]をYouTubeシークリンクに変換（DOMベース） =====
  function linkTimestamps(el) {
    if (!el) return;
    var treeWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodesToReplace = [];
    while (treeWalker.nextNode()) {
      var node = treeWalker.currentNode;
      if (node.textContent && /\[\d{2}:\d{2}\]/.test(node.textContent)) {
        nodesToReplace.push(node);
      }
    }
    for (var i = 0; i < nodesToReplace.length; i++) {
      var textNode = nodesToReplace[i];
      var parent = textNode.parentNode;
      if (!parent) continue;
      var text = textNode.textContent;
      var parts = text.split(/(\[\d{2}:\d{2}\])/);
      var fragment = document.createDocumentFragment();
      for (var j = 0; j < parts.length; j++) {
        var part = parts[j];
        var tsMatch = part.match(/\[(\d{2}):(\d{2})\]/);
        if (tsMatch) {
          var seconds = parseInt(tsMatch[1], 10) * 60 + parseInt(tsMatch[2], 10);
          var anchor = document.createElement("a");
          anchor.className = "ys-timestamp-link";
          anchor.setAttribute("data-seek", seconds);
          anchor.href = "#";
          anchor.textContent = tsMatch[0];
          anchor.addEventListener("click", (function(sec) {
            return function(e) {
              e.preventDefault();
              var v = document.querySelector("video");
              if (v) v.currentTime = sec;
            };
          })(seconds));
          fragment.appendChild(anchor);
        } else if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      }
      parent.replaceChild(fragment, textNode);
    }
  }

  // ===== API設定解決 =====
  async function resolveApiConfig(mode) {
    const configId = await loadBtnApiConfigId(mode);
    if (configId) {
      const config = await loadApiConfigById(configId);
      if (config && config.apiKey) return config;
    }
    const allConfigs = await loadApiConfigs();
    for (let i = 0; i < allConfigs.length; i++) {
      if (allConfigs[i].apiKey) return allConfigs[i];
    }
    return null;
  }

  // ===== 実行中のストリームを中断 =====
  function abortCurrentStream() {
    if (S.abortController) {
      S.abortController.abort();
      S.abortController = null;
    }
  }

  // ===== エラー表示（公開API用ラッパー。内部コードは直接 YsUI.showError を呼ぶ） =====
  function showError(msg) {
    YsUI.showError(msg);
  }

  // ===== 要約結果のファイナライズ =====
  function finalizeResult(mode, tab, content, config, prompt, userMessage, transcript) {
    tab.generated = true;
    tab.content = content;
    tab.config = config;
    tab.modelLabel = config.apiModel;
    tab.transcriptCount = transcript.all.length;
    tab.chatHistory = [
      { role: "system", content: prompt },
      { role: "user", content: userMessage },
      { role: "assistant", content: content }
    ];

    if (S.activeTab === mode) {
      YsUI.hideProgress();
      YsUI.setSummaryContent(content);
      YsUI.updateInfoLabel("使用モデル: " + config.apiModel + " | 字幕 " + transcript.all.length + " 件");
      YsUI.showChatArea();
      YsUI.focusChatInput();
      YsUI.enableSendButton();
      YsUI.showCopyButton();
      YsUI.showRegenButton();
    }
    if (typeof YsTabs !== "undefined" && YsTabs.updateTabUI) {
      YsTabs.updateTabUI();
    }
    S.abortController = null;

    saveToStorage(content, transcript.all);
    try {
      const videoId = new URLSearchParams(window.location.search).get("v") || window.location.pathname.match(/\/shorts\/([^/?]+)/)?.[1];
      if (videoId) {
        saveSummaryCache(videoId, {
          content: content,
          modelLabel: config.apiModel,
          transcriptCount: transcript.all.length
        });
      }
    } catch (e) {
      console.error("[ys] Failed to save summary cache:", e);
    }
  }

  // ===== 180秒タイムアウトPromise =====
  function createTimeoutPromise() {
    return new Promise(function(_, reject) {
      setTimeout(function() {
        reject(new YsTimeoutError("処理がタイムアウトしました（180秒）。"));
      }, 180000);
    });
  }

  // ===== 字幕取得（プリロード優先、タイムアウト付き） =====
  async function fetchTranscriptWithTimeout(timeoutPromise) {
    let transcript = S.preloadedTranscript;
    if (!transcript) {
      transcript = await Promise.race([
        YsTranscript.fetchTranscript(),
        timeoutPromise
      ]);
    }
    return transcript;
  }

  // ===== 字幕テキストのフォーマット解決 =====
  function resolveTranscriptText(transcript) {
    if (transcript.allTimestamps && transcript.allTimestamps.length > 0) {
      S.transcriptText = formatTranscriptWithTimestamps(transcript.allTimestamps);
    } else {
      S.transcriptText = transcript.all.join("\n");
    }
  }

  // ===== メタ情報からコンテキスト文字列を生成 =====
  function buildMetaContext(meta) {
    if (!meta) return "";
    var parts = [];
    parts.push("📋 動画情報");
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (meta.title) parts.push("タイトル: " + meta.title);
    if (meta.author) parts.push("チャンネル: " + meta.author);
    if (meta.shortDescription) {
      var desc = meta.shortDescription.length > 200 ? meta.shortDescription.substring(0, 200) + "..." : meta.shortDescription;
      parts.push("説明: " + desc);
    }
    if (meta.viewCount) parts.push("視聴回数: " + Number(meta.viewCount).toLocaleString());
    if (meta.lengthSeconds) {
      var totalSec = parseInt(meta.lengthSeconds, 10);
      var min = Math.floor(totalSec / 60);
      var sec = totalSec % 60;
      parts.push("再生時間: " + min + "分" + (sec > 0 ? sec + "秒" : ""));
    }
    if (meta.keywords) parts.push("タグ: " + meta.keywords);
    parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return parts.join("\n");
  }

  // ===== API設定とプロンプトの解決 =====
  async function fetchConfigAndPrompt(mode) {
    let config = await resolveApiConfig(mode);
    if (!config || !config.apiKey) {
      config = await loadApiConfigLegacy();
    }
    if (!config || !config.apiKey) return null;

    let prompt = await loadCustomPrompt(mode);
    if (!prompt) prompt = getDefaultPrompt(mode);
    return { config: config, prompt: prompt };
  }

  // ===== 単一ストリーム要約（トークン収まる場合） =====
  async function processSingleStream(messages, config, signal, summaryTextEl, timeoutPromise) {
    let accumulated = "";
    await Promise.race([
      callChatAPIStream(messages, config,
        function(chunk) {
          accumulated = chunk;
          if (summaryTextEl) setMarkdown(summaryTextEl, accumulated);
        },
        function(fullText) {
          accumulated = fullText || accumulated;
        },
        signal
      ),
      timeoutPromise
    ]);
    return accumulated;
  }

  // ===== 1チャンクの処理（リトライ付き） =====
  async function processSingleChunk(chunkMessages, config, signal, idx, total, maxAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        YsUI.showProgress("📄 チャンク " + (idx + 1) + "/" + total + " を要約中...");
        const r = await callChatAPINonStream(chunkMessages, config, signal);
        YsUI.showProgress("📄 完了");
        return { success: true, result: r };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        if (attempt < maxAttempts) {
          console.warn("[YouTube 要約] チャンク " + (idx + 1) + " リトライ " + attempt + "/" + maxAttempts + ":", e.message);
          YsUI.showProgress("⚠️ チャンク " + (idx + 1) + " リトライ中");
          await new Promise(function(r) { setTimeout(r, 500); });
        } else {
          console.warn("[YouTube 要約] チャンク " + (idx + 1) + " の処理に最終失敗:", e.message);
          YsUI.showProgress("⚠️ チャンク " + (idx + 1) + " をスキップ");
          return { success: false, result: null };
        }
      }
    }
    return { success: false, result: null };
  }

  // ===== Map-Reduce: 並列チャンク処理＋統合（中断対応） =====
  async function processMapReduce(chunks, config, signal, prompt, timeoutPromise, summaryTextEl) {
    const results = new Array(chunks.length).fill(null);
    let successCount = 0;
    const MAX_CONCURRENCY = 5;
    const maxAttempts = 2;

    // 並列ワーカー
    async function worker() {
      let idx;
      while ((idx = nextIdx++) < chunks.length && !signal.aborted) {
        const chunkMessage = "以下の字幕（チャンク " + (idx + 1) + "/" + chunks.length + "）を要約してください:\n\n" + chunks[idx];
        const chunkMessages = [
          { role: "system", content: prompt + "\n\nこれは動画の一部分です。" },
          { role: "user", content: chunkMessage }
        ];
        const outcome = await processSingleChunk(chunkMessages, config, signal, idx, chunks.length, maxAttempts);
        if (outcome.success) {
          results[idx] = outcome.result;
          successCount++;
        }
      }
    }

    let nextIdx = 0;
    const workers = [];
    const numWorkers = Math.min(MAX_CONCURRENCY, chunks.length);
    for (let i = 0; i < numWorkers; i++) {
      workers.push(worker());
    }
    await Promise.race([Promise.allSettled(workers), timeoutPromise]);

    if (signal.aborted) {
      throw new DOMException("AbortError", "AbortError");
    }

    // 結果を抽出
    const chunkSummaries = results.filter(function(r) { return r !== null; });
    if (chunkSummaries.length === 0) {
      showError("すべてのチャンクの処理に失敗しました。");
      return null;
    }

    const combinedSummaries = chunkSummaries.map(function(s, idx) {
      return "=== チャンク " + (idx + 1) + " ===\n" + s;
    }).join("\n\n");

    YsUI.showProgress("🔄 " + successCount + "/" + chunks.length + "チャンクの要約を統合中...");

    // 統合プロンプト
    const finalMessage = "以下はYouTube動画の各チャンクの要約結果です。これらを統合して、動画全体の一貫した要約を作成してください。情報の重複を避け、論理的な流れで整理してください:\n\n" + combinedSummaries;
    const finalMergePrompt = "あなたはYouTube動画の複数のチャンク要約を統合するアシスタントです。各チャンクの内容を踏まえ、動画全体として一貫性のある要約を日本語で箇条書きで作成してください。";
    const finalMessages = [
      { role: "system", content: finalMergePrompt },
      { role: "user", content: finalMessage }
    ];

    let accumulated = "";
    await Promise.race([
      callChatAPIStream(finalMessages, config,
        function(chunk) {
          accumulated = chunk;
          if (summaryTextEl) setMarkdown(summaryTextEl, accumulated);
        },
        function(fullText) {
          accumulated = fullText || accumulated;
        },
        signal
      ),
      timeoutPromise
    ]);
    return accumulated;
  }

  // ===== AI呼び出し（オーケストレーション） =====
  // 戻り値: true=成功, false=失敗または中断
  async function callAI(mode, useAbort) {
    const tab = S.tabs[mode];
    if (!tab) return false;

    if (useAbort) abortCurrentStream();

    YsUI.hideError();
    YsUI.clearSummaryContent();
    YsUI.hideProgress();
    const summaryTextEl = YsPanel.getEl("#ys-summaryText");


    try {
      // 1. タイムアウト生成
      const timeoutPromise = createTimeoutPromise();

      // 2. 字幕取得
      const transcript = await fetchTranscriptWithTimeout(timeoutPromise);
      if (!transcript || !transcript.all || transcript.all.length === 0) {
        showError("字幕が見つかりませんでした。");
        YsUI.hideProgress();
        return false;
      }

      // 3. メタ情報を保存
      S.videoMeta = transcript.meta || null;

      // 4. 字幕テキスト解決
      resolveTranscriptText(transcript);

      // 6. API設定＋プロンプト解決
      const resolved = await fetchConfigAndPrompt(mode);
      if (!resolved) {
        showError("API設定がされていません。オプション画面で設定してください。");
        YsUI.hideProgress();
        return false;
      }
      const { config, prompt } = resolved;

      // 7. トークン見積もりで分岐
      const availableTokens = getAvailableTokens(S.transcriptText, config.apiModel);
      const estimatedTokens = estimateTokens(S.transcriptText);

      let accumulated = "";
      let userMessage = "";

      S.abortController = new AbortController();
      const signal = S.abortController.signal;

      // メタ情報コンテキストを構築
      const metaContext = buildMetaContext(S.videoMeta);

      if (estimatedTokens <= availableTokens) {
        // --- 単一ストリーム処理 ---
        userMessage = metaContext + "以下のYouTube動画の字幕を処理してください:\n\n" + S.transcriptText;
        const messages = [
          { role: "system", content: prompt },
          { role: "user", content: userMessage }
        ];
        accumulated = await processSingleStream(messages, config, signal, summaryTextEl, timeoutPromise);
      } else {
        // --- Map-Reduce処理 ---
        YsUI.showProgress("チャンク処理を開始...");
        const chunks = splitIntoChunks(S.transcriptText, availableTokens);
        userMessage = metaContext + "以下のYouTube動画の字幕を処理してください:\n\n" + S.transcriptText;
        accumulated = await processMapReduce(chunks, config, signal, prompt, timeoutPromise, summaryTextEl);
        YsUI.hideProgress();
        if (accumulated === null) return false;
      }

      // 8. 結果確定
      finalizeResult(mode, tab, accumulated, config, prompt, userMessage, transcript);
      return true;

    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        YsUI.hideProgress();
        return false;
      }
      if (e instanceof YsAbortError || e instanceof YsTimeoutError) {
        YsUI.hideProgress();
        return false;
      }
      if (e instanceof YsAPIError) {
        YsUI.clearSummaryContent();
        showError("エラー: " + e.message);
        YsUI.hideProgress();
        return false;
      }
      if (e.message && e.message.indexOf("中断") !== -1) {
        YsUI.hideProgress();
        return false;
      }
      YsUI.clearSummaryContent();
      showError("エラー: " + e.message);
      YsUI.hideProgress();
      return false;
    }
  }

  // ===== 公開API =====
  window.YsAI = {
    callAI: callAI,
    finalizeResult: finalizeResult,
    resolveApiConfig: resolveApiConfig,
    abortCurrentStream: abortCurrentStream,
    showError: showError,
    linkTimestamps: linkTimestamps
  };

  // Jest用: module.exportsで公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      formatTranscriptWithTimestamps,
      buildMetaContext,
      createTimeoutPromise,
      finalizeResult,
      resolveApiConfig,
      fetchConfigAndPrompt,
      abortCurrentStream,
      showError,
      linkTimestamps
    };
  }

})();
