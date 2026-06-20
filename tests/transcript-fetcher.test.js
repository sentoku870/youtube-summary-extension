// tests/transcript-fetcher.test.js — 字幕取得の純粋関数テスト
const { retrieveVideoId, extractVideoMeta, parseTranscriptXml } = require("../src/domain/transcript-fetcher");

// TextDecoder のポリフィル
const { TextDecoder: NodeTextDecoder } = require("util");
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = NodeTextDecoder;
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