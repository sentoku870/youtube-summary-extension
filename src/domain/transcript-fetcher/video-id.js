// ============================================================
//  transcript-fetcher/video-id.js
//  URL / videoId 文字列から 11 桁の YouTube 動画 ID を抽出する。
// ============================================================

const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
const RE_YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * URL または videoId 文字列から 11 桁の YouTube 動画 ID を抽出する。
 * @param {string} videoId
 * @returns {string}
 */
export function retrieveVideoId(videoId) {
  if (!videoId || typeof videoId !== "string") {
    throw new Error("videoId または URL が必要です。");
  }
  if (videoId.length === 11) {
    if (!RE_YOUTUBE_ID.test(videoId)) {
      throw new Error("Impossible to retrieve Youtube video ID.");
    }
    return videoId;
  }
  const matchId = videoId.match(RE_YOUTUBE);
  if (matchId && matchId.length && RE_YOUTUBE_ID.test(matchId[1])) {
    return matchId[1];
  }
  throw new Error("Impossible to retrieve Youtube video ID.");
}
