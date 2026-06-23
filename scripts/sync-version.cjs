#!/usr/bin/env node
// scripts/sync-version.js
// package.json の version を manifest.json に同期し、
// ビルド日時を src/shared/build-info.json に書き出す。
//
// フック: prebuild / predev / pretest で npm から自動実行される。
// 手動実行: node scripts/sync-version.js
//
// package.json は "type": "module" だが、このスクリプト自体は Node から
// 直接 require で読むため CommonJS（.cjs 相当。.js のまま）として動作する。
// （package.json に "type": "module" があっても、.js ファイルは ESM として
// 　扱われるため、ここでは素直に require を使う）

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const manifestPath = path.join(root, "manifest.json");
const buildInfoPath = path.join(root, "src/shared/build-info.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

function safeGitShort() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pkg = readJson(pkgPath);
const manifest = readJson(manifestPath);
const version = pkg.version;

// 1) manifest.json の version を package.json に同期（フォーマットを保つため文字列置換）
const manifestText = fs.readFileSync(manifestPath, "utf8");
const versionLineRe = /("version"\s*:\s*")[^"]*(")/;
const versionMatch = manifestText.match(versionLineRe);
if (versionMatch && versionMatch[1] + version + versionMatch[2] !== versionMatch[0]) {
  const newManifestText = manifestText.replace(
    versionLineRe,
    "$1" + version + "$2"
  );
  fs.writeFileSync(manifestPath, newManifestText);
  console.log(`[sync-version] manifest.json: version → ${version}`);
} else {
  console.log(`[sync-version] manifest.json: version already ${version}`);
}

// 2) build-info.json を生成（変更がある場合のみ書き出し）
const buildDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const gitCommit = safeGitShort();
const buildInfo = { version, buildDate, gitCommit: gitCommit || null };

let existing = null;
if (fs.existsSync(buildInfoPath)) {
  try {
    existing = readJson(buildInfoPath);
  } catch {
    existing = null;
  }
}

if (
  !existing ||
  existing.version !== buildInfo.version ||
  existing.buildDate !== buildInfo.buildDate ||
  existing.gitCommit !== buildInfo.gitCommit
) {
  writeJson(buildInfoPath, buildInfo);
  console.log(
    `[sync-version] build-info.json: v${version} (${buildDate})${
      gitCommit ? " " + gitCommit : ""
    }`
  );
} else {
  console.log(`[sync-version] build-info.json: unchanged`);
}

console.log(`[sync-version] done.`);
