// ============================================================
//  transcript-fetcher/parser.js
//  字幕 XML（srv3 / classic）をパースし、{text, offset, duration, lang}
//  の配列に変換する。HTML エンティティのデコードもここで行う。
// ============================================================

const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

function decodeEntities(text) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

/**
 * 字幕 XML をパースして [{ text, offset, duration, lang }] を返す。
 * srv3 形式（<p t="..." d="...">）を優先し、見つからなければ classic
 * 形式（<text start="..." dur="...">）にフォールバックする。
 *
 * @param {string} xml
 * @param {string|undefined} lang
 * @returns {Array<{text:string, offset:number, duration:number, lang:string|undefined}>}
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
