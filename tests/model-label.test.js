// tests/model-label.test.js — モデル表示ラベル生成の単体テスト
const { buildModelDisplayLabel } = require("../src/options/model-label");

describe("buildModelDisplayLabel", () => {
  // ===== OpenRouter 経由（(O) プレフィックス） =====
  describe("OpenRouter provider", () => {
    test("name にプロバイダプレフィックスがある場合は除去して (O) を付ける", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "google/gemini-3.1-flash-lite",
        label: "Google: Gemini 3.1 Flash Lite"
      })).toBe("(O)Gemini 3.1 Flash Lite");
    });

    test("name がコロンを含まない場合は name をそのまま使う", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "openai/gpt-4o",
        label: "GPT-4o"
      })).toBe("(O)GPT-4o");
    });

    test("name が無い場合は id のスラッシュ以降を使う", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "deepseek/deepseek-chat"
      })).toBe("(O)deepseek-chat");
    });

    test("name もスラッシュも無い場合は id をそのまま使う", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "my-model"
      })).toBe("(O)my-model");
    });

    test("ユーザー提示の具体例（Gemini 3.1 Flash Lite）", () => {
      const result = buildModelDisplayLabel("openrouter", {
        id: "google/gemini-3.1-flash-lite",
        label: "OpenRouter Google: Gemini 3.1 Flash Lite"
      });
      // OpenRouter 公式の name は通常 "Google: ..." だが、先頭に "OpenRouter " が
      // 付く場合も最初のコロン以降を取ることで吸収
      expect(result).toBe("(O)Gemini 3.1 Flash Lite");
    });

    test("Anthropic の例", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "anthropic/claude-3.5-sonnet",
        label: "Anthropic: Claude 3.5 Sonnet"
      })).toBe("(O)Claude 3.5 Sonnet");
    });

    test("OpenAI の例", () => {
      expect(buildModelDisplayLabel("openrouter", {
        id: "openai/gpt-4o",
        label: "OpenAI: GPT-4o"
      })).toBe("(O)GPT-4o");
    });
  });

  // ===== 直API（id をそのまま） =====
  describe("direct API providers", () => {
    test("DeepSeek 直API は id をそのまま返す（ユーザー提示の例）", () => {
      expect(buildModelDisplayLabel("deepseek", {
        id: "deepseek-v4-flash"
      })).toBe("deepseek-v4-flash");
    });

    test("DeepSeek 直API で label があっても無視して id を返す", () => {
      expect(buildModelDisplayLabel("deepseek", {
        id: "deepseek-chat",
        label: "DeepSeek Chat"
      })).toBe("deepseek-chat");
    });

    test("OpenAI 直API は id をそのまま返す", () => {
      expect(buildModelDisplayLabel("openai", {
        id: "gpt-4o"
      })).toBe("gpt-4o");
    });

    test("OpenAI 直API で label があっても無視して id を返す", () => {
      expect(buildModelDisplayLabel("openai", {
        id: "gpt-4-turbo",
        label: "GPT-4 Turbo"
      })).toBe("gpt-4-turbo");
    });
  });

  // ===== カスタム =====
  describe("custom provider", () => {
    test("カスタムは id をそのまま返す", () => {
      expect(buildModelDisplayLabel("custom", {
        id: "my-custom-model"
      })).toBe("my-custom-model");
    });
  });

  // ===== エッジケース =====
  describe("edge cases", () => {
    test("モデルオブジェクトが空の場合は空文字", () => {
      expect(buildModelDisplayLabel("deepseek", {})).toBe("");
      expect(buildModelDisplayLabel("openrouter", {})).toBe("(O)");
    });

    test("モデルが null/undefined の場合は空/id無し扱い", () => {
      expect(buildModelDisplayLabel("deepseek", null)).toBe("");
      expect(buildModelDisplayLabel("deepseek", undefined)).toBe("");
    });
  });
});
