// ============================================================
//  version.js — アプリバージョン / ビルド日時の取得
//  - getAppVersion(): chrome.runtime.getManifest().version を返す
//  - getAppBuildDate(): src/shared/build-info.json の buildDate を返す
//  どちらも取得失敗時は "unknown" を返す（UI 側で省略記号扱い）。
//  ビルド日時は scripts/sync-version.cjs（prebuild/predev/pretest フック）で
//  package.json / git から自動生成される。
// ============================================================

const FALLBACK = "unknown";

/**
 * 実行時の Chrome 拡張マニフェストから version を取得する。
 * テスト環境や Node 環境では chrome.runtime が無いため "unknown" を返す。
 */
export function getAppVersion() {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
      const m = chrome.runtime.getManifest();
      if (m && typeof m.version === "string" && m.version.length > 0) {
        return m.version;
      }
    }
  } catch {
    /* context invalidated */
  }
  return FALLBACK;
}

// ビルド情報（scripts/sync-version.cjs が build-info.json を生成）
// 静的 import にすることで Vite がビルド時に JSON をバンドルし、dist/ 内に
// 確実にコピーされる（fetch 文字列だと Vite が認識せず欠落する）。
// テストでは __setBuildInfoForTest() でモック可能。
// 注: prebuild/predev/pretest フックで必ず生成されるため、ファイル不在は
// 開発フローの不整合のみ。実行時クラッシュは避けフォールバック。
let buildInfoCache = null;
let testOverride = undefined; // テストで明示的に注入された値。undefined なら本番パスを実行。

async function loadBuildInfo() {
  // テスト用オーバーライドが優先（undefined でなければテスト注入値）
  if (testOverride !== undefined) return testOverride;
  if (buildInfoCache) return buildInfoCache;
  try {
    // Vite / Jest の両方で動作する JSON import
    const mod = await import("./build-info.json");
    buildInfoCache = mod.default || mod;
  } catch {
    buildInfoCache = null;
  }
  return buildInfoCache;
}

// テスト用: ビルド情報を直接注入する
// info に null を渡すと「ファイル不在」をシミュレート（'unknown' 経路）
// info にオブジェクトを渡すと、その値を返す（実ファイル非依存）
// 引数なし（または undefined 明示）で本番パスに戻る
export function __setBuildInfoForTest(info) {
  testOverride = info === undefined ? undefined : info;
}

/**
 * ビルド日時を YYYY-MM-DD 形式で返す。
 * build-info.json が無い / 取得失敗時は "unknown" を返す。
 */
export async function getAppBuildDate() {
  const info = await loadBuildInfo();
  if (info && typeof info.buildDate === "string" && info.buildDate.length > 0) {
    return info.buildDate;
  }
  return FALLBACK;
}

/**
 * git commit の短縮ハッシュを返す。git が利用できない環境では null。
 */
export async function getAppGitCommit() {
  const info = await loadBuildInfo();
  if (info && typeof info.gitCommit === "string" && info.gitCommit.length > 0) {
    return info.gitCommit;
  }
  return null;
}

// テスト用: build-info キャッシュをリセット
export function __resetBuildInfoCache() {
  buildInfoCache = null;
}
