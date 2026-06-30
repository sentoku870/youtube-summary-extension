// ============================================================
//  eslint.config.js — flat config (ESLint v9)
//  recommended + Chrome extension 用の緩い設定
//  Prettier 競合ルールは eslint-config-prettier で無効化
//  A-3: import/no-cycle を有効化し、src 内の循環依存を CI で検出。
// ============================================================
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";

const sharedRules = {
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "no-empty": ["error", { allowEmptyCatch: true }],
  "prefer-const": "warn",
  "no-var": "off",
  "eqeqeq": ["error", "smart"],
  "no-console": "off"
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"]
  },
  js.configs.recommended,
  {
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly"
      }
    },
    rules: {
      ...sharedRules,
      // A-3: src 内の循環依存をエラーとして検出（depth=2 で自己ループと直接循環のみ）。
      // tests はモック注入で意図的に循環を作る場合があるため対象外。
      "import/no-cycle": ["error", { maxDepth: 2, ignoreExternal: true }]
    }
  },
  {
    files: ["src/content/**/*.js", "src/options/**/*.js", "src/popup/**/*.js"],
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        chrome: "readonly",
        // テスト用モック（各テストで global.X = {...} として動的注入）
        YsUI: "readonly",
        YsPanel: "readonly",
        YsTabs: "readonly"
      }
    },
    rules: {
      // テストはモック注入で意図的に循環を作る場合があるため循環チェックを無効化
      "import/no-cycle": "off"
    }
  },
  prettier
];
