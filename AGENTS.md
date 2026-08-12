# AGENTS.md

Compact guidance for OpenCode sessions working in this repo. Verify against the codebase before trusting any of this.

## Commands

- `npm test` — runs Jest **with coverage** + `coverageThreshold` gate (branches 75 / funcs 85 / lines 88 / stmts 88).
- CI 向け: `npm test -- --ci --coverage` — 上記閾値で CI ゲート。
- Run a focused suite: `npx jest tests/utils.test.js` · single test: `npx jest -t "test name"`.
- `npm run build` — Vite + `@crxjs/vite-plugin` bundles into `dist/`. `npm run dev` starts the Vite dev server (port 5173).
- `npm run lint` — ESLint v9 flat config (`eslint.config.js`) over `src/ tests/`.
- `npm run format` — Prettier auto-format `src/ tests/`. `npm run format:check` for CI-style check.
- `npm run sync-version` — package.json の version を manifest.json に同期し、ビルド日時を `src/shared/build-info.json` に書き出す（prebuild/predev/pretest で自動実行）。

### CI / GitHub Actions

- `.github/workflows/ci.yml` が Node 22.23.0 固定で lint / format:check / test --ci / build / dist スモークを並列実行する。
- ブランチ保護: master への直接 push / pull request のマージ時に CI 通過を要求。

## Node version

- **必須**: Node.js **>= 22.0.0**（Node 22 LTS / Jod 採用。`package.json` の `engines` で指定）
- **`.nvmrc`** で プロジェクトルートのバージョンを `22.23.0` に固定。
- 開発環境のセットアップ:
  ```bash
  nvm use            # .nvmrc を読んで自動で v22.23.0 に切替
  node --version     # v22.23.0 を確認
  ```
- 「`npm` が古い Node を掴んでしまう」問題（PATH の順序で `/usr/bin/node` が先）の対策:
  - nvm を使う場合、シェルの `~/.bashrc` / `~/.zshrc` で `nvm.sh` を source する行が `/usr/bin` より**前**にあることを確認
  - ワンライナー: `export PATH="$HOME/.nvm/versions/node/v22.23.0/bin:$PATH"`
  - 確認: `which node` → `~/.nvm/versions/node/v22.23.0/bin/node` を指していれば OK
- 別バージョン管理ツールを使う場合は `.nvmrc` と同等の固定ファイル（`.tool-versions` for asdf, `volta` フィールド in package.json など）を各自追加。

## Versioning

- バージョンの単一情報源は `package.json` の `version` フィールド。
- `scripts/sync-version.cjs` が prebuild/predev/pretest フックで自動実行され、`manifest.json` の version を package.json に同期 + `src/shared/build-info.json`（gitignored）を生成。
- `src/shared/version.js` の静的 `import("./build-info.json")` でビルドデータを読み込み（Vite がバンドル時にインライン化）。
- `vite.config.js` の `copyBuildInfoPlugin` が `build-info.json` を `dist/src/shared/build-info.json` にもコピー（検証・拡張機能レビュー用）。
- オプション画面に表示設定タブ内、字幕設定直下に「ℹ️ バージョン情報」カードを表示（version / buildDate / gitCommit）。
- バージョン番号を更新する手順:
  1. `package.json` の `"version"` を SemVer で更新（例: `"1.1.0"`）
  2. 次の `npm test` / `npm run build` / `npm run dev` 実行時に `pre*` フックで自動同期される
  3. 手動実行: `npm run sync-version`
- ビルド日時は UTC で YYYY-MM-DD 形式。git が利用可能なら commit hash も記録。

## Manifest / loading the extension

- `manifest.json` references **source paths** (`src/content/index.js`, `src/popup/popup.html`, `src/options/options.html`). These are resolved by crxjs at build time — **load the unpacked extension from `dist/`** (which has the rewritten manifest + hashed bundles), not from the repo root.
- `manifest_version` 3. Permissions: `storage`, `activeTab`, `tabs` + `host_permissions` for LLM providers.

## Module system & test interop (non-obvious)

- Package is `"type": "module"`: **all source is ESM** (`export`/`import`).
- Jest uses Babel (`@babel/preset-env`, `node: current`) to transform ESM→CJS, so tests may use **either `require(...)` or `import`** against ESM source. Both coexist in `tests/`.
- **Babel は Jest 専用**。Vite は `@crxjs/vite-plugin` 経由で ESM を直接扱うため、production ビルドに Babel は関与しない。
- `jest.transformIgnorePatterns` whitelists `marked` and `dompurify` (ESM-only deps) — if you add another ESM-only dep that tests import, add it to the whitelist in `package.json` or Jest will fail to parse it.
- `tests/jest.setup.cjs` が全テストでグローバル初期化:
  - `globalThis.__DEV__ = true` — `src/` 内の `if (!globalThis.__DEV__) return;` ガード（テスト専用 export の本体）を有効化。
  - `globalThis.__TEST_NO_AUTO_INIT__ = true` — `src/content/index.js` の `waitForYtdApp(...)` 副作用を抑制。テストがモジュール副作用に左右されないようにする。テスト側で自動初期化が必要な場合は `delete globalThis.__TEST_NO_AUTO_INIT__`。
- Tests touching `chrome.*` must mock it, including `chrome.runtime.id` (required for `isExtensionContextValid()` to return true). Use `helpers.installChromeMock()` from `tests/__helpers__/chrome-mock.cjs`.
- `tests/__helpers__/flush.cjs` の `flushPromises(n)` を使ってマイクロタスクをフラッシュする（マジックナンバー `for (i=0; i<10; i++) await Promise.resolve()` の置き換え）。
- Shared state lives in `src/shared/state.js` (`uiState`, `sessionState`, `createInitialSessionState`, `createInitialTabState`, `setUiState`, `setSessionState`, `resetSession`). Tests import directly and reset in `beforeEach` (see `tests/ai.test.js`).
- `test-output.txt` is a **stale, gitignored log** (shows a failure that no longer reproduces). Ignore it; run `npx jest` for current state.

## Architecture

Layered Chrome extension (content script does the real work):

- `src/content/` — injected on `*://*.youtube.com/*`. `index.js` is the entrypoint; builds the sidebar UI under `src/content/ui/` and wires DOM events.
  - `src/content/navigation.js` — 後方互換ファサード。実体は `src/content/nav/`:
    - `src/content/nav/detector.js` — SPA ナビゲーション検出（5 ソース + ポーリング + visibilitychange）。
    - `src/content/nav/resetter.js` — 動画切替時の state リセット。
  - `src/content/ui/` — パネル骨格・配置・タブ・チャット・進捗。
    - `src/content/ui/panel.js` / `panel-template.js` / `panel-placement.js` / `panel-cache.js` など。
    - `src/content/ui/tab-cache.js` — saveSummaryCache 復元ロジック（Phase 3-2 で分離）。
    - `src/content/ui/markdown-render.js` — `setMarkdown`（Phase 2-A で `domain/markdown.js` から移動）。
    - `src/content/ui/timestamp-link.js` — `linkTimestamps`（Phase 2-A で `domain/ai-utils.js` から移動）。
- `src/domain/` — AI orchestration, transcript, markdown, API calls. Pure-ish; must not touch the DOM directly.
  - `src/domain/ai.js` — 後方互換ファサード。実体は `src/domain/ai/`:
    - `src/domain/ai/orchestrator.js` — 公開 API（callAI, abortCurrentStream, showError, prepareContext）。
    - `src/domain/ai/context.js` — 純粋関数 + 設定解決（resolveApiConfig, resolveTranscriptText, fetchConfigAndPrompt）。
    - `src/domain/ai/runner.js` — 単一ストリーム要約（既定）+ Map-Reduce フォールバック。詳細設定の `enableChunking`（chrome.storage K.ENABLE_CHUNKING、デフォルト false）が true の場合のみ Map-Reduce 経路を使う。`processSingleStream`, `runSingleStream`, `runSummary`, `STREAM_THROTTLE_MS` を export。
  - `src/domain/ai-utils.js` — 純粋関数のみ（formatTranscriptWithTimestamps, buildMetaContext, createTimeoutPromise）。DOM 操作の `linkTimestamps` は `src/content/ui/timestamp-link.js` に移動済み。
  - `src/domain/markdown.js` — `renderMarkdown` / `sanitizeHTML`（DOM 依存の `setMarkdown` は `src/content/ui/markdown-render.js` に移動済み）。
  - `src/domain/ai-finalize.js`, `ai-errors.js` — 役割別分割。
  - `src/domain/ai-chunk.js`, `ai-map-reduce.js` — Map-Reduce フォールバック経路（`enableChunking=true` 時のみ実行）。`MAX_CONCURRENCY` / `CHUNK_MAX_ATTEMPTS` 定数はこの経路専用。
  - `src/domain/transcript.js` — 字幕プリロード/リトライ。
  - `src/domain/transcript-fetcher/` — youtube-transcript v1.3.1 移植を機能別ファイルに分割（Phase 2-C）:
    - `index.js`（公開ファサード）/ `video-id.js` / `meta.js` / `parser.js` / `captions.js` / `inner-tube.js` / `player-captions.js`。
- `src/infrastructure/` — chrome.storage I/O と カスタムエラー:
  - `src/infrastructure/storage-core.js` — 汎用 get/set/remove + ストレージキー定数 `K`。
  - `src/infrastructure/storage-config.js` — 設定値ロード専用。
  - `src/infrastructure/storage-cache.js` — summaryCache + LRU + 7日TTL。
  - `src/infrastructure/errors.js` — `YsAPIError`, `YsAbortError`, `YsTimeoutError`。
- `src/shared/` — `constants.js`, `state.js`, `event-bus.js`, `raf-throttle.js`, `logger.js`, `version.js`, `abort-chain.js`, `utils.js`。
  - `src/shared/state.js` — UI 状態（パネル寿命）+ セッション状態（動画単位）+ `setUiState` / `setSessionState` / `resetSession`（Phase 2-B）。
  - `src/shared/logger.js` — `createLogger` + `redactSecrets` フィルタ。`apiKey` / `Authorization` / `sk-...` / `Bearer xxx` を自動で `[REDACTED]` に置換。Error / Date / RegExp / Map / Set は原型保持。
- `src/options/`, `src/popup/` — settings UI (multi-provider config) and toolbar popup.
  - `src/options/options.html` (slim structure) + `src/options/options.css` (extracted styles, NOT inline).
  - `src/options/options.js` (entry: tab switch + initial load), `src/options/options-models.js` (tab 1 orchestrator), `src/options/options-display.js` (tab 3 orchestrator). Button cards (tab 2) are initialized inline from `options.js` via `button-card.js`.
  - `src/options/model-card.js` (card rendering + inline form attachment), `src/options/model-form.js` (form DOM + save/cancel), `src/options/model-filter.js` (pure filter), `src/options/button-card.js` (3 cards + autosave), `src/options/model-form-dom.js` (form DOM scaffolding).
  - `src/options/options-logic.js` — 純粋ヘルパー: `validateFormValues`, `buildConfig`, `generateId`, `cssEscape` 等。
  - `src/options/options-shared.js` — DOM utils: `getVal`, `setVal`, `el`（XSS-safe textContent ヘルパ）。
  - `src/options/ui/toast.js` (toast notifications: `saveToast`/`errorToast`).
  - `src/options/ui/confirm.js` (delete confirmation modal: `confirmDialog` returns Promise).
  - `src/options/ui/auto-save.js` (debounced autosave helper).
- The extension has **no Service Worker** — message handling lives entirely in the content script. Don't add background message routing without a strong reason.
- `src/content/nav/detector.js` uses a 10-second URL polling fallback (with auto-stop after 5 min idle) on top of `yt-navigate-finish` / `yt-page-data-updated` / `popstate` / `hashchange` events. Don't remove the polling layer without verifying all four event sources fire reliably in YouTube's current SPA. The extension has no Service Worker — SPA navigation is detected entirely in the content script.

### Port/Adapter pattern (important)

Domain code never manipulates the DOM directly. `src/domain/ports.js` defines a UI adapter interface (default = no-op); `src/content/index.js` calls `setUiAdapter({...})` at startup to inject the real UI implementations. When adding new UI capabilities consumed by the domain layer, extend the port + inject it in `index.js`.

主要アダプタメソッド:
- `showError(msg)` / `hideError()` / `hideProgress()` / `showProgress(msg)`
- `setSummaryContent(content)` / `clearSummaryContent()` / `updateInfoLabel(text)` / `showChatArea()` / `hideChatArea()`
- `focusChatInput()` / `showCopyButton()` / `hideCopyButton()` / `showRegenButton()` / `hideRegenButton()`
- `getSummaryTextEl()` — `#ys-summaryText` を返す（DOM ノードを domain に渡す口）。
- `updateTabUI()` — タブ UI の再描画。
- `renderSummaryChunk(text)` — ストリーミング描画（`setMarkdown` を内部で呼ぶ）。
- `linkTimestampsIn()` — タイムスタンプのアンカー化（`linkTimestamps` を内部で呼ぶ）。

`renderSummaryChunk` / `linkTimestampsIn` を新設した経緯: domain 層が DOM ノードを直接触らずに描画できるよう Port 経由で UI 層に委譲する。

## Security rules

- **Never concatenate variable strings into `innerHTML` / `outerHTML` / `document.write` / `insertAdjacentHTML`.** This is the single largest XSS surface in a content-script extension. Rules:
  - For plain text (loading messages, error labels, user-shown labels): use `textContent` only.
  - For Markdown / HTML from LLM responses: route through `setMarkdown()` from `src/content/ui/markdown-render.js` (which runs marked + DOMPurify with the `ALLOWED_TAGS` / `ALLOWED_ATTR` whitelist). Do not bypass it.
  - For static, hand-authored markup (panel skeletons, option forms): inline `innerHTML` is acceptable ONLY when every interpolated value is a compile-time string literal — never a runtime variable, config value, transcript string, or API error message. パネル骨格は `src/content/ui/panel-template.js` の `PANEL_HTML` 定数に集約。
  - Audit before adding any new `innerHTML` site: `grep -rn "innerHTML" src/`.
- **API keys and other secrets are plain strings.** Never log a full `config` object; if you need to log config for debugging, log individual non-secret fields (`config.apiModel`, `config.apiUrl`) only. `createLogger()` in `src/shared/logger.js` の `redactSecrets` フィルタが API キー / Authorization / Bearer トークンを `[REDACTED]` に自動置換する。
- **Tainted data sources to treat as untrusted:** LLM responses (chat, summary), YouTube page text (`document.title`, video descriptions, transcript captions), and `chrome.runtime` message payloads. Anything from these sources must go through `setMarkdown()` / `textContent` / explicit sanitization.

## Gotchas

- **Storage keys are unified.** The authoritative key constants are `K` in `src/infrastructure/storage-core.js` (e.g. `K.API_CONFIGS = "apiConfigs"`). Always use `K`, never hard-coded strings.
- `src/domain/transcript-fetcher/` は youtube-transcript ライブラリ (v1.3.1) の ESM 移植を機能別ディレクトリに分割したもの。npm の `marked` と `dompurify` パッケージは直接利用。
- LLM providers are user-configurable in the options page (DeepSeek, OpenRouter, OpenAI, Anthropic, Google, Groq, Mistral, Cohere, Together, localhost). API configs live in `chrome.storage`.
- **State 書き込みは `setUiState(patch)` / `setSessionState(patch)` 経由**。直接 `uiState.x = y` / `sessionState.x = y` を書かない（`_transcriptGen` / `_transcriptPromise` など race condition 防止が必要なフィールドを除く）。
- **テスト専用 export**（`__resetNavigationForTest` / `__unregisterMessageListenerForTest` / `__resetSummaryCacheMemory` / `__setBuildInfoForTest`）は `if (!globalThis.__DEV__) return;` ガードで prod ビルド時に no-op 化されている。Vite では `NODE_ENV=production` のとき `globalThis.__DEV__` が false に置換される（`vite.config.js` の `define`）。
- **Comments, commit messages, and UI strings are in Japanese** (commit style: `feat:`/`fix:`/`test:`/`build:`/`chore:` prefixes). Match this convention.