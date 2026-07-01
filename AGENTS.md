# AGENTS.md

Compact guidance for OpenCode sessions working in this repo. Verify against the codebase before trusting any of this.

## Commands

- `npm test` — runs Jest **with coverage**.
- Run a focused suite: `npx jest tests/utils.test.js` · single test: `npx jest -t "test name"`.
- `npm run build` — Vite + `@crxjs/vite-plugin` bundles into `dist/`. `npm run dev` starts the Vite dev server (port 5173).
- `npm run lint` — ESLint v9 flat config (`eslint.config.js`) over `src/ tests/`.
- `npm run format` — Prettier auto-format `src/ tests/`. `npm run format:check` for CI-style check.
- `npm run sync-version` — package.json の version を manifest.json に同期し、ビルド日時を `src/shared/build-info.json` に書き出す（prebuild/predev/pretest で自動実行）。

## Node version

- **必須**: Node.js **>= 20.19.0**（Vite 8 の要件。`package.json` の `engines` で指定）
- **`.nvmrc`** で プロジェクトルートのバージョンを `20.20.2` に固定。
- 開発環境のセットアップ:
  ```bash
  nvm use            # .nvmrc を読んで自動で v20.20.2 に切替
  node --version     # v20.20.2 を確認
  ```
- 「`npm` が古い Node を掴んでしまう」問題（PATH の順序で `/usr/bin/node` が先）の対策:
  - nvm を使う場合、シェルの `~/.bashrc` / `~/.zshrc` で `nvm.sh` を source する行が `/usr/bin` より**前**にあることを確認
  - ワンライナー: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`
  - 確認: `which node` → `~/.nvm/versions/node/v20.20.2/bin/node` を指していれば OK
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
- `manifest_version` 3. Permissions: `storage`, `activeTab`, `tabs`, `scripting` + broad `host_permissions` covering many LLM providers and localhost.

## Module system & test interop (non-obvious)

- Package is `"type": "module"`: **all source is ESM** (`export`/`import`).
- Jest uses Babel (`@babel/preset-env`, `node: current`) to transform ESM→CJS, so tests may use **either `require(...)` or `import`** against ESM source. Both coexist in `tests/`.
- `jest.transformIgnorePatterns` whitelists `marked` and `dompurify` (ESM-only deps) — if you add another ESM-only dep that tests import, add it to the whitelist in `package.json` or Jest will fail to parse it.
- Tests touching `chrome.*` must mock it, including `chrome.runtime.id` (required for `isExtensionContextValid()` to return true). See the `global.chrome = { runtime: { id: ... }, ... }` pattern in `tests/storage.test.js`.
- Shared state lives in `src/shared/state.js` (singleton `state` + `createInitialState()`). Tests import it directly and reset in `beforeEach` (see `tests/ai.test.js`).
- `test-output.txt` is a **stale, gitignored log** (shows a failure that no longer reproduces). Ignore it; run `npx jest` for current state.

## Architecture

Layered Chrome extension (content script does the real work):

- `src/content/` — injected on `*://*.youtube.com/*`. `index.js` is the entrypoint; builds the sidebar UI under `src/content/ui/` and wires DOM events.
- `src/domain/` — AI orchestration, transcript, markdown, API calls. Pure-ish; must not touch the DOM directly.
- `src/infrastructure/` — `storage.js` (chrome.storage I/O) and `errors.js` (custom error classes: `YsAPIError`, `YsAbortError`, `YsTimeoutError`).
- `src/shared/` — `constants.js`, `state.js`, `event-bus.js`, pure utils (`estimateTokens`, `splitIntoChunks`).
- `src/options/`, `src/popup/` — settings UI (multi-provider config) and toolbar popup.
  - `src/options/options.html` (slim structure) + `src/options/options.css` (extracted styles, NOT inline).
  - `src/options/options.js` (entry: tab switch + initial load), `src/options/options-models.js` (tab 1 orchestrator), `src/options/options-display.js` (tab 3 orchestrator). Button cards (tab 2) are initialized inline from `options.js` via `button-card.js`.
  - `src/options/model-card.js` (card rendering + inline form attachment), `src/options/model-form.js` (form DOM + save/cancel), `src/options/model-filter.js` (pure filter), `src/options/button-card.js` (3 cards + autosave).
  - `src/options/options-logic.js` (pure helpers: `PROVIDERS`, `validateFormValues`, `buildConfig`, `findExistingApiKeyByHost`, `getProviderChipClass`, `getProviderLabel`, etc.).
  - `src/options/options-shared.js` (DOM utils: `getVal`, `setVal`).
  - `src/options/ui/toast.js` (toast notifications: `saveToast`/`errorToast`).
  - `src/options/ui/confirm.js` (delete confirmation modal: `confirmDialog` returns Promise).
- The extension has **no Service Worker** — message handling lives entirely in the content script. Don't add background message routing without a strong reason.
- `src/content/index.js` uses a 10-second URL polling fallback (with auto-stop after 5 min idle) on top of `yt-navigate-finish` / `yt-page-data-updated` / `popstate` / `hashchange` events. Don't remove the polling layer without verifying all four event sources fire reliably in YouTube's current SPA. The extension has no Service Worker — SPA navigation is detected entirely in the content script.

### Port/Adapter pattern (important)

Domain code never manipulates the DOM directly. `src/domain/ports.js` defines a UI adapter interface (default = no-op); `src/content/index.js` calls `setUiAdapter({...})` at startup to inject the real UI implementations. When adding new UI capabilities consumed by the domain layer, extend the port + inject it in `index.js`.

## Security rules

- **Never concatenate variable strings into `innerHTML` / `outerHTML` / `document.write` / `insertAdjacentHTML`.** This is the single largest XSS surface in a content-script extension. Rules:
  - For plain text (loading messages, error labels, user-shown labels): use `textContent` only.
  - For Markdown / HTML from LLM responses: route through `setMarkdown()` from `src/domain/markdown.js` (which already runs marked + DOMPurify with the `ALLOWED_TAGS` / `ALLOWED_ATTR` whitelist). Do not bypass it.
  - For static, hand-authored markup (panel skeletons, option forms): inline `innerHTML` is acceptable ONLY when every interpolated value is a compile-time string literal — never a runtime variable, config value, transcript string, or API error message.
  - Audit before adding any new `innerHTML` site: `grep -rn "innerHTML" src/`.
- **API keys and other secrets are plain strings.** Never log a full `config` object; if you need to log config for debugging, log individual non-secret fields (`config.apiModel`, `config.apiUrl`) only. `createLogger()` in `src/shared/logger.js` does NOT redact arguments.
- **Tainted data sources to treat as untrusted:** LLM responses (chat, summary), YouTube page text (`document.title`, video descriptions, transcript captions), and `chrome.runtime` message payloads. Anything from these sources must go through `setMarkdown()` / `textContent` / explicit sanitization.

## Gotchas

- **Storage keys are unified.** The authoritative key constants are `K` in `src/infrastructure/storage.js` (e.g. `K.API_CONFIGS = "apiConfigs"`). Always use `K`, never hard-coded strings.
- `src/domain/transcript-fetcher.js` is an ESM-adapted port of the `youtube-transcript` library (v1.3.1). The npm `marked` and `dompurify` packages are used directly.
- LLM providers are user-configurable in the options page (DeepSeek, OpenRouter, OpenAI, Anthropic, Google, Groq, Mistral, Cohere, Together, localhost). API configs live in `chrome.storage`.
- **Comments, commit messages, and UI strings are in Japanese** (commit style: `feat:`/`fix:`/`test:`/`build:`/`chore:` prefixes). Match this convention.
