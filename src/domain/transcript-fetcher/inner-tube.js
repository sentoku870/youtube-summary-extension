// ============================================================
//  transcript-fetcher/inner-tube.js
//  InnerTube API への POST と YouTube ページ HTML からの
//  ytInitialPlayerResponse 抽出を担当する。
// ============================================================

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";
export const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
export const INNERTUBE_CLIENT_VERSION = "20.10.38";
export const INNERTUBE_USER_AGENT =
  "com.google.android.youtube/" + INNERTUBE_CLIENT_VERSION + " (Linux; U; Android 14)";

/**
 * InnerTube API (Android クライアント) で動画情報を取得する。
 * @param {string} videoId
 * @returns {Promise<object|null>}
 */
export async function fetchFromInnerTube(videoId) {
  const body = JSON.stringify({
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: INNERTUBE_CLIENT_VERSION
      }
    },
    videoId: videoId
  });

  const resp = await fetch(INNERTUBE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": INNERTUBE_USER_AGENT
    },
    body: body
  });
  if (!resp.ok) return null;
  return await resp.json();
}

/**
 * YouTube ページ HTML から ytInitialPlayerResponse の JSON を抽出する。
 * 文字列リテラル内の { } を誤検出しないよう state machine で対応括弧を探す。
 * 最終候補は JSON.parse で検証（パース失敗時は null）。
 *
 * @param {string} html
 * @returns {object|null}
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
 * フォールバック: YouTube 動画ページ HTML を取得する。
 * @param {string} videoId
 * @returns {Promise<string|null>}
 */
export async function fetchWatchPageHtml(videoId) {
  const resp = await fetch("https://www.youtube.com/watch?v=" + videoId, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!resp.ok) return null;
  return await resp.text();
}
