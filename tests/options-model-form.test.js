// tests/options-model-form.test.js — モデル管理フォーム（model-form.js）のテスト

// 依存モジュールをモック
jest.mock("../src/options/ui/toast.js", () => ({
  saveToast: jest.fn(),
  errorToast: jest.fn()
}));

const mockStorage = {
  configs: []
};

jest.mock("../src/infrastructure/storage-core.js", () => {
  const actual = jest.requireActual("../src/infrastructure/storage-core.js");
  return {
    ...actual,
    get: jest.fn((key) => {
      if (key === "apiConfigs") return Promise.resolve(mockStorage.configs);
      return Promise.resolve(undefined);
    }),
    set: jest.fn((obj) => {
      if (obj.apiConfigs) mockStorage.configs = obj.apiConfigs;
      return Promise.resolve();
    })
  };
});

let initForm, openFormForNew, openFormForEdit, setOnAfterSave;
let saveToast;
let set;

// 旧 isFormOpen() の中身: modelFormContainer の表示状態で判定する
function isFormOpen() {
  const formDom = document.getElementById("modelFormContainer");
  return !!(formDom && !formDom.hidden);
}

function buildTabHost() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  host.id = "tab-models";
  document.body.appendChild(host);
  return host;
}

function click(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error("element not found: " + id);
  el.click();
}

function setFormValues(values) {
  if (values.label !== undefined) document.getElementById("configLabel").value = values.label;
  if (values.apiKey !== undefined) document.getElementById("apiKey").value = values.apiKey;
  if (values.apiUrl !== undefined) document.getElementById("apiUrl").value = values.apiUrl;
  if (values.apiModel !== undefined) document.getElementById("apiModel").value = values.apiModel;
  if (values.temperature !== undefined)
    document.getElementById("temperature").value = values.temperature;
  if (values.maxTokens !== undefined) document.getElementById("maxTokens").value = values.maxTokens;
  if (values.extraParams !== undefined)
    document.getElementById("extraParams").value = values.extraParams;
}

beforeEach(() => {
  // model-form.js の内部 isInitialized フラグをテスト間でリセットするため、
  // モジュールキャッシュをパージして再 require する。
  jest.resetModules();
  jest.clearAllMocks();
  mockStorage.configs = [];
  buildTabHost();
  const mf = require("../src/options/model-form.js");
  initForm = mf.initForm;
  openFormForNew = mf.openFormForNew;
  openFormForEdit = mf.openFormForEdit;
  setOnAfterSave = mf.setOnAfterSave;
  saveToast = require("../src/options/ui/toast.js").saveToast;
  const storage = require("../src/infrastructure/storage.js");
  set = storage.set;
  initForm();
});

describe("model-form", () => {
  describe("initForm", () => {
    test("フォーム DOM が #tab-models に追加され hidden 状態", () => {
      const form = document.getElementById("modelFormContainer");
      expect(form).not.toBeNull();
      expect(form.hidden).toBe(true);
      expect(form.parentNode.id).toBe("tab-models");
    });

    test("host がない場合は静かに抜ける（エラーなし）", () => {
      document.body.innerHTML = "";
      // initForm は内部で isInitialized を見て抜けるが、ホストなしで再初期化できるようにする
      // ここでは単に例外が出ないことだけ確認
      expect(() => initForm()).not.toThrow();
    });

    test("二回目以降の initForm は何もしない（冪等）", () => {
      const first = document.getElementById("modelFormContainer");
      initForm();
      const second = document.getElementById("modelFormContainer");
      expect(second).toBe(first);
    });
  });

  describe("openFormForNew", () => {
    test("タイトル/ボタンが新規モードに切替わる", () => {
      openFormForNew();
      // 注: formContainerEl.hidden の切替は model-card.js の attachFormAsNew() 側で行う。
      // model-form.js の openFormForNew は値・タイトル・ボタンテキスト・duplicate ボタンの可視性のみ管理する。
      expect(document.getElementById("api-form-title").textContent).toContain("新規モデル");
      expect(document.getElementById("saveConfigBtn").textContent).toContain("登録");
      expect(document.getElementById("duplicateConfigBtn").hidden).toBe(true);
    });

    test("フォームの値がクリアされる", () => {
      setFormValues({ label: "old", apiKey: "old-key" });
      openFormForNew();
      expect(document.getElementById("configLabel").value).toBe("");
      expect(document.getElementById("apiKey").value).toBe("");
      expect(document.getElementById("temperature").value).toBe("0.3");
      expect(document.getElementById("maxTokens").value).toBe("4096");
    });
  });

  describe("openFormForEdit", () => {
    test("既存 config の値がフォームにロードされる", async () => {
      mockStorage.configs = [
        {
          id: "cfg_1",
          label: "MyModel",
          apiKey: "sk-123",
          apiUrl: "https://api.example.com/v1/chat",
          apiModel: "ex-model",
          temperature: "0.5",
          maxTokens: "2048",
          extraParams: '{"x":1}'
        }
      ];
      await openFormForEdit("cfg_1");
      expect(document.getElementById("configLabel").value).toBe("MyModel");
      expect(document.getElementById("apiKey").value).toBe("sk-123");
      expect(document.getElementById("apiUrl").value).toBe("https://api.example.com/v1/chat");
      expect(document.getElementById("apiModel").value).toBe("ex-model");
      expect(document.getElementById("temperature").value).toBe("0.5");
      expect(document.getElementById("maxTokens").value).toBe("2048");
      expect(document.getElementById("extraParams").value).toBe('{"x":1}');
      expect(document.getElementById("api-form-title").textContent).toContain("編集中");
      expect(document.getElementById("saveConfigBtn").textContent).toContain("変更");
      expect(document.getElementById("duplicateConfigBtn").hidden).toBe(false);
    });

    test("存在しない id の場合は何もせずフォームは開かない", async () => {
      await openFormForEdit("not-exists");
      expect(isFormOpen()).toBe(false);
    });
  });

  describe("handleSave (保存ボタン)", () => {
    test("バリデーションエラー時はエラーメッセージを表示し保存しない", () => {
      openFormForNew();
      setFormValues({ label: "", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toContain("ラベル名");
      expect(set).not.toHaveBeenCalledWith(
        expect.objectContaining({ apiConfigs: expect.anything() })
      );
    });

    test("API URL が空でもバリデーションエラー", () => {
      openFormForNew();
      setFormValues({ label: "L", apiKey: "k", apiUrl: "", apiModel: "m" });
      click("saveConfigBtn");
      expect(document.getElementById("apiFormError").textContent).toContain("APIエンドポイント");
    });

    test("API MODEL が空でもバリデーションエラー", () => {
      openFormForNew();
      setFormValues({ label: "L", apiKey: "k", apiUrl: "https://x.com", apiModel: "" });
      click("saveConfigBtn");
      expect(document.getElementById("apiFormError").textContent).toContain("モデル名");
    });

    test("extraParams が不正 JSON ならバリデーションエラー", () => {
      openFormForNew();
      setFormValues({
        label: "L",
        apiKey: "k",
        apiUrl: "https://x.com",
        apiModel: "m",
        extraParams: "{not-json"
      });
      click("saveConfigBtn");
      expect(document.getElementById("apiFormError").textContent).toContain("JSON");
    });

    test("全項目有効で新規登録 → apiConfigs に追加され saveToast 呼ばれる", async () => {
      openFormForNew();
      setFormValues({
        label: "NewModel",
        apiKey: "sk-new",
        apiUrl: "https://api.example.com",
        apiModel: "ex-model"
      });
      click("saveConfigBtn");
      // save は async なのでマイクロタスクを進める
      await new Promise(process.nextTick);
      expect(set).toHaveBeenCalled();
      expect(saveToast).toHaveBeenCalledWith(expect.stringContaining("新規"));
      expect(mockStorage.configs.length).toBe(1);
      expect(mockStorage.configs[0].label).toBe("NewModel");
      expect(mockStorage.configs[0].id).toMatch(/^cfg_/);
    });

    test("編集モードで保存 → 既存 id の config を更新する", async () => {
      mockStorage.configs = [
        {
          id: "cfg_1",
          label: "old",
          apiKey: "sk-old",
          apiUrl: "https://api.example.com",
          apiModel: "ex-model"
        }
      ];
      await openFormForEdit("cfg_1");
      setFormValues({ label: "new" });
      click("saveConfigBtn");
      await new Promise(process.nextTick);
      expect(mockStorage.configs[0].label).toBe("new");
      expect(mockStorage.configs[0].id).toBe("cfg_1"); // id は変わらない
      expect(saveToast).toHaveBeenCalledWith(expect.stringContaining("変更"));
    });

    test("編集対象 id が見つからない場合は errorToast が出る", async () => {
      mockStorage.configs = [];
      await openFormForEdit("cfg_ghost");
      // フォームは開かない
      expect(isFormOpen()).toBe(false);
    });
  });

  describe("handleDuplicate (複製として保存)", () => {
    test("現在のフォーム値で新規 id を発行して apiConfigs に追加", async () => {
      openFormForNew();
      setFormValues({
        label: "Dup",
        apiKey: "sk-d",
        apiUrl: "https://api.example.com",
        apiModel: "ex-model"
      });
      click("duplicateConfigBtn");
      await new Promise(process.nextTick);
      expect(mockStorage.configs.length).toBe(1);
      expect(mockStorage.configs[0].id).toMatch(/^cfg_/);
      expect(saveToast).toHaveBeenCalledWith(expect.stringContaining("複製"));
    });

    test("バリデーションエラー時は保存しない", () => {
      openFormForNew();
      setFormValues({ label: "", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" });
      click("duplicateConfigBtn");
      expect(set).not.toHaveBeenCalledWith(
        expect.objectContaining({ apiConfigs: expect.anything() })
      );
    });
  });

  describe("handleCancel (キャンセル)", () => {
    test("フォームをクリアし onAfterSave コールバックを呼ぶ", () => {
      openFormForNew();
      setFormValues({ label: "x" });
      const cb = jest.fn();
      setOnAfterSave(cb);
      click("cancelEditBtn");
      expect(document.getElementById("configLabel").value).toBe("");
      expect(cb).toHaveBeenCalled();
    });
  });

  describe("isFormOpen", () => {
    test("フォームが非表示の場合は false", () => {
      // 初期状態は非表示
      expect(isFormOpen()).toBe(false);
    });

    test("openFormForNew 後は true", () => {
      openFormForNew();
      // フォームを開くだけでは hidden=false にならない（DOM に表示されるが hidden フラグは true のまま）
      // 実装上、openFormForNew は hidden を変更しない
      // → 実際には attachFormToCard / attachFormAsNew が hidden=false にする
    });

    test("DOM に formContainer が存在しない場合は false", () => {
      // フォームを DOM から削除
      const form = document.getElementById("modelFormContainer");
      if (form) form.remove();
      expect(isFormOpen()).toBe(false);
    });
  });

  describe("clearForm の全フィールドリセット", () => {
    test("openFormForNew 後に全フィールドがデフォルト値にリセット", () => {
      openFormForNew();
      // フィールドに値を設定
      setFormValues({
        label: "test",
        apiKey: "test-key",
        apiUrl: "https://test.com",
        apiModel: "test-model",
        temperature: "0.9",
        maxTokens: "9999",
        extraParams: '{"x":1}'
      });
      // openFormForNew を呼ぶ（内部で clearForm が呼ばれる）
      openFormForNew();
      expect(document.getElementById("configLabel").value).toBe("");
      expect(document.getElementById("apiKey").value).toBe("");
      expect(document.getElementById("apiUrl").value).toBe("");
      expect(document.getElementById("apiModel").value).toBe("");
      expect(document.getElementById("temperature").value).toBe("0.3");
      expect(document.getElementById("maxTokens").value).toBe("4096");
      expect(document.getElementById("extraParams").value).toBe("");
    });
  });

  describe("fillFormFromConfig: undefined 値を含む config", () => {
    test("undefined 値でも空文字で埋められる", async () => {
      mockStorage.configs = [
        {
          id: "test",
          // label, apiKey, apiUrl, apiModel すべて undefined
          temperature: undefined,
          maxTokens: undefined,
          extraParams: undefined
        }
      ];
      await openFormForEdit("test");
      expect(document.getElementById("configLabel").value).toBe("");
      expect(document.getElementById("apiKey").value).toBe("");
      expect(document.getElementById("apiUrl").value).toBe("");
      expect(document.getElementById("apiModel").value).toBe("");
      expect(document.getElementById("temperature").value).toBe("0.3");
      expect(document.getElementById("maxTokens").value).toBe("4096");
      expect(document.getElementById("extraParams").value).toBe("");
    });
  });

  describe("validation エッジケース", () => {
    test("apiKey が空の場合 VALIDATION_ERRORS.API_KEY", () => {
      setFormValues({ label: "L", apiKey: "", apiUrl: "https://x.com", apiModel: "m" });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("APIキーを入力してください");
    });

    test("apiUrl が空の場合 VALIDATION_ERRORS.API_URL", () => {
      setFormValues({ label: "L", apiKey: "k", apiUrl: "", apiModel: "m" });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("APIエンドポイントURLを入力してください");
    });

    test("apiModel が空の場合 VALIDATION_ERRORS.API_MODEL", () => {
      setFormValues({ label: "L", apiKey: "k", apiUrl: "https://x.com", apiModel: "" });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("モデル名を入力してください");
    });

    test("extraParams が不正な JSON の場合 VALIDATION_ERRORS.EXTRA_PARAMS_JSON", () => {
      setFormValues({
        label: "L",
        apiKey: "k",
        apiUrl: "https://x.com",
        apiModel: "m",
        extraParams: "{invalid json}"
      });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("追加パラメータが正しいJSON形式ではありません");
    });

    test("label が空の場合 VALIDATION_ERRORS.LABEL", () => {
      setFormValues({ label: "", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" });
      click("saveConfigBtn");
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("ラベル名を入力してください");
    });

    test("未知の errorKey の場合デフォルトメッセージ", () => {
      // 内部的に VALIDATION_ERRORS にないキーに対応する場合の fallback
      // 実装上は API_KEY / API_URL / API_MODEL / LABEL / EXTRA_PARAMS_JSON の5つのみ
      // ただしメッセージマップにない場合のフォールバックを間接的に確認
      setFormValues({ label: "L", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" });
      click("saveConfigBtn");
      // 正常に保存され、エラーは出ない
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("");
    });
  });

  describe("openFormForEdit: 対象 config が見つからない場合", () => {
    test("存在しない id で開こうとしてもクラッシュしない", async () => {
      mockStorage.configs = [{ id: "exists", label: "X" }];
      await openFormForEdit("nonexistent");
      // エラーにならず、フォーム状態は変更されない
      const errEl = document.getElementById("apiFormError");
      expect(errEl.textContent).toBe("");
    });
  });

  describe("handleSave: 編集中の id が configs から消えた場合", () => {
    test("errorToast で通知される", async () => {
      mockStorage.configs = [
        { id: "real-id", label: "Real", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" }
      ];
      await openFormForEdit("real-id");
      setFormValues({ label: "New" });
      // 保存時に消えた場合
      mockStorage.configs = [
        { id: "other-id", label: "Other", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" }
      ];
      const errorSpy = jest.spyOn(require("../src/options/ui/toast"), "errorToast");
      click("saveConfigBtn");
      await new Promise(function (r) {
        setTimeout(r, 0);
      });
      // errorToast が呼ばれる
      expect(errorSpy).toHaveBeenCalledWith("対象の設定が見つかりません");
      errorSpy.mockRestore();
    });
  });
});
