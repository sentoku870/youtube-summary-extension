// tests/options-model-flow.test.js — model-form + model-card の結合回帰テスト
// 保存・キャンセル後に別モデル編集/新規作成を行うとフォームが空になるバグの回帰テスト。
// 修正: detachForm でフォームを完全に取り外さず #tab-models に退避する（model-card.js parkForm）。

jest.mock("../src/options/ui/toast.js", () => ({
  saveToast: jest.fn(),
  errorToast: jest.fn()
}));

const mockStorage = { configs: [] };

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
let renderModelList, attachFormAsNew, attachFormToCard, detachForm;
let setFormContainer, bindCardHandlers, initCardEvents;

function buildTabHost() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  host.id = "tab-models";
  document.body.appendChild(host);
  const list = document.createElement("ul");
  list.id = "modelList";
  host.appendChild(list);
  return host;
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockStorage.configs = [];
  buildTabHost();
  const mf = require("../src/options/model-form.js");
  initForm = mf.initForm;
  openFormForNew = mf.openFormForNew;
  openFormForEdit = mf.openFormForEdit;
  setOnAfterSave = mf.setOnAfterSave;
  const card = require("../src/options/model-card.js");
  renderModelList = card.renderModelList;
  attachFormAsNew = card.attachFormAsNew;
  attachFormToCard = card.attachFormToCard;
  detachForm = card.detachForm;
  setFormContainer = card.setFormContainer;
  bindCardHandlers = card.bindCardHandlers;
  initCardEvents = card.initCardEvents;
  initForm();
  setFormContainer(document.getElementById("modelFormContainer"));
  initCardEvents();
  bindCardHandlers({
    onEdit: jest.fn(),
    onDuplicate: jest.fn(),
    onDelete: jest.fn(),
    onFormClosed: jest.fn()
  });
});

describe("保存・キャンセル後のフォーム再オープン", () => {
  test("保存後に別モデルを編集すると、値が正しくセットされる", async () => {
    mockStorage.configs = [
      { id: "a", label: "ModelA", apiKey: "k1", apiUrl: "https://a.com", apiModel: "a1" },
      { id: "b", label: "ModelB", apiKey: "k2", apiUrl: "https://b.com", apiModel: "b1" }
    ];

    // 実際の save ハンドラと同じ onAfterSave 相当を登録
    setOnAfterSave(function () {
      detachForm();
    });

    // モデル A を編集
    await renderModelList();
    await openFormForEdit("a");
    attachFormToCard("a");
    const form = document.getElementById("modelFormContainer");
    expect(form.querySelector("#configLabel").value).toBe("ModelA");

    // 保存をシミュレート（clearForm → onAfterSave → detachForm）
    form.querySelector("#configLabel").value = ""; // clearForm
    setOnAfterSave();

    // モデル B を編集
    await openFormForEdit("b");
    attachFormToCard("b");

    // 修正後：フォームが #tab-models に退避されているので、setVal が効く
    expect(form.querySelector("#configLabel").value).toBe("ModelB");
  });

  test("キャンセル後に新規作成すると、フォームが空になる", async () => {
    mockStorage.configs = [
      { id: "a", label: "ModelA", apiKey: "k1", apiUrl: "https://a.com", apiModel: "a1" }
    ];

    setOnAfterSave(function () {
      detachForm();
    });

    // モデル A を編集
    await renderModelList();
    await openFormForEdit("a");
    attachFormToCard("a");
    const form = document.getElementById("modelFormContainer");
    expect(form.querySelector("#configLabel").value).toBe("ModelA");

    // キャンセルをシミュレート
    form.querySelector("#configLabel").value = ""; // clearForm
    setOnAfterSave();

    // 新規作成モードを開く
    openFormForNew();
    attachFormAsNew();

    // 修正後：フォームが #tab-models に退避されているので、clearForm/setFormTitle/setSaveButtonText が効く
    expect(form.querySelector("#configLabel").value).toBe("");
    expect(form.querySelector("#api-form-title").textContent).toContain("新規モデル");
    expect(form.querySelector("#saveConfigBtn").textContent).toContain("登録");
  });
});
