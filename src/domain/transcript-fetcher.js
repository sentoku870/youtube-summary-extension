/**
 * youtube-transcript library (v1.3.1) adapted for Chrome extension
 * Original: https://github.com/Kakulukian/youtube-transcript
 */

console.log("[YouTube 要約] transcript-fetcher.js loaded");
(function () {
  var RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
  var RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  var INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  var INNERTUBE_CLIENT_VERSION = "20.10.38";
  var INNERTUBE_USER_AGENT = "com.google.android.youtube/" + INNERTUBE_CLIENT_VERSION + " (Linux; U; Android 14)";

  function decodeEntities(text) {
    var el = document.createElement("textarea");
    el.innerHTML = text;
    return el.value;
  }

  /**
   * Retrieve video id from url or string
   */
  function retrieveVideoId(videoId) {
    if (videoId.length === 11) {
      return videoId;
    }
    var matchId = videoId.match(RE_YOUTUBE);
    if (matchId && matchId.length) {
      return matchId[1];
    }
    throw new Error("Impossible to retrieve Youtube video ID.");
  }

  /**
   * Extract video metadata from InnerTube API response or ytInitialPlayerResponse
   */
  function extractVideoMeta(playerData) {
    var vd = playerData && playerData.videoDetails;
    if (!vd || !vd.title) return null;
    var meta = {};
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
   * Fetch full transcript from YouTube video
   */
  window.__fetchYtTranscript = async function (config) {
    var result = { player: [], transcript: [], all: [] };
    var videoMeta = null;

    try {
      var url = window.location.href;
      var videoId = retrieveVideoId(url);

      // Try InnerTube API first (Android client)
      var transcriptData = null;
      try {
        var innerTubeBody = JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: INNERTUBE_CLIENT_VERSION,
            },
          },
          videoId: videoId,
        });

        var innerTubeResp = await fetch(INNERTUBE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": INNERTUBE_USER_AGENT,
          },
          body: innerTubeBody,
        });

        if (innerTubeResp.ok) {
          var innerTubeData = await innerTubeResp.json();
          // メタ情報抽出（videoDetails）
          if (!videoMeta) videoMeta = extractVideoMeta(innerTubeData);
          var captionTracks = innerTubeData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(captionTracks) && captionTracks.length > 0) {
            transcriptData = await fetchTranscriptFromTracks(captionTracks, videoId, config);
          }
        }
      } catch (e) {
        console.error("[ys] InnerTube API error:", e);
      }

      // Fallback: fetch via web page
      if (!transcriptData || !videoMeta) {
        var pageResp = await fetch("https://www.youtube.com/watch?v=" + videoId, {
          headers: { "User-Agent": USER_AGENT },
        });
        var pageHtml = await pageResp.text();

        // Parse ytInitialPlayerResponse from inline script
        var startToken = "var ytInitialPlayerResponse = ";
        var startIdx = pageHtml.indexOf(startToken);
        if (startIdx !== -1) {
          var jsonStart = startIdx + startToken.length;
          var depth = 0;
          for (var i = jsonStart; i < pageHtml.length; i++) {
            if (pageHtml[i] === "{") depth++;
            else if (pageHtml[i] === "}") {
              depth--;
              if (depth === 0) {
                var pr = JSON.parse(pageHtml.slice(jsonStart, i + 1));
                // メタ情報抽出（fallback時）
                if (!videoMeta) videoMeta = extractVideoMeta(pr);
                var tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tracks) && tracks.length > 0) {
                  transcriptData = await fetchTranscriptFromTracks(tracks, videoId, config);
                }
                break;
              }
            }
          }
        }
      }

      if (transcriptData && transcriptData.length > 0) {
        var texts = transcriptData.map(function (item) { return item.text; });
        result.transcript = texts;
        result.all = texts;
        // オフセット情報を含む完全データ（タイムスタンプリンク用）
        result.allTimestamps = transcriptData.map(function (item) {
          return { text: item.text, offset: item.offset, duration: item.duration, lang: item.lang };
        });
      }

      // Also try to get player captions
      document.querySelectorAll(".ytp-caption-segment, .captions-text span, .caption-window span").forEach(function (el) {
        var t = (el.textContent || "").trim();
        if (t) result.player.push(t);
      });

      var allSet = new Set([].concat(result.player, result.transcript));
      result.all = Array.from(allSet);

      // メタ情報を結果に追加
      result.meta = videoMeta;
    } catch (e) {
      return { error: e.message, player: [], transcript: [], all: [], meta: null };
    }

    return result;
  };

  /**
   * Fetch and parse transcript from caption tracks
   */
  async function fetchTranscriptFromTracks(captionTracks, videoId, config) {
    var track = captionTracks[0];
    if (config && config.lang) {
      var found = captionTracks.find(function (t) { return t.languageCode === config.lang; });
      if (found) track = found;
    }

    var transcriptURL = track.baseUrl;
    var resp = await fetch(transcriptURL, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return null;

    var xml = await resp.text();
    return parseTranscriptXml(xml, track.languageCode);
  }

  /**
   * Parse transcript XML (supports both srv3 and classic formats)
   */
  function parseTranscriptXml(xml, lang) {
    var results = [];

    // Try srv3 format first: <p t="ms" d="ms">...</p>
    var pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    var match;
    while ((match = pRegex.exec(xml)) !== null) {
      var startMs = parseInt(match[1], 10);
      var durMs = parseInt(match[2], 10);
      var inner = match[3];
      var text = "";

      var sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      var sMatch;
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
    var classicResults = [].concat(Array.from(xml.matchAll(RE_XML_TRANSCRIPT)));
    return classicResults.map(function (result) {
      return {
        text: decodeEntities(result[3]),
        duration: parseFloat(result[2]),
        offset: parseFloat(result[1]),
        lang: lang,
      };
    });
  }

  // Jest用: module.exportsで公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      retrieveVideoId,
      extractVideoMeta,
      parseTranscriptXml
    };
  }
})();
