// ============================================================
//  transcript-fetcher/index.js
//  YouTube 字幕取得の公開ファサード。
//  旧 src/domain/transcript-fetcher.js（youtube-transcript v1.3.1 移植）
//  を機能別ファイルに分割し、ここから再エクスポートする。
//
//  Phase 2-C: AGENTS.md の「巨大なファイルは責務別に分割」方針に従い、
//  332 行モノリスから以下 6 ファイルへ分割:
//    - video-id.js: URL / ID 抽出
//    - meta.js: メタ情報抽出
//    - parser.js: 字幕 XML パース（srv3 / classic）
//    - captions.js: captionTracks からの字幕取得 + トラック優先度
//    - inner-tube.js: InnerTube API / YouTube ページ取得
//    - player-captions.js: プレイヤー UI 字幕 DOM フォールバック
// ============================================================

import { createLogger } from "../../shared/logger.js";
import { retrieveVideoId } from "./video-id.js";
import { extractVideoMeta } from "./meta.js";
import { fetchTranscriptFromTracks } from "./captions.js";
import {
  fetchFromInnerTube,
  extractInitialPlayerResponse,
  fetchWatchPageHtml
} from "./inner-tube.js";
import { fetchPlayerCaptions } from "./player-captions.js";

export { retrieveVideoId } from "./video-id.js";
export { extractVideoMeta } from "./meta.js";
export { parseTranscriptXml } from "./parser.js";
export { pickBestTrack, fetchTranscriptFromTracks } from "./captions.js";
export {
  fetchFromInnerTube,
  extractInitialPlayerResponse,
  fetchWatchPageHtml,
  INNERTUBE_API_URL,
  INNERTUBE_CLIENT_VERSION,
  INNERTUBE_USER_AGENT
} from "./inner-tube.js";
export { fetchPlayerCaptions } from "./player-captions.js";

const log = createLogger("transcript-fetcher");

/**
 * YouTube 動画ページから字幕データを取得する統合ファサード。
 * 1. InnerTube API（Android クライアント）でメタ + captionTracks を取得
 * 2. 失敗時は YouTube ページ HTML を取得して ytInitialPlayerResponse を解析
 * 3. captionTracks から pickBestTrack でトラックを選び字幕 XML をパース
 * 4. どれも取れなかった場合のみプレイヤー DOM の字幕をフォールバックとして使う
 *
 * @param {object} config - { lang?: string }
 * @returns {Promise<{player: string[], transcript: string[], all: string[], allTimestamps?: object[], meta: object|null}>}
 */
export async function fetchYtTranscript(config) {
  const result = { player: [], transcript: [], all: [] };
  let videoMeta = null;

  try {
    const url = window.location.href;
    const videoId = retrieveVideoId(url);

    // 1) InnerTube API
    let transcriptData = null;
    try {
      const innerTubeData = await fetchFromInnerTube(videoId);
      if (innerTubeData) {
        if (!videoMeta) videoMeta = extractVideoMeta(innerTubeData);
        const captionTracks =
          innerTubeData &&
          innerTubeData.captions &&
          innerTubeData.captions.playerCaptionsTracklistRenderer &&
          innerTubeData.captions.playerCaptionsTracklistRenderer.captionTracks;
        if (Array.isArray(captionTracks) && captionTracks.length > 0) {
          transcriptData = await fetchTranscriptFromTracks(captionTracks, videoId, config);
        }
      }
    } catch (e) {
      log.error("InnerTube API error:", e);
    }

    // 2) Fallback: web page HTML → ytInitialPlayerResponse
    if (!transcriptData || !videoMeta) {
      const pageHtml = await fetchWatchPageHtml(videoId);
      if (pageHtml) {
        const pr = extractInitialPlayerResponse(pageHtml);
        if (pr) {
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
    }

    if (transcriptData && transcriptData.length > 0) {
      const texts = transcriptData.map(function (item) {
        return item.text;
      });
      result.transcript = texts;
      // オフセット情報を含む完全データ（タイムスタンプリンク用）
      result.allTimestamps = transcriptData.map(function (item) {
        return {
          text: item.text,
          offset: item.offset,
          duration: item.duration,
          lang: item.lang
        };
      });
      // all は API/字幕トラック取得結果を正とする（タイムスタンプ整合性維持）
      result.all = texts;
    }

    // 3) Player UI キャプション（フォールバック用）
    result.player = fetchPlayerCaptions();
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
