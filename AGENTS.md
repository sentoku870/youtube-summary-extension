# AGENTS.md

Compact guidance for OpenCode sessions working in this repo. Verify against the codebase before trusting any of this.

## Commands

- `npm test` — runs Jest **with coverage** (the only configured check; there is **no lint, typecheck, or formatter script** — do not invent one).
- Run a focused suite: `npx jest tests/utils.test.js` · single test: `npx jest -t "test name"`.
- `npm run build` — Vite + `@crxjs/vite-plugin` bundles into `dist/`. `npm run dev` starts the Vite dev server (port 5173).

## Manifest / loading the extension

- `manifest.json` references **source paths** (`src/background/background.js`, `src/content/index.js`, `src/popup/popup.html`, `src/options/options.html`). These are resolved by crxjs at build time — **load the unpacked extension from `dist/`** (which has the rewritten manifest + hashed bundles), not from the repo root.
- `manifest_version` 3. Permissions: `storage`, `activeTab`, `tabs`, `scripting` + broad `host_permissions` covering many LLM providers and localhost.

## Module system & test interop (non-obvious)

- Package is `"type": "module"`: **all source is ESM** (`export`/`import`).
- Jest uses Babel (`@babel/preset-env`, `node: current`) to transform ESM→CJS, so tests may use **either `require(...)` or `import`** against ESM source. Both coexist in `tests/`.
- `jest.transformIgnorePatterns` whitelists `marked` and `dompurify` (ESM-only deps) — if you add another ESM-only dep that tests import, add it to the whitelist in `package.json` or Jest will fail to parse it.
- Tests touching `chrome.*` must mock it, including `chrome.runtime.id` (required for `isExtensionContextValid()` to return true). See the `global.chrome = { runtime: { id: ... }, ... }` pattern in `tests/storage.test.js`.
- `test-output.txt` is a **stale, gitignored log** (shows a failure that no longer reproduces). Ignore it; run `npx jest` for current state.

## Architecture

Layered Chrome extension (content script does the real work):

- `src/content/` — injected on `*://*.youtube.com/*`. `index.js` is the entrypoint; builds the sidebar UI under `src/content/ui/` and wires DOM events.
- `src/domain/` — AI orchestration, transcript, markdown, API calls. Pure-ish; must not touch the DOM directly.
- `src/infrastructure/` — `storage.js` (chrome.storage I/O) and `errors.js` (custom error classes: `YsAPIError`, `YsAbortError`, `YsTimeoutError`).
- `src/shared/` — `constants.js`, `state.js`, `event-bus.js`, pure utils (`estimateTokens`, `splitIntoChunks`).
- `src/options/`, `src/popup/` — settings UI (multi-provider config) and toolbar popup.
- `src/background/background.js` is **intentionally empty** — message handling lives in the content script. Don't add background message routing without a reason.

### Port/Adapter pattern (important)

Domain code never manipulates the DOM directly. `src/domain/ports.js` defines a UI adapter interface (default = no-op); `src/content/index.js` calls `setUiAdapter({...})` at startup to inject the real UI implementations. When adding new UI capabilities consumed by the domain layer, extend the port + inject it in `index.js`.

## Gotchas

- **Storage keys are NOT unified.** The authoritative key constants are `K` in `src/infrastructure/storage.js` (e.g. `K.API_CONFIGS = "apiConfigs"`). `STORAGE_KEYS` in `src/shared/constants.js` is **defined but never imported (dead code)** with different values (`ysApiConfigs`). Use `K`, not `STORAGE_KEYS`.
- `src/domain/transcript-fetcher.js` is an ESM-adapted copy of the vendored `vendor/youtube-transcript.js` (v1.3.1); the vendored file is the source of reference, not the imported one. `vendor/marked.min.js` and `vendor/purify.min.js` are legacy — the real deps come from npm `marked` / `dompurify`.
- LLM providers are user-configurable in the options page (DeepSeek, OpenRouter, OpenAI, Anthropic, Google, Groq, Mistral, Cohere, Together, localhost). API configs live in `chrome.storage`.
- **Comments, commit messages, and UI strings are in Japanese** (commit style: `feat:`/`fix:`/`test:`/`build:`/`chore:` prefixes). Match this convention.
