/**
 * youtube-transcript library (v1.3.1) adapted for Chrome extension
 * Original: https://github.com/Kakulukian/youtube-transcript
 * Phase 7: ESM化
 */
import { createLogger } from "../shared/logger.js";

const log = createLogger("transcript-fetcher");

const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_USER_AGENT =
  "com.google.android.youtube/" + INNERTUBE_CLIENT_VERSION + " (Linux; U; Android 14)";

function decodeEntities(text) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

/**
 * Retrieve video id from url or string
 */
export function retrieveVideoId(videoId) {
  if (!videoId || typeof videoId !== "string") {
    throw new Error("videoId または URL が必要です。");
  }
  if (videoId.length === 11) {
    return videoId;
  }
  const matchId = videoId.match(RE_YOUTUBE);
  if (matchId && matchId.length) {
    return matchId[1];
  }
  throw new Error("Impossible to retrieve Youtube video ID.");
}

/**
 * Extract video metadata from InnerTube API response or ytInitialPlayerResponse
 */
export function extractVideoMeta(playerData) {
  const vd = playerData && playerData.videoDetails;
  if (!vd || !vd.title) return null;
  const meta = {};
  meta.title = vd.title || "";
  meta.author = vd.author || "";
  meta.shortDescription = vd.shortDescription || "";
  meta.lengthSeconds = vd.lengthSeconds || "";
  meta.viewCount = vd.viewCount || "";
  if (Array.isArray(vd.keywords)) {
    meta.keywords = vd.keywords.slice(0, 10).join(", ");
  } else {
    meta.keywords = "";
  }
  return meta;
}

/**
 * captionTracks から最適なトラックを優先度に従って選択する。
 *
 * 優先度:
 *   1. lang に一致し、かつ手動字幕（kind !== "asr"）
 *   2. lang に一致（ASRでも可）
 *   3. 手動字幕（言語問わず）
 *   4. captionTracks[0]（最終フォールバック）
 *
 * ASR 判定: track.kind === "asr"、または（kind 不在で vssId が "a." 始まり）。
 * vssId 先頭の "a." は YouTube 側が付与する ASR トラック識別のフォールバック。
 *
 * @param {Array<{languageCode?: string, kind?: string, vssId?: string, baseUrl?: string}>} captionTracks
 * @param {string|undefined} lang - 優先言語コード。未指定なら優先度 1〜2 をスキップ。
 * @returns {Object|undefined} 選択されたトラック。captionTracks が空なら undefined。
 */
export function pickBestTrack(captionTracks, lang) {
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) return undefined;

  const isAsr = function (t) {
    if (t.kind === "asr") return true;
    if (t.kind === undefined && typeof t.vssId === "string" && t.vssId.startsWith("a.")) {
      return true;
    }
    return false;
  };

  const matchLang = function (t) {
    return lang && t.languageCode === lang;
  };

  const found1 = captionTracks.find(function (t) {
    return matchLang(t) && !isAsr(t);
  });
  if (found1) return found1;

  if (lang) {
    const found2 = captionTracks.find(matchLang);
    if (found2) return found2;
  }

  const found3 = captionTracks.find(function (t) {
    return !isAsr(t);
  });
  if (found3) return found3;

  return captionTracks[0];
}

/**
 * Fetch and parse transcript from caption tracks
 */
async function fetchTranscriptFromTracks(captionTracks, videoId, config) {
  const lang = config && config.lang ? config.lang : undefined;
  const track = pickBestTrack(captionTracks, lang);
  if (!track || !track.baseUrl) return null;

  log.log("字幕トラック選択:", {
    lang: track.languageCode,
    kind: track.kind,
    vssId: track.vssId,
    manual: track.kind !== "asr"
  });

  const transcriptURL = track.baseUrl;
  const resp = await fetch(transcriptURL, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!resp.ok) return null;

  const xml = await resp.text();
  return parseTranscriptXml(xml, track.languageCode);
}

/**
 * Parse transcript XML (supports both srv3 and classic formats)
 */
export function parseTranscriptXml(xml, lang) {
  const results = [];

  // Try srv3 format first: <p t="ms" d="ms">...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];
    let text = "";

    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeEntities(text).trim();
    if (text) {
      results.push({ text: text, duration: durMs, offset: startMs, lang: lang });
    }
  }

  if (results.length > 0) return results;

  // Fallback: classic format <text start="s" dur="s">content</text>
  const classicResults = [].concat(Array.from(xml.matchAll(RE_XML_TRANSCRIPT)));
  return classicResults.map(function (result) {
    return {
      text: decodeEntities(result[3]),
      duration: parseFloat(result[2]),
      offset: parseFloat(result[1]),
      lang: lang
    };
  });
}

/**
 * Extract ytInitialPlayerResponse JSON from YouTube page HTML
 * 文字列リテラル内の { } を誤検出しないよう state machine で対応括弧を探す。
 * 最終候補は JSON.parse で検証（パース失敗時は null）。
 * @param {string} html
 * @returns {Object|null}
 */
export function extractInitialPlayerResponse(html) {
  if (!html) return null;
  const startToken = "var ytInitialPlayerResponse = ";
  const startIdx = html.indexOf(startToken);
  if (startIdx === -1) return null;
  const jsonStart = startIdx + startToken.length;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const candidate = html.slice(jsonStart, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Fetch full transcript from YouTube video
 */
export async function fetchYtTranscript(config) {
  const result = { player: [], transcript: [], all: [] };
  let videoMeta = null;

  try {
    const url = window.location.href;
    const videoId = retrieveVideoId(url);

    // Try InnerTube API first (Android client)
    let transcriptData = null;
    try {
      const innerTubeBody = JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: INNERTUBE_CLIENT_VERSION
          }
        },
        videoId: videoId
      });

      const innerTubeResp = await fetch(INNERTUBE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": INNERTUBE_USER_AGENT
        },
        body: innerTubeBody
      });

      if (innerTubeResp.ok) {
        const innerTubeData = await innerTubeResp.json();
        // メタ情報抽出（videoDetails）
        if (!videoMeta) videoMeta = extractVideoMeta(innerTubeData);
        const captionTracks =
          innerTubeData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(captionTracks) && captionTracks.length > 0) {
          transcriptData = await fetchTranscriptFromTracks(captionTracks, videoId, config);
        }
      }
    } catch (e) {
      log.error("InnerTube API error:", e);
    }

    // Fallback: fetch via web page
    if (!transcriptData || !videoMeta) {
      const pageResp = await fetch("https://www.youtube.com/watch?v=" + videoId, {
        headers: { "User-Agent": USER_AGENT }
      });
      const pageHtml = await pageResp.text();

      // Parse ytInitialPlayerResponse from inline script
      // 文字列内の { } を誤検出しないよう、文字列エスケープを考慮した state machine で
      // 対応する閉じ括弧を探す。最終候補は JSON.parse で検証する。
      const pr = extractInitialPlayerResponse(pageHtml);
      if (pr) {
        // メタ情報抽出（fallback時）
        if (!videoMeta) videoMeta = extractVideoMeta(pr);
        const tracks =
          pr &&
          pr.captions &&
          pr.captions.playerCaptionsTracklistRenderer &&
          pr.captions.playerCaptionsTracklistRenderer.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          transcriptData = await fetchTranscriptFromTracks(tracks, videoId, config);
        }
      }
    }

    if (transcriptData && transcriptData.length > 0) {
      const texts = transcriptData.map(function (item) {
        return item.text;
      });
      result.transcript = texts;
      // オフセット情報を含む完全データ（タイムスタンプリンク用）
      result.allTimestamps = transcriptData.map(function (item) {
        return { text: item.text, offset: item.offset, duration: item.duration, lang: item.lang };
      });
      // all は API/字幕トラック取得結果を正とする（タイムスタンプ整合性維持）
      result.all = texts;
    }

    // Also try to get player captions
    document
      .querySelectorAll(".ytp-caption-segment, .captions-text span, .caption-window span")
      .forEach(function (el) {
        const t = (el.textContent || "").trim();
        if (t) result.player.push(t);
      });

    // 字幕トラックが取得できなかった場合のみ、DOMキャプションをフォールバックとして all に設定
    if (result.all.length === 0 && result.player.length > 0) {
      result.all = result.player.slice();
    }

    // メタ情報を結果に追加
    result.meta = videoMeta;
  } catch (e) {
    return { error: e.message, player: [], transcript: [], all: [], meta: null };
  }

  return result;
}
