// ============================================================
//  transcript-fetcher/captions.js
//  captionTracks からの字幕取得とトラック優先度解決。
//  pickBestTrack + fetchTranscriptFromTracks を提供する。
// ============================================================

import { createLogger } from "../../shared/logger.js";
import { parseTranscriptXml } from "./parser.js";

const log = createLogger("transcript-fetcher/captions");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

/**
 * captionTracks から最適なトラックを優先度に従って選択する。
 *
 * 優先度:
 *   1. lang に一致し、かつ手動字幕（kind !== "asr"）
 *   2. lang に一致（ASRでも可）
 *   3. 手動字幕（言語問わず）
 *   4. captionTracks[0]（最終フォールバック）
 *
 * @param {Array} captionTracks
 * @param {string|undefined} lang
 * @returns {object|undefined}
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
 * captionTracks から 1 つ選んで字幕 XML を取得・パースする。
 * @param {Array} captionTracks
 * @param {string} videoId
 * @param {object} config
 * @returns {Promise<Array|null>}
 */
export async function fetchTranscriptFromTracks(captionTracks, videoId, config) {
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
