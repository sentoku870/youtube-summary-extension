// tests/transcript-fetcher.test.js — 字幕取得の純粋関数テスト
const { retrieveVideoId, extractVideoMeta, parseTranscriptXml, fetchYtTranscript } = require("../src/domain/transcript-fetcher");

// TextDecoder のポリフィル
const { TextDecoder: NodeTextDecoder } = require("util");
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = NodeTextDecoder;
}

// window.location.href を切り替えるヘルパー（fetchYtTranscriptが参照するため）
function setLocation(href) {
  Object.defineProperty(window, "location", {
    value: { href: href, search: "", pathname: "/" },
    writable: true,
    configurable: true
  });
}

// ===== retrieveVideoId =====
describe("retrieveVideoId", () => {
  test("11文字のIDをそのまま返す", () => {
    expect(retrieveVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("youtube.com/watch?v= URLからIDを抽出", () => {
    expect(retrieveVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("youtube.com/v/ URLからIDを抽出", () => {
    expect(retrieveVideoId("https://www.youtube.com/v/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("youtu.be/短縮URLからIDを抽出", () => {
    expect(retrieveVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("youtube.com/embed/ URLからIDを抽出", () => {
    expect(retrieveVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("不正な文字列でエラーを投げる", () => {
    expect(() => retrieveVideoId("invalid")).toThrow("Impossible to retrieve Youtube video ID.");
  });

  test("空文字列でエラーを投げる", () => {
    expect(() => retrieveVideoId("")).toThrow();
  });

  test("URLにクエリパラメータが複数あってもIDを抽出", () => {
    expect(retrieveVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&list=PL123")).toBe("dQw4w9WgXcQ");
  });
});

// ===== extractVideoMeta =====
describe("extractVideoMeta", () => {
  test("完全なplayerDataからメタ情報を抽出", () => {
    const playerData = {
      videoDetails: {
        title: "テスト動画",
        author: "テストチャンネル",
        shortDescription: "これは説明文です",
        lengthSeconds: "360",
        viewCount: "1000",
        keywords: ["tag1", "tag2", "tag3"]
      }
    };
    const meta = extractVideoMeta(playerData);
    expect(meta.title).toBe("テスト動画");
    expect(meta.author).toBe("テストチャンネル");
    expect(meta.shortDescription).toBe("これは説明文です");
    expect(meta.lengthSeconds).toBe("360");
    expect(meta.viewCount).toBe("1000");
    expect(meta.keywords).toBe("tag1, tag2, tag3");
  });

  test("videoDetailsがない場合はnullを返す", () => {
    expect(extractVideoMeta({})).toBeNull();
    expect(extractVideoMeta(null)).toBeNull();
    expect(extractVideoMeta(undefined)).toBeNull();
  });

  test("titleがない場合はnullを返す", () => {
    const playerData = { videoDetails: { author: "test" } };
    expect(extractVideoMeta(playerData)).toBeNull();
  });

  test("keywordsが配列でない場合は空文字", () => {
    const playerData = {
      videoDetails: {
        title: "test",
        keywords: "not-an-array"
      }
    };
    const meta = extractVideoMeta(playerData);
    expect(meta.keywords).toBe("");
  });

  test("keywordsが10件を超える場合は10件に制限", () => {
    const playerData = {
      videoDetails: {
        title: "test",
        keywords: Array(15).fill("tag").map((v, i) => v + i)
      }
    };
    const meta = extractVideoMeta(playerData);
    expect(meta.keywords.split(", ").length).toBe(10);
  });

  test("プロパティが未定義の場合は空文字で埋める", () => {
    const playerData = {
      videoDetails: {
        title: "test"
      }
    };
    const meta = extractVideoMeta(playerData);
    expect(meta.author).toBe("");
    expect(meta.shortDescription).toBe("");
    expect(meta.lengthSeconds).toBe("");
    expect(meta.viewCount).toBe("");
  });
});

// ===== parseTranscriptXml =====
describe("parseTranscriptXml", () => {
  test("srv3形式のXMLをパースする（<s>タグ外の空白は含まれない）", () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?>' +
      '<transcript>' +
      '<p t="1000" d="2000"><s>Hello</s> <s>world</s></p>' +
      '<p t="5000" d="1500"><s>This is</s> <s>a test</s></p>' +
      '</transcript>';
    const result = parseTranscriptXml(xml, "en");
    expect(result.length).toBe(2);
    expect(result[0].text).toBe("Helloworld");
    expect(result[0].offset).toBe(1000);
    expect(result[0].duration).toBe(2000);
    expect(result[0].lang).toBe("en");
    expect(result[1].text).toBe("This isa test");
    expect(result[1].offset).toBe(5000);
    expect(result[1].duration).toBe(1500);
  });

  test("srv3形式でテキストがない場合はフォールバックしてタグ除去", () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?>' +
      '<transcript>' +
      '<p t="1000" d="2000">Hello world</p>' +
      '</transcript>';
    const result = parseTranscriptXml(xml, "en");
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("Hello world");
    expect(result[0].offset).toBe(1000);
  });

  test("classic形式のXMLをパースする（フォールバック）", () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?>' +
      '<transcript>' +
      '<text start="1.0" dur="2.0">Hello world</text>' +
      '<text start="5.0" dur="1.5">This is a test</text>' +
      '</transcript>';
    const result = parseTranscriptXml(xml, "ja");
    expect(result.length).toBe(2);
    expect(result[0].text).toBe("Hello world");
    expect(result[0].offset).toBe(1.0);
    expect(result[0].duration).toBe(2.0);
    expect(result[0].lang).toBe("ja");
    expect(result[1].text).toBe("This is a test");
  });

  test("空のXMLは空配列を返す", () => {
    const result = parseTranscriptXml("<transcript></transcript>", "en");
    expect(result).toEqual([]);
  });
});

// ===== fetchYtTranscript（統合テスト: fetch/document/window.location をモック） =====
describe("fetchYtTranscript", () => {
  const INNERTUBE_URL_PART = "youtubei/v1/player";
  const originalFetch = global.fetch;

  beforeEach(() => {
    // 各テスト前にfetchをリセット
    global.fetch = jest.fn();
  });

  afterEach(() => {
    // document.body のキャプション要素を掃除
    document.querySelectorAll(".ytp-caption-segment, .captions-text span, .caption-window span").forEach(function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });
    global.fetch = originalFetch;
  });

  test("InnerTube API成功時に字幕とメタ情報を返す", async () => {
    setLocation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const xml = '<transcript><text start="1.0" dur="2.0">Hello</text><text start="3.0" dur="1.5">World</text></transcript>';

    global.fetch = jest.fn(function (url) {
      if (url.indexOf(INNERTUBE_URL_PART) !== -1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            videoDetails: { title: "テスト動画", author: "テストチャンネル" },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  { baseUrl: "https://example.com/timedtext?lang=ja", languageCode: "ja" }
                ]
              }
            }
          })
        });
      }
      // transcript XML
      return Promise.resolve({ ok: true, text: async () => xml });
    });

    const result = await fetchYtTranscript();

    expect(result.error).toBeUndefined();
    expect(result.all).toEqual(["Hello", "World"]);
    expect(result.transcript).toEqual(["Hello", "World"]);
    expect(result.allTimestamps).toHaveLength(2);
    expect(result.allTimestamps[0]).toEqual({ text: "Hello", offset: 1.0, duration: 2.0, lang: "ja" });
    expect(result.meta.title).toBe("テスト動画");
    expect(result.meta.author).toBe("テストチャンネル");
  });

  test("InnerTube失敗時にHTMLのytInitialPlayerResponseへフォールバック", async () => {
    setLocation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const playerResponse = {
      videoDetails: { title: "フォールバック動画", author: "Fallback Channel" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: "https://example.com/timedtext?lang=en", languageCode: "en" }
          ]
        }
      }
    };
    const pageHtml = "<html><script>var ytInitialPlayerResponse = " + JSON.stringify(playerResponse) + ";</script></html>";

    global.fetch = jest.fn(function (url) {
      if (url.indexOf(INNERTUBE_URL_PART) !== -1) {
        return Promise.resolve({ ok: false });
      }
      if (url.indexOf("youtube.com/watch") !== -1) {
        return Promise.resolve({ ok: true, text: async () => pageHtml });
      }
      // transcript XML
      return Promise.resolve({
        ok: true,
        text: async () => '<transcript><text start="0" dur="1">Fallback</text></transcript>'
      });
    });

    const result = await fetchYtTranscript();

    expect(result.all).toEqual(["Fallback"]);
    expect(result.meta.title).toBe("フォールバック動画");
    // InnerTube呼び出しとHTML呼び出しの両方が発生
    const calls = global.fetch.mock.calls.map(c => c[0]);
    expect(calls.some(u => u.indexOf(INNERTUBE_URL_PART) !== -1)).toBe(true);
    expect(calls.some(u => u.indexOf("youtube.com/watch") !== -1)).toBe(true);
  });

  test("字幕トラック取得失敗時はDOMキャプション(.ytp-caption-segment)にフォールバック", async () => {
    setLocation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    // InnerTube失敗 + HTMLページにytInitialPlayerResponseなし
    global.fetch = jest.fn(function (url) {
      if (url.indexOf(INNERTUBE_URL_PART) !== -1) {
        return Promise.resolve({ ok: false });
      }
      // HTMLフォールバック応答（空ページ）
      return Promise.resolve({ ok: true, text: async () => "<html></html>" });
    });

    // DOMキャプション要素を仕込む
    const cap1 = document.createElement("div");
    cap1.className = "ytp-caption-segment";
    cap1.textContent = "DOMの字幕1";
    document.body.appendChild(cap1);

    const cap2 = document.createElement("div");
    cap2.className = "ytp-caption-segment";
    cap2.textContent = "  DOMの字幕2  "; // 前後空白あり → trimされる
    document.body.appendChild(cap2);

    const result = await fetchYtTranscript();

    expect(result.all).toEqual(["DOMの字幕1", "DOMの字幕2"]);
    expect(result.player).toEqual(["DOMの字幕1", "DOMの字幕2"]);
    expect(result.transcript).toEqual([]);
    expect(result.meta).toBeNull();
  });

  test("captionTracksが空配列の場合はall/metaのみ設定される", async () => {
    setLocation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    global.fetch = jest.fn(function (url) {
      if (url.indexOf(INNERTUBE_URL_PART) !== -1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            videoDetails: { title: "字幕なし動画" },
            captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } }
          })
        });
      }
      // HTMLフォールバックも空応答
      return Promise.resolve({ ok: true, text: async () => "<html></html>" });
    });

    const result = await fetchYtTranscript();

    expect(result.all).toEqual([]);
    expect(result.transcript).toEqual([]);
    // videoMetaは抽出される（playerDataがあれば）
    expect(result.meta.title).toBe("字幕なし動画");
  });

  test("動画IDが抽出できないURLではエラーオブジェクトを返す", async () => {
    setLocation("https://example.com/not-a-youtube-page");

    const result = await fetchYtTranscript();

    expect(result.error).toBeTruthy();
    expect(result.all).toEqual([]);
    expect(result.transcript).toEqual([]);
    expect(result.player).toEqual([]);
    expect(result.meta).toBeNull();
  });

  test("config.lang指定時に一致する言語コードのトラックを選択する", async () => {
    setLocation("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const enUrl = "https://example.com/timedtext?lang=en";
    const jaUrl = "https://example.com/timedtext?lang=ja";

    global.fetch = jest.fn(function (url) {
      if (url.indexOf(INNERTUBE_URL_PART) !== -1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            videoDetails: { title: "多言語動画" },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  { baseUrl: enUrl, languageCode: "en" },
                  { baseUrl: jaUrl, languageCode: "ja" }
                ]
              }
            }
          })
        });
      }
      if (url === enUrl) {
        return Promise.resolve({ ok: true, text: async () => '<transcript><text start="0" dur="1">Hello</text></transcript>' });
      }
      if (url === jaUrl) {
        return Promise.resolve({ ok: true, text: async () => '<transcript><text start="0" dur="1">こんにちは</text></transcript>' });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await fetchYtTranscript({ lang: "ja" });

    expect(result.all).toEqual(["こんにちは"]);
    // jaUrl の fetch が呼ばれたことを検証
    expect(global.fetch).toHaveBeenCalledWith(jaUrl, expect.anything());
  });
});