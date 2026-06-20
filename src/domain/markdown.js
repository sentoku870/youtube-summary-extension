// ============================================================
//  markdown.js — Markdown→HTML 変換（marked + DOMPurify）
//  IIFEモジュールパターン
// ============================================================
(function() {
  'use strict';

  // ===== marked のデフォルト設定 =====
  if (typeof marked !== "undefined") {
    marked.setOptions({
      gfm: true,
      breaks: false
    });
  }

  // 許可タグのホワイトリスト（DOMPurifyフォールバック用）
  const ALLOWED_TAGS = [
    "b","i","s","u","br","hr","h1","h2","h3","h4","h5","h6",
    "pre","code","ul","ol","li","table","tr","td","th","thead","tbody",
    "strong","em","p","div","span","a","blockquote","dl","dt","dd",
    "img","caption","col","colgroup","figure","figcaption"
  ];
  const ALLOWED_ATTR = ["href", "target", "class", "id", "style",
    "colspan", "rowspan", "scope", "align", "src", "alt", "title"];

  // DOMPurifyが利用可能なら使用、なければ独自サニタイズ
  function sanitizeHTML(html) {
    // DOMPurifyがロード済みならそれを使う
    if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ALLOWED_TAGS,
        ALLOWED_ATTR: ALLOWED_ATTR
      });
    }
    // フォールバック：独自サニタイズ
    const doc = new DOMParser().parseFromString(html, "text/html");
    function walk(node) {
      if (node.nodeType === 3) return node.cloneNode(true);
      if (node.nodeType !== 1) return null;
      const tag = node.tagName.toLowerCase();
      if (ALLOWED_TAGS.indexOf(tag) === -1) {
        return document.createTextNode(node.textContent);
      }
      const clone = document.createElement(tag);
      for (let attr of node.attributes) {
        if (ALLOWED_ATTR.indexOf(attr.name) !== -1 && attr.name.indexOf("on") !== 0) {
          try { clone.setAttribute(attr.name, attr.value); } catch (_) {}
        }
      }
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const cleaned = walk(child);
        if (cleaned) clone.appendChild(cleaned);
      }
      return clone;
    }
    const frag = document.createDocumentFragment();
    for (let child = doc.body.firstChild; child; child = child.nextSibling) {
      const c = walk(child);
      if (c) frag.appendChild(c);
    }
    return frag;
  }

  // Markdown→安全なHTMLフラグメント
  function renderMarkdown(text) {
    if (!text) return document.createDocumentFragment();
    try {
      const rawHtml = marked.parse(text);
      const result = sanitizeHTML(rawHtml);
      // DOMPurifyは文字列を返すので文字列の場合はDOM変換
      if (typeof result === "string") {
        const frag = document.createDocumentFragment();
        const temp = document.createElement("div");
        temp.innerHTML = result;
        while (temp.firstChild) {
          frag.appendChild(temp.firstChild);
        }
        return frag;
      }
      return result;
    } catch (e) {
      console.error("[ys] Markdown parse error:", e);
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
  }

  // DOM要素にMarkdownを安全にセット（white-space調整付き）
  function setMarkdown(el, text) {
    if (!el) return;
    // Markdownレンダリング前に white-space を一時的に normal に変更
    // （HTMLとしてレンダリングされた後は改行はマークアップで制御）
    var origWhiteSpace = el.style.whiteSpace;
    el.style.whiteSpace = "normal";
    el.innerHTML = "";
    el.appendChild(renderMarkdown(text));
    el.style.whiteSpace = origWhiteSpace;
    // 読みやすいよう min-height は維持
  }

  // Chrome拡張用: window経由で公開（Jest環境ではwindow未定義のためガード）
  if (typeof window !== "undefined") {
    window.renderMarkdown = renderMarkdown;
    window.setMarkdown = setMarkdown;
  }

  // Jest用: module.exportsで公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      sanitizeHTML,
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      renderMarkdown,
      setMarkdown
    };
  }

})();