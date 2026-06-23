// ============================================================
//  eslint.config.js — flat config (ESLint v9)
//  recommended + Chrome extension 用の緩い設定
//  Prettier 競合ルールは eslint-config-prettier で無効化
// ============================================================
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

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
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly"
      }
    },
    rules: sharedRules
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
    }
  },
  prettier
];
