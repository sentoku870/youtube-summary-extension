// ============================================================
//  transcript-fetcher/meta.js
//  InnerTube API レスポンスや ytInitialPlayerResponse から
//  動画メタ情報（タイトル・説明・統計）を抽出する。
// ============================================================

/**
 * InnerTube API / ytInitialPlayerResponse の videoDetails から
 * 必要なメタ情報だけを抽出したオブジェクトを返す。
 * @param {object} playerData
 * @returns {object|null}
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
