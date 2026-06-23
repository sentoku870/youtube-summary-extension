// tests/markdown.test.js — Markdown→HTML変換の単体テスト
const {
  sanitizeHTML,
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  renderMarkdown,
  setMarkdown
} = require("../src/domain/markdown.js");
const { marked } = require("marked");

describe("sanitizeHTML", () => {
  test("許可タグはそのまま残る", () => {
    const result = sanitizeHTML("<b>bold</b><i>italic</i>");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.textContent).toBe("bolditalic");
    expect(result.querySelector("b")).toBeTruthy();
    expect(result.querySelector("i")).toBeTruthy();
  });

  test("許可されていないタグは除去される（子テキストは残らない）", () => {
    const result = sanitizeHTML("<script>alert(1)</script><p>safe</p>");
    expect(result.querySelector("script")).toBeNull();
    expect(result.textContent).toBe("safe");
    expect(result.querySelector("p")).toBeTruthy();
  });

  test("許可タグの許可属性は維持され、危険属性は除去される", () => {
    const result = sanitizeHTML('<a href="https://safe.com" onclick="evil()">link</a>');
    const a = result.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("https://safe.com");
    expect(a.getAttribute("onclick")).toBeNull();
  });

  test("空文字列は空のフラグメントを返す", () => {
    const result = sanitizeHTML("");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.childNodes.length).toBe(0);
  });

  test("インジェクション試行を含むHTMLを安全に処理", () => {
    const html = "<img src=x onerror=alert(1)><b onmouseover=alert(1)>hello</b>";
    const result = sanitizeHTML(html);
    const img = result.querySelector("img");
    if (img) {
      expect(img.getAttribute("src")).toBe("x");
      expect(img.getAttribute("onerror")).toBeNull();
    }
    const b = result.querySelector("b");
    expect(b).toBeTruthy();
    expect(b.getAttribute("onmouseover")).toBeNull();
    expect(result.textContent).toContain("hello");
  });
});

describe("ALLOWED_TAGS", () => {
  test("許可タグリストに重要なタグが含まれている", () => {
    expect(ALLOWED_TAGS).toContain("b");
    expect(ALLOWED_TAGS).toContain("a");
    expect(ALLOWED_TAGS).toContain("pre");
    expect(ALLOWED_TAGS).toContain("code");
    expect(ALLOWED_TAGS).toContain("table");
  });

  test("許可タグリストに危険なタグは含まれていない", () => {
    expect(ALLOWED_TAGS).not.toContain("script");
    expect(ALLOWED_TAGS).not.toContain("iframe");
    expect(ALLOWED_TAGS).not.toContain("object");
    expect(ALLOWED_TAGS).not.toContain("embed");
  });
});

// ===== ALLOWED_ATTR のテスト =====
describe("ALLOWED_ATTR", () => {
  test("許可属性リストに重要な属性が含まれている", () => {
    expect(ALLOWED_ATTR).toContain("href");
    expect(ALLOWED_ATTR).toContain("src");
    expect(ALLOWED_ATTR).toContain("alt");
    expect(ALLOWED_ATTR).toContain("class");
    expect(ALLOWED_ATTR).toContain("colspan");
    expect(ALLOWED_ATTR).toContain("rowspan");
  });

  test("許可属性リストに危険な属性は含まれていない", () => {
    // on* イベントハンドラや JavaScript URL は許可しない
    expect(ALLOWED_ATTR).not.toContain("onclick");
    expect(ALLOWED_ATTR).not.toContain("onerror");
    expect(ALLOWED_ATTR).not.toContain("onload");
    expect(ALLOWED_ATTR).not.toContain("onmouseover");
  });
});

// ===== renderMarkdown のテスト =====
describe("renderMarkdown", () => {
  test("空文字・null・undefinedは空のDocumentFragmentを返す", () => {
    expect(renderMarkdown("") instanceof DocumentFragment).toBe(true);
    expect(renderMarkdown("").childNodes.length).toBe(0);
    expect(renderMarkdown(null).childNodes.length).toBe(0);
    expect(renderMarkdown(undefined).childNodes.length).toBe(0);
  });

  test("MarkdownをパースしてFragmentを返す（見出し・段落・リスト）", () => {
    const md = "# タイトル\n\nこれは段落です。\n\n- リスト1\n- リスト2";
    const result = renderMarkdown(md);

    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.querySelector("h1")).toBeTruthy();
    expect(result.querySelector("h1").textContent).toBe("タイトル");
    expect(result.querySelector("p")).toBeTruthy();
    expect(result.querySelectorAll("li").length).toBe(2);
  });

  test("コードブロックをレンダリングする", () => {
    const md = "```js\nconst x = 1;\n```";
    const result = renderMarkdown(md);
    expect(result.querySelector("pre")).toBeTruthy();
    expect(result.querySelector("code")).toBeTruthy();
  });

  test("marked.parseが例外を投げた場合はテキストノードにフォールバックする", () => {
    const parseSpy = jest.spyOn(marked, "parse").mockImplementation(() => {
      throw new Error("parse error");
    });

    const result = renderMarkdown("壊れたMarkdown");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.childNodes.length).toBe(1);
    expect(result.firstChild.nodeType).toBe(Node.TEXT_NODE);
    expect(result.firstChild.textContent).toBe("壊れたMarkdown");

    parseSpy.mockRestore();
  });
});

// ===== setMarkdown のテスト =====
describe("setMarkdown", () => {
  test("elがnullの場合は何もしない（例外なし）", () => {
    expect(() => setMarkdown(null, "text")).not.toThrow();
  });

  test("elがundefinedの場合も何もしない", () => {
    expect(() => setMarkdown(undefined, "text")).not.toThrow();
  });

  test("正常時: el.innerHTMLをクリアしてFragmentを追加する", () => {
    const el = document.createElement("div");
    el.innerHTML = "<p>古い内容</p>";

    setMarkdown(el, "# 新しい見出し");

    expect(el.querySelector("h1")).toBeTruthy();
    expect(el.querySelector("h1").textContent).toBe("新しい見出し");
    expect(el.querySelector("p")).toBeNull(); // 古い内容は消去済み
  });

  test("whiteSpaceスタイルをnormalに設定し、元の値を復元する", () => {
    const el = document.createElement("div");
    el.style.whiteSpace = "pre";

    setMarkdown(el, "**太字**");

    // 実行後は元のwhiteSpaceに戻る
    expect(el.style.whiteSpace).toBe("pre");
  });

  test("renderMarkdown内で例外が起きてもwhiteSpaceは復元される", () => {
    const el = document.createElement("div");
    el.style.whiteSpace = "pre-wrap";
    const parseSpy = jest.spyOn(marked, "parse").mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => setMarkdown(el, "壊れた")).not.toThrow();
    // 例外時でもwhiteSpaceは復元される（finallyブロック）
    expect(el.style.whiteSpace).toBe("pre-wrap");

    parseSpy.mockRestore();
  });

  test("空テキストを渡した場合は空のFragmentが追加される", () => {
    const el = document.createElement("div");
    el.innerHTML = "<span>既存</span>";

    setMarkdown(el, "");

    expect(el.childNodes.length).toBe(0);
  });
});

// ===== DOMPurify 不在時の独自サニタイズ経路 =====
describe("sanitizeHTML DOMPurify 不在時のフォールバック", () => {
  const { setDOMPurifyForTest } = require("../src/domain/markdown.js");

  afterEach(() => {
    // テスト後の状態を必ず復元（元の DOMPurify import 値）
    jest.resetModules();
  });

  test("DOMPurify が undefined の場合、独自サニタイズが動作", () => {
    setDOMPurifyForTest(undefined);
    const result = sanitizeHTML("<b>bold</b><script>evil</script>");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.querySelector("b")).toBeTruthy();
    expect(result.querySelector("script")).toBeNull();
  });

  test("DOMPurify が null の場合、独自サニタイズが動作", () => {
    setDOMPurifyForTest(null);
    const result = sanitizeHTML("<b>bold</b><script>evil</script>");
    expect(result.querySelector("script")).toBeNull();
  });

  test("DOMPurify は存在するが sanitize メソッドが無い場合、独自サニタイズが動作", () => {
    setDOMPurifyForTest({ sanitize: undefined });
    const result = sanitizeHTML("<b>bold</b><script>evil</script>");
    expect(result.querySelector("b")).toBeTruthy();
    expect(result.querySelector("script")).toBeNull();
  });

  test("独自サニタイズ: 許可されないタグは子テキストに置換", () => {
    setDOMPurifyForTest(undefined);
    const result = sanitizeHTML("<div>div内テキスト</div><unknown-tag>unknown</unknown-tag>");
    expect(result.querySelector("div")).toBeTruthy();
    expect(result.textContent).toContain("div内テキスト");
  });

  test("独自サニタイズ: 許可属性以外を除去", () => {
    setDOMPurifyForTest(undefined);
    const result = sanitizeHTML('<a href="https://safe.com" onclick="evil()">link</a>');
    const a = result.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("https://safe.com");
    expect(a.getAttribute("onclick")).toBeNull();
  });

  test("独自サニタイズ: on* で始まる属性を確実にブロック（onerror 等）", () => {
    setDOMPurifyForTest(undefined);
    const result = sanitizeHTML('<img src="x" onerror="alert(1)" onload="bad()">');
    const img = result.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("x");
    expect(img.getAttribute("onerror")).toBeNull();
    expect(img.getAttribute("onload")).toBeNull();
  });

  test("独自サニタイズ: ネストされた危険なタグを除去", () => {
    setDOMPurifyForTest(undefined);
    const html = "<div><p>safe</p><script>alert(1)</script><iframe src='evil'></iframe></div>";
    const result = sanitizeHTML(html);
    expect(result.querySelector("div")).toBeTruthy();
    expect(result.querySelector("p")).toBeTruthy();
    expect(result.querySelector("script")).toBeNull();
    expect(result.querySelector("iframe")).toBeNull();
    expect(result.textContent).toContain("safe");
  });

  test("独自サニタイズ: setAttribute が失敗する属性はスキップ（try/catch パス）", () => {
    setDOMPurifyForTest(undefined);
    // 許可属性 'class' をセットしてもクラッシュしないことを確認
    const result = sanitizeHTML('<p class="ok">テキスト</p>');
    expect(result.querySelector("p")).toBeTruthy();
    expect(result.querySelector("p").getAttribute("class")).toBe("ok");
  });

  test("DOMPurify が正常に戻った場合、元の DOMPurify パスが使われる", () => {
    // setDOMPurifyForTest を呼ばない（既定値 = モジュール import 値）
    const result = sanitizeHTML("<b>bold</b><script>evil</script>");
    // 既定では DOMPurify が動くため <script> は除去される
    expect(result.querySelector("script")).toBeNull();
  });
});
