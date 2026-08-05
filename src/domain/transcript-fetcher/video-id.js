// ============================================================
//  transcript-fetcher/video-id.js
//  URL / videoId 文字列から 11 桁の YouTube 動画 ID を抽出する。
// ============================================================

const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

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
    return videoId;
  }
  const matchId = videoId.match(RE_YOUTUBE);
  if (matchId && matchId.length) {
    return matchId[1];
  }
  throw new Error("Impossible to retrieve Youtube video ID.");
}
