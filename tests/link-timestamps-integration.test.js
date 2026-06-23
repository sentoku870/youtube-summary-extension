// tests/link-timestamps-integration.test.js — linkTimestamps のイベント委譲を統合的に検証
// [MM:SS] リンクの click で video.currentTime が書き換わることを担保する。
//
// ※ ai-utils.test.js で個別の変換は検証済み。本ファイルは「クリックしたら
//   シークする」というエンドツーエンドの挙動と、防御的なケースに焦点。
const { linkTimestamps } = require("../src/domain/ai-utils");

describe("linkTimestamps イベント委譲 (統合)", () => {
  let video;
  let container;

  beforeEach(() => {
    // video 要素を別途 document に追加（テスト用 DOM と分離）
    video = document.createElement("video");
    document.body.appendChild(video);
    // テスト用コンテナ
    container = document.createElement("div");
    container.id = "test-container";
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (video.parentNode) video.parentNode.removeChild(video);
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  test("[MM:SS] リンク click → document.querySelector('video').currentTime が更新", () => {
    container.innerHTML = '前のテキスト [01:30] シーク先';
    linkTimestamps(container);

    const anchor = container.querySelector("a.ys-timestamp-link");
    expect(anchor).toBeTruthy();

    // クリック（バブリング有効）
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    // 1分30秒 = 90秒
    expect(video.currentTime).toBe(90);
  });

  test("リンク以外（テキスト部分）のクリックでは video.currentTime 変化なし", () => {
    container.innerHTML = '普通のテキスト [01:30] リンク';
    linkTimestamps(container);

    // リンクではないテキスト部分をクリック
    const textNode = container.firstChild;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    textNode.dispatchEvent(event);

    expect(video.currentTime).toBe(0);
  });

  test("video 要素が無い場合は currentTime 設定で例外を投げない", () => {
    // video を一時的に削除
    video.parentNode.removeChild(video);
    container.innerHTML = "[02:00]";
    linkTimestamps(container);

    const anchor = container.querySelector("a");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(() => anchor.dispatchEvent(event)).not.toThrow();
    // video.currentTime の検証はスキップ（video がない）
  });

  test("同じ要素で 2 度 linkTimestamps を呼んでもリスナーは 1 つ", () => {
    container.innerHTML = "[03:00]";
    linkTimestamps(container);
    linkTimestamps(container);

    expect(container.dataset.ysTimestampBound).toBe("1");

    const anchor = container.querySelector("a");
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.currentTime).toBe(180); // 3分

    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.currentTime).toBe(180); // 同じ値（上書き）
  });

  test("不正な [XX:YY] 形式はリンクに変換されない", () => {
    container.innerHTML = "[XX:YY]";
    linkTimestamps(container);

    const anchor = container.querySelector("a");
    expect(anchor).toBeNull();
    expect(video.currentTime).toBe(0);
  });

  test("リンクに preventDefault される（href='#' のデフォルト動作を防ぐ）", () => {
    container.innerHTML = "[05:00]";
    linkTimestamps(container);
    const anchor = container.querySelector("a");

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  test("複数の [MM:SS] を含むテキストで全てのリンクがシーク可能", () => {
    container.innerHTML = '[00:10] 一つ目 [02:30] 二つ目 [59:59] 三つ目';
    linkTimestamps(container);
    const anchors = container.querySelectorAll("a.ys-timestamp-link");
    expect(anchors.length).toBe(3);

    anchors[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.currentTime).toBe(10);
    anchors[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.currentTime).toBe(150);
    anchors[2].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.currentTime).toBe(3599);
  });

  test("ネストしたテキスト（既存の ys-timestamp-link 内）は再走査しない", () => {
    container.innerHTML = "[01:00] テキスト";
    linkTimestamps(container);
    const firstAnchorCount = container.querySelectorAll("a.ys-timestamp-link").length;
    expect(firstAnchorCount).toBe(1);

    // 2 度目の呼び出しで重複しない
    linkTimestamps(container);
    const secondAnchorCount = container.querySelectorAll("a.ys-timestamp-link").length;
    expect(secondAnchorCount).toBe(1);
  });
});
