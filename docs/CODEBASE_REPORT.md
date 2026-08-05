# YouTube 要約 Chrome 拡張機能 コードベース調査レポート

実コードに基づいた事実のみを記載しています。

---

## 1. ディレクトリ構成

```
youtube-hello-extension/
├── manifest.json                    # Chrome拡張 Manifest V3 定義
├── package.json                     # 依存・スクリプト・Jest設定
├── vite.config.js                   # Vite + @crxjs/vite-plugin バンドル設定
├── eslint.config.js                 # ESLint v9 flat config
├── babel.config.json                # Jest 用 Babel preset-env (current Node)
├── scripts/
│   └── sync-version.cjs             # package.json → manifest.json / build-info.json 同期
├── src/
│   ├── content/
│   │   ├── index.js                 # content script エントリ (Port/Adapter注入, safeInit)
│   │   ├── navigation.js            # SPA ナビゲーション検出・動画切替リセット
│   │   └── ui/
│   │       ├── panel.js             # パネル骨格DOM生成・getElキャッシュ
│   │       ├── panel-placement.js   # #secondary-inner / body フォールバック配置
│   │       ├── sidebar.css          # サイドバー用CSS (web_accessible_resources)
│   │       ├── appearance.js        # テーマ/フォント/高さをCSS変数に反映
│   │       ├── tabs.js              # タブ状態管理・switchTab・applyButtonTitles
│   │       ├── tabs-events.js       # DOMイベント登録 (ボタン/コピー/再生成/chat)
│   │       ├── tabs-ui.js           # タブUI更新・renderTabContent
│   │       ├── ui.js                # re-export ハブ (progress/summary/buttons/chat)
│   │       ├── ui-progress.js       # showError/hideError/showProgress/hideProgress
│   │       ├── ui-summary.js        # 要約描画 (setMarkdown + linkTimestamps)
│   │       ├── ui-buttons.js        # 再生成/コピー/チャット入力フォーカス制御
│   │       ├── ui-chat.js           # チャット履歴DOM生成・スクロール
│   │       ├── chat.js              # チャット送信/編集/クリア・abortChatStream
│   │       ├── message-handler.js   # chrome.runtime.onMessage リスナー
│   │       ├── event-bridge.js      # event-bus → UI 橋渡し (TRANSCRIPT_READY等)
│   │       └── storage-listener.js  # chrome.storage.onChanged 監視 (デバウンス)
│   ├── domain/                      # UI非依存の純粋ロジック
│   │   ├── ai.js                    # AIオーケストレータ (callAI / prepareContext / runSummary)
│   │   ├── ai-chunk.js              # 単一チャンク処理 (processSingleChunk)
│   │   ├── ai-errors.js             # 例外分類とUI通知 (handleAiErrors)
│   │   ├── ai-finalize.js           # 結果確定と永続化 (finalizeResult)
│   │   ├── ai-map-reduce.js         # processMapReduce (並列チャンク+マージ)
│   │   ├── ai-utils.js              # 純粋関数 (linkTimestamps/buildMetaContext/createTimeoutPromise)
│   │   ├── api.js                   # LLM API 公開ファサード (callChatAPIStream/NonStream)
│   │   ├── api-auth.js              # buildAuthHeaders, isOpenRouterUrl
│   │   ├── api-internals.js         # buildRequestConfig, deepMergeBody
│   │   ├── api-retry.js             # fetchWithRetry, handleErrorResponse, isRetryableHttpStatus
│   │   ├── api-stream.js            # SSEパーサ readStream
│   │   ├── markdown.js              # marked + DOMPurify ラッパ (sanitizeHTML/setMarkdown)
│   │   ├── ports.js                 # UI Adapter Port (setUiAdapter/getUiAdapter)
│   │   ├── transcript.js            # fetchTranscript / preloadTranscript / retryTranscript
│   │   └── transcript-fetcher.js    # youtube-transcript v1.3.1 ESM移植 (InnerTube API)
│   ├── infrastructure/
│   │   ├── storage.js               # 後方互換re-exportハブ
│   │   ├── storage-core.js          # 汎用I/O (get/set/remove/getAll) + K定数
│   │   ├── storage-config.js        # 設定値ロード (loadApiConfigs, loadCustomPrompt等)
│   │   ├── storage-cache.js         # 要約キャッシュ (saveSummaryCache/loadSummaryCache)
│   │   └── errors.js                # YsAPIError / YsAbortError / YsTimeoutError
│   ├── options/
│   │   ├── options.html             # 3タブ (model/button/display) 設定画面
│   │   ├── options.css              # 設定画面スタイル (728行)
│   │   ├── options.js               # エントリ: タブ切替+初期化+loadInitialSettings
│   │   ├── options-models.js        # モデル管理タブのオーケストレータ
│   │   ├── options-display.js       # 表示設定タブ (テーマカード/プリセットチップ/自動保存)
│   │   ├── options-logic.js         # 純粋関数 (generateId/validateFormValues/buildConfig/cssEscape)
│   │   ├── options-shared.js        # DOM生成ヘルパ (el)
│   │   ├── model-card.js            # モデルカード描画/検索/編集
│   │   ├── model-form.js            # モデルフォームのopen/save/cancel
│   │   ├── model-form-dom.js        # フォーム DOM 構築ヘルパ
│   │   ├── model-filter.js          # 純粋検索フィルタ
│   │   ├── button-card.js           # ボタンタブ3カード+デバウンス自動保存
│   │   └── ui/
│   │       ├── auto-save.js         # createAutoSave (デバウンス+インジケータ)
│   │       ├── confirm.js           # confirmDialog (Promise返すモーダル)
│   │       └── toast.js             # saveToast/errorToast 通知
│   ├── popup/
│   │   ├── popup.html               # 「字幕DL」+「設定」ボタンのツールバーポップアップ
│   │   └── popup.js                 # アクティブタブへysGetTranscript送信→テキストDL
│   └── shared/
│       ├── constants.js             # 全体定数 (API_TIMEOUT_MS等)
│       ├── state.js                 # uiState + sessionState (singleton)
│       ├── event-bus.js             # 軽量pub/sub (DOM_EVENTS + INTERNAL_EVENTS)
│       ├── logger.js                # createLogger
│       ├── utils.js                 # estimateTokens / splitIntoChunks / getCurrentVideoId
│       ├── raf-throttle.js          # createRafThrottle
│       ├── abort-chain.js           # linkAbortSignal
│       ├── version.js               # getAppVersion/getAppBuildDate/getAppGitCommit
│       └── build-info.json          # ビルド時生成 (gitignored, Viteがインライン化)
└── tests/                           # Jest + jsdom テスト群 (約50ファイル)
```

---

## 2. manifest.json の内容

**Manifest Version: 3**

```json
{
  "manifest_version": 3,
  "name": "YouTube 要約",
  "version": "1.0.0",
  "description": "YouTube動画の字幕を取得しAIで要約する拡張機能",
  "permissions": ["storage", "activeTab", "tabs"],
  "host_permissions": [
    "*://*.youtube.com/*",
    "https://api.deepseek.com/*",
    "https://openrouter.ai/*",
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://*.groq.com/*",
    "https://*.mistral.ai/*",
    "https://*.cohere.ai/*",
    "https://*.together.xyz/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],
  "options_ui": {
    "page": "src/options/options.html",
    "open_in_tab": true
  },
  "web_accessible_resources": [
    {
      "resources": ["src/content/ui/sidebar.css"],
      "matches": ["*://*.youtube.com/*"]
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "YouTube 要約"
  },
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "run_at": "document_idle",
      "js": ["src/content/index.js"]
    }
  ]
}
```

**特記事項:**
- `background` / `service_worker` フィールドは**存在しない** (Service Workerは使わず、メッセージ処理はcontent script側に集約)
- `scripting` パーミッションも manifest.json には**記載なし**(AGENTS.mdに言及があるが実コードと差異)
- content scriptは `document_idle` でyoutube.com全URLに注入

---

## 3. 主要コンポーネントの責務

### 3.1 Content Script (`src/content/`)

| 機能 | ファイル | 主要関数 |
|---|---|---|
| エントリ・初期化 | `index.js` | `safeInit()`, `waitForYtdApp()`, `setUiAdapter()` |
| 字幕取得 | `domain/transcript.js` + `domain/transcript-fetcher.js` | `fetchTranscript()`, `preloadTranscript()`, `retryTranscript()` → InnerTube API |
| パネル骨格生成 | `ui/panel.js` | `createPanel()` |
| パネル配置 | `ui/panel-placement.js` | `placePanel()` (→ `#secondary-inner`/`#secondary`/`#related`/body) |
| 翻訳結果表示 | `ui/ui-summary.js` | `setSummaryContent()` (内部で `setMarkdown()` + `linkTimestamps()`) |
| タブ管理 | `ui/tabs.js`, `ui/tabs-ui.js` | `switchTab()`, `applyButtonTitles()` |
| チャット表示 | `ui/ui-chat.js`, `ui/chat.js` | `appendChatMessage()`, `onChatSend()` |
| エラー表示 | `ui/ui-progress.js` | `showError()` (内部で再試行ボタン生成) |
| ナビ検出 | `navigation.js` | `startNavigationDetection()`, `resetState()`, `handleNavigation()` |
| メッセージ受信 | `ui/message-handler.js` | `onRuntimeMessage()` (ysPing/ysGetTranscript/ysForcePanel/ysTriggerAi) |

### 3.2 Background / Service Worker

**存在しない。** Manifest V3 だが Service Worker を使わず、popup↔content script間の通信は `chrome.runtime.onMessage` で content script (`message-handler.js`) が直接受信する。

### 3.3 Popup (`src/popup/`)

| ファイル | 役割 |
|---|---|
| `popup.html` | 「💾 字幕DL」「⚙ 設定」2ボタン+ステータステキスト |
| `popup.js` | アクティブタブへ `chrome.tabs.sendMessage(tabId, {action:"ysGetTranscript"})` 送信 → content scriptから字幕取得 → Blob→`youtube_captions_<videoId>.txt` ダウンロード |

`chrome.runtime.openOptionsPage()` で設定画面を開く。`latestSummary` を `chrome.storage.local` から監視 (`chrome.storage.onChanged`)。

### 3.4 Options (`src/options/`)

**保存先:** 全て `chrome.storage.local` (キー一覧は `K` 定数 `src/infrastructure/storage-core.js:11-22`)

| キー (K.*) | 内容 |
|---|---|
| `API_CONFIGS` | モデル設定配列 (`[{id,label,apiKey,apiUrl,apiModel,temperature,maxTokens,extraParams}]`) |
| `PROMPT_PREFIX + mode` (`prompt_summary` 等) | ボタン別カスタムプロンプト |
| `BTN_TITLE_PREFIX + mode` (`btnTitle_summary` 等) | ボタン表示名 |
| `BTN_API_PREFIX + mode` (`btnApiConfig_summary` 等) | ボタンが使うモデル設定ID |
| `SUBTITLE_LANG` | 字幕言語 (`auto`/`ja`/`en`等) |
| `FONT_SIZE` | サイドバー文字サイズ (デフォルト `13`) |
| `PANEL_HEIGHT` | パネル最大高 (デフォルト `1100`) |
| `THEME` | `auto`/`light`/`dark` |
| `LATEST_SUMMARY`, `LATEST_CAPTIONS` | 直近の要約/字幕 |
| `summary_cache_<videoId>_<mode>` | 動画×モード別キャッシュ (7日TTL) |

**読み込み:** `loadInitialSettings()` (`options.js:86`) が起動時に `getAll()` で全件取得し各フォームへ流し込み。各タブの値変更は `createAutoSave()` (`options/ui/auto-save.js`) で300msデバウンスして自動保存。

---

## 4. データフロー（字幕取得→AI要約→画面表示）

```
[YouTubeページ読み込み]
   ↓
[content/index.js:111] waitForYtdApp() → ytd-app 出現を待つ
   ↓
[index.js:113] safeInit() → doInit()
   ↓
[panel.js:51] createPanel()                  ← 骨格DOM生成
   ↓
[tabs-events.js:67] bindEvents()             ← クリック/storage.onChanged
   ↓
[transcript.js:54] preloadTranscript()
   ↓
[transcript-fetcher.js] fetchYtTranscript() → YouTube InnerTube API
   (RE_YOUTUBE で videoId 抽出 → ytInitialPlayerResponse から captionTracks
    → baseUrl を fetch → RE_XML_TRANSCRIPT でパース → {all, player, meta, allTimestamps})
   ↓
[transcript.js:76] emit(EVENTS.TRANSCRIPT_READY)
   ↓
[event-bridge.js:15] applyButtonTitles()     ← ボタン表示更新

===== ユーザがA/B/Cボタン押下 =====
[tabs.js:74] → switchTab(mode)
   ↓
[tabs.js:112] loadCachedSummary(mode)        ← saveSummaryCache ヒット時はスキップ
   ↓ (キャッシュなし)
[domain/ai.js:140] callAI(mode, true)
   ├─ [ai.js:184] prepareContext(mode)
   │    ├─ [transcript.js:17] fetchTranscript() (プリロード済み or 再取得)
   │    ├─ [ai.js:204] resolveTranscriptText() (allTimestamps 優先でテキスト化)
   │    ├─ [ai.js:208] fetchConfigAndPrompt(mode)
   │    │    ├─ [ai.js:45] resolveApiConfig() → storage-config.loadBtnApiConfigId/loadApiConfigById
   │    │    └─ [storage-config.js:27] getDefaultPrompt() (または prompt_<mode>)
   │    └─ [ai-utils.js:93] buildMetaContext() → 動画タイトル/説明等のコンテキスト文字列
   ├─ [ai.js:230] runSummary()
   │    ├─ 単一ストリーム経路:  estimatedTokens ≤ availableTokens → processSingleStream()
   │    │    ├─ [api.js:30] callChatAPIStream()
   │    │    │    ├─ [api-internals.js:19] buildRequestConfig()
   │    │    │    │    ├─ [api-auth.js:28] buildAuthHeaders()
   │    │    │    │    │    └─ OpenRouter検出時: HTTP-Referer="https://chrome.google.com/webstore"
   │    │    │    │    │                     X-Title="YouTube Summary Extension" 追加
   │    │    │    │    └─ body: {model, messages, max_tokens, temperature, stream} + extraParamsマージ
   │    │    │    ├─ [api-retry.js:89] fetchWithRetry()
   │    │    │    │    ├─ attemptFetch() → AbortController(30s) + 外部signal連携
   │    │    │    │    ├─ 指数バックオフ (1500ms×2^(n-1) HTTP / 1000ms×2^(n-1) net)
   │    │    │    │    └─ リトライ条件: HTTP 429/5xx, ネットワークエラー (Abort以外)
   │    │    │    └─ [api-stream.js:17] readStream()
   │    │    │         ├─ SSEパース "data: [DONE]" 検出で完了
   │    │    │         └─ delta.content 累積 → onChunk → createRafThrottle(60ms) → setMarkdown()
   │    │    └─ 完了時 linkTimestamps() → [MM:SS] を <a class="ys-timestamp-link"> に置換
   │    └─ Map-Reduce経路: estimatedTokens > availableTokens → splitIntoChunks()
   │         └─ [ai-map-reduce.js:38] processMapReduce()
   │              ├─ MAX_CONCURRENCY=5 で並列 worker
   │              ├─ [ai-chunk.js:23] processSingleChunk() → callChatAPINonStream()
   │              └─ 結合プロンプトで callChatAPIStream() (統合)
   ├─ [ai-finalize.js] finalizeResult()
   │    ├─ tab.content / modelLabel / transcriptCount / chatHistory 更新
   │    ├─ [storage-cache.js] saveSummaryCache(videoId, mode, ...)
   │    ├─ [ui-summary.js:11] setSummaryContent()
   │    └─ showCopyButton/showRegenButton/showChatArea
   └─ [ai-errors.js] handleAiErrors()        ← YsAPIError/YsAbortError/YsTimeoutError 分類
   ↓
[tabs-ui.js:54] renderTabContent(mode) → setSummaryContent() (marked+DOMPurify+linkTimestamps)
   ↓
[ui-chat.js] チャット欄で追加質問可 (chat.js:48 onChatSend() → callChatAPIStream ループ)
```

---

## 5. 外部依存

### 5.1 翻訳/要約API（エンドポイント）

API URL は**ハードコードされていない**。ユーザーが `options.html` で任意設定可能な `apiUrl` を `chrome.storage.local` に保存し、`buildRequestConfig(config, ...)` (`api-internals.js:19`) がそのまま `fetch(url, ...)` に使う。OpenAI 互換のChat Completions形式（SSE）を前提。

`manifest.json` の `host_permissions` に登録されている対応プロバイダ:
- DeepSeek (`https://api.deepseek.com/*`)
- OpenRouter (`https://openrouter.ai/*`) — `api-auth.js:14` で `hostname === "openrouter.ai"` を厳密判定し `HTTP-Referer`/`X-Title` を付与
- OpenAI (`https://api.openai.com/*`)
- Anthropic (`https://api.anthropic.com/*`)
- Google Gemini (`https://generativelanguage.googleapis.com/*`)
- Groq (`https://*.groq.com/*`)
- Mistral (`https://*.mistral.ai/*`)
- Cohere (`https://*.cohere.ai/*`)
- Together (`https://*.together.xyz/*`)
- ローカル (`http://localhost/*`, `http://127.0.0.1/*`)

### 5.2 npm 依存 (`package.json`)

**dependencies (本番):**
| パッケージ | バージョン | 用途 |
|---|---|---|
| `dompurify` | ^3.4.8 | Markdown→HTMLサニタイズ (`src/domain/markdown.js`) |
| `marked` | ^18.0.5 | Markdown→HTML変換 (`src/domain/markdown.js`) |

**devDependencies (ビルド/テスト):**
| パッケージ | バージョン | 用途 |
|---|---|---|
| `@babel/preset-env` | ^7.29.7 | Jest用ESM→CJS変換 |
| `@babel/plugin-syntax-import-meta` | ^7.10.4 | ESM対応 |
| `@crxjs/vite-plugin` | ^2.7.0 | Chrome拡張Manifest V3バンドル |
| `@eslint/js` | ^9.39.4 | ESLint v9 flat config |
| `eslint` | ^9.39.4 | 静的解析 |
| `eslint-config-prettier` | ^9.1.2 | Prettier競合回避 |
| `eslint-plugin-import` | ^2.32.0 | import解析 |
| `globals` | ^15.15.0 | グローバル定義 |
| `jest` | ^29.7.0 | テストランナー |
| `jest-environment-jsdom` | ^29.7.0 | ブラウザAPIモック |
| `prettier` | ^3.8.4 | フォーマッタ |
| `vite` | ^8.0.16 | バンドラ |

### 5.3 APIキー保管方法

**`chrome.storage.local` 平文保存**（`src/options/model-form.js` で `apiKey` を受け取り `set({apiConfigs:[...]})` で永続化）。環境変数や暗号化は**使われていない**。

- `AGENTS.md` の Security rules に「APIキーは平文」「`config` 全体をログに出さないこと（`config.apiModel`, `config.apiUrl` のみログ可）」と明記
- ロガー `src/shared/logger.js` は引数をマスクしない

---

## 6. 既知の制約・TODO

### 6.1 TODO / FIXME コメント

`grep TODO|FIXME|XXX|HACK` の結果、`TODO`/`FIXME`/`HACK` の明示的コメントは **`src/` 配下には存在しない**。`tests/utils.test.js:250` のテスト名に `/watch?v=XXX` が出現するのみ。

ただし各所に「T2-XXX」「B-XXX」「C-XXX」「T3-S1」「T3-C1」「A-3」等の**コミット/イシュートラッキングタグ**がコメントとして多数残っており、これが TODO リスト的な役割を果たしている。主な例:

| タグ | 場所 | 内容 |
|---|---|---|
| T2-D1 | `content/index.js:63` | パネル再利用時のプリロード漏れ修正 |
| T2-D5 | `popup/popup.js:15` | latestSummary取得結果のメモ化 |
| T2-E9 | `domain/transcript.js:21` | 動画世代 mismatch 検出 |
| T2-A3 | `domain/ai.js:256` | チャンク1個ならMap-Reduce起動せず単一ストリーム |
| T2-A5 | `content/ui/tabs.js:106` | saveSummaryCacheヒット時の即時表示 |
| T2-C1 | `infrastructure/storage-cache.js:8` | 同一videoIdキャッシュをメモリに保持 |
| T3-C1 | `infrastructure/storage-cache.js:12` | キャッシュキーを (videoId, mode) 単位に (A/B/Cタブ誤表示バグ対策) |
| T3-S1 | `domain/ai.js:113` | タイムスタンプリンクは最終確定時にだけ走らせる |
| B-1〜B-4 | `content/navigation.js`, `content/ui/storage-listener.js` | BFCache/storage.onChanged関連の境界ケース |
| C-1〜C-7 | 各ファイル | リファクタPhase C のコミットタグ |
| F-5 | `shared/state.js:43` | チャット送信用の状態をモジュールスコープから移動 |
| A-3 | `content/ui/ui-progress.js:58`, `event-bridge.js:42` | SUMMARY_RETRY_CLICKED 経由でui.js→tabs.jsの循環依存解消 |

### 6.2 ハードコードされている値（セレクタ・タイムアウト・マジックナンバー）

**`src/shared/constants.js`（集約定数）:**
| 定数 | 値 | 用途 |
|---|---|---|
| `API_TIMEOUT_MS` | 30000 | APIリクエスト1回のタイムアウト |
| `API_MAX_RETRIES_STREAM` | 3 | ストリーミングAPIリトライ回数 |
| `API_MAX_RETRIES_NONSTREAM` | 2 | 非ストリーミングAPIリトライ回数 |
| `API_RETRY_BASE_WAIT_MS` | 1500 | HTTPエラー時バックオフ基数 |
| `API_RETRY_NET_BASE_WAIT_MS` | 1000 | ネットワークエラー時バックオフ基数 |
| `GLOBAL_TIMEOUT_MS` | 180000 | 全体処理タイムアウト(3分) |
| `MAX_CONCURRENCY` | 5 | Map-Reduce並列度 |
| `CHUNK_MAX_ATTEMPTS` | 2 | チャンクごと最大試行回数 |
| `CONTEXT_WINDOW_USABLE_RATIO` | 0.8 | 入力に使えるコンテキスト比 |
| `DEFAULT_MAX_TOKENS` | 4096 | 出力最大トークン |
| `DEFAULT_TEMPERATURE` | 0.3 | 温度パラメータ |
| `MIN_USABLE_TOKENS` | 1 | 計算結果の下限クランプ |
| `CHAT_HISTORY_SEED_LENGTH` | 3 | 初期要約の system+user+assistant 件数 |
| `TS_LINK_CLASS` | `"ys-timestamp-link"` | タイムスタンプリンクCSSクラス |
| `TIMESTAMP_DELEGATION_FLAG` | `"ysTimestampBound"` | 委譲リスナー登録済みフラグ |

**`src/shared/utils.js` のモデル別コンテキストウィンドウ (L46-55):**
```js
["gpt-4o", 128000],
["gpt-4-turbo", 128000],
["gpt-4", 8192],
["gpt-3.5", 16384],
["claude-3.5", 200000],
["claude-3", 200000],
["deepseek", 1000000],
["gemini", 1000000],
["command", 128000]
// DEFAULT_CONTEXT_WINDOW = 32000
```

**その他の各所に散在するマジックナンバー:**
| 値 | 場所 | 用途 |
|---|---|---|
| `MIN_INIT_INTERVAL_MS = 2000` | `content/index.js:60` | safeInit二重実行ガード |
| `STREAM_THROTTLE_MS = 60` | `domain/ai.js:38`, `domain/ai-map-reduce.js:15` | ストリーミング描画スロットル |
| `FALLBACK_POLL_INTERVAL_MS = 10000` | `content/navigation.js:24` | SPAナビ検出フォールバック間隔 |
| `FALLBACK_POLL_MAX_IDLE_MS = 5*60*1000` | `content/navigation.js:25` | ポーリング自動停止時間 |
| `NAV_DEDUPE_WINDOW_MS = 200` | `content/navigation.js:31` | 同一URL通知デデュープ窓 |
| `SUMMARY_CACHE_TTL_MS = 7*24*60*60*1000` | `infrastructure/storage-cache.js:23` | 要約キャッシュTTL(7日) |
| `SUMMARY_CACHE_MAX_ENTRIES = 200` | `infrastructure/storage-cache.js:24` | メモリキャッシュ最大エントリ |
| `DEBOUNCE_MS = 300` | `options/button-card.js:20` | ボタンタブ自動保存デバウンス |
| `DEFAULT_DEBOUNCE_MS = 300` | `options/ui/auto-save.js:17` | 表示設定自動保存デバウンス |
| `SAVED_MESSAGE_DURATION_MS = 2500` | `options/ui/auto-save.js:18` | 「✓ 保存しました」表示時間 |
| `DEFAULT_WAIT_MS = 5000` | `content/ui/panel-placement.js:19` | #secondary-inner 待機最大時間 |
| `RELOCATE_OBSERVER_TIMEOUT_MS = 30000` | `content/ui/panel-placement.js:20` | 再配置MutationObserver寿命 |
| `SECONDARY_POLL_INTERVAL_MS = 100` | `content/ui/panel-placement.js:21` | secondary ポーリング間隔 |
| `setTimeout(r, 500)` | `domain/ai-chunk.js:42` | チャンクリトライ待機 |
| `setTimeout(r, 1500 * attempt)` | `domain/transcript.js:83` | 字幕取得リトライ待機 |
| `1500ms` | `content/ui/storage-listener.js:42` | storage.onChanged デバウンス |
| `searchInput.setTimeout 150ms` | `options/options-models.js:65` | 検索デバウンス |

**ハードコードされているセレクタ:**
| セレクタ | 場所 |
|---|---|
| `#yt-summary-root` | `content/ui/panel.js`, `content/ui/appearance.js` |
| `#ys-panel`, `#ys-btn-summary`, `#ys-btn-customA`, `#ys-btn-customB` | `content/ui/panel.js` |
| `#ys-summaryText`, `#ys-infoRow`, `#ys-infoLabel`, `#ys-copyBtn`, `#ys-regenBtn`, `#ys-chatHistory`, `#ys-chatArea`, `#ys-chatInput`, `#ys-chatClearBtn`, `#ys-progress`, `#ys-error`, `#ys-errorRetryBtn`, `#ys-content-area` | `content/ui/panel.js`, `content/ui/ui-*.js`, `content/ui/tabs.js`, `content/ui/event-bridge.js` |
| `ytd-app` | `content/index.js:96` |
| `ytd-watch-flexy #secondary-inner`, `#secondary-inner`, `ytd-watch-flexy #secondary`, `#secondary`, `#related` | `content/ui/panel-placement.js` |
| `video` | `domain/ai-utils.js:48` (タイムスタンプseek) |
| `.ys-tab-row button`, `.ys-tab-btn`, `.ys-active`, `.ys-dot`, `.ys-md`, `.ys-action-btn` | `content/ui/panel.js`, `content/ui/tabs*.js`, `domain/markdown.js` |
| `.chat-msg`, `.chat-msg-body`, `.chat-msg-streaming`, `.ys-chat-edit-btn` | `content/ui/ui-chat.js` |
| `apiConfigs`, `prompt_`, `btnTitle_`, `btnApiConfig_`, `subtitleLang`, `fontSize`, `panelHeight`, `theme`, `latestSummary`, `latestCaptions` | `src/infrastructure/storage-core.js:11-22` (`K` 定数経由) |

**ハードコードされている URL/エンドポイント:**
- `INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"` (`domain/transcript-fetcher.js:15`)
- `INNERTUBE_CLIENT_VERSION = "20.10.38"` (`domain/transcript-fetcher.js:16`)
- 字幕取得の `USER_AGENT` 文字列 (`domain/transcript-fetcher.js:12-18`)
- OpenRouter用 `HTTP-Referer = "https://chrome.google.com/webstore"` (`domain/api-auth.js:34`)
- OpenRouter用 `X-Title = "YouTube Summary Extension"` (`domain/api-auth.js:35`)

**ハードコードされている プロンプト:**
- `getDefaultPrompt("summary")` = "あなたはYouTube動画の字幕を日本語で簡潔に要約するアシスタントです。箇条書きで要点をまとめてください。"
- `getDefaultPrompt("customA")` = "あなたはYouTube動画の字幕を日本語で分析するアシスタントです。内容を深く分析し、洞察を提供してください。"
- `getDefaultPrompt("customB")` = "あなたはYouTube動画の字幕について日本語で考察するアシスタントです。内容に対する批評や意見を述べてください。"
- `CHUNK_WORKER_PROMPT_SUFFIX = "\n\nこれは動画の一部分です。"` (`ai-map-reduce.js:17`)
- `FINAL_MERGE_PROMPT` / `FINAL_MERGE_INSTRUCTION` (`ai-map-reduce.js:19-26`)
- `metaContext` の "📋 動画情報" 等のラベル (`ai-utils.js:96-117`)

---

### 注記

- AGENTS.md は `findExistingApiKeyByHost` / `getProviderChipClass` / `getProviderLabel` / `PROVIDERS` 等が `options-logic.js` にあると記述していますが、実コードには**存在しません**（リファクタで削除済みの可能性）
- AGENTS.md は `scripting` パーミッションに言及していますが `manifest.json` には**記載なし**
- 実 API キーは `chrome.storage.local` の `apiConfigs[].apiKey` に**平文**で保存
- Manifest V3 だが Service Worker は**使用していない**（メッセージ処理は全て content script）