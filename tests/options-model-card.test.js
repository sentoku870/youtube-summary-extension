// tests/options-model-card.test.js — モデルカード（model-card.js）のテスト

const mockStorage = {
  configs: []
};

jest.mock("../src/infrastructure/storage.js", () => ({
  K: { API_CONFIGS: "apiConfigs" },
  get: jest.fn((key) => {
    if (key === "apiConfigs") return Promise.resolve(mockStorage.configs);
    return Promise.resolve(undefined);
  })
}));

let renderModelList, initCardEvents, setSearchKeyword;
let attachFormAsNew, attachFormToCard, detachForm, setFormContainer, bindCardHandlers;

function buildList() {
  document.body.innerHTML = "";
  const ul = document.createElement("ul");
  ul.id = "modelList";
  document.body.appendChild(ul);
  const form = document.createElement("div");
  form.id = "modelFormContainer";
  form.hidden = true;
  document.body.appendChild(form);
  return { ul, form };
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockStorage.configs = [];
  buildList();
  const card = require("../src/options/model-card.js");
  renderModelList = card.renderModelList;
  initCardEvents = card.initCardEvents;
  setSearchKeyword = card.setSearchKeyword;
  attachFormAsNew = card.attachFormAsNew;
  attachFormToCard = card.attachFormToCard;
  detachForm = card.detachForm;
  setFormContainer = card.setFormContainer;
  bindCardHandlers = card.bindCardHandlers;
  setFormContainer(document.getElementById("modelFormContainer"));
  initCardEvents();
  // ハンドラは何もしない noop で良い
  bindCardHandlers({
    onEdit: jest.fn(),
    onDuplicate: jest.fn(),
    onDelete: jest.fn(),
    onFormClosed: jest.fn()
  });
});

describe("model-card", () => {
  describe("renderModelList", () => {
    test("configs が空のとき『未登録』プレースホルダを表示", async () => {
      mockStorage.configs = [];
      await renderModelList();
      const empty = document.querySelector('[data-empty="true"]');
      expect(empty).not.toBeNull();
      expect(empty.textContent).toContain("まだモデルが登録されていません");
      const cta = document.getElementById("emptyAddBtn");
      expect(cta).not.toBeNull();
    });

    test("configs があるときカード描画される（label / model / host）", async () => {
      mockStorage.configs = [
        {
          id: "cfg_a",
          label: "Alpha",
          apiKey: "k1",
          apiUrl: "https://api.alpha.com/v1/chat/completions",
          apiModel: "alpha-1"
        }
      ];
      await renderModelList();
      const cards = document.querySelectorAll(".model-card");
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-config-id")).toBe("cfg_a");
      expect(cards[0].textContent).toContain("Alpha");
      expect(cards[0].textContent).toContain("alpha-1");
      expect(cards[0].textContent).toContain("api.alpha.com");
    });

    test("検索キーワードに一致しないカードは表示されない", async () => {
      mockStorage.configs = [
        { id: "1", label: "Alpha", apiKey: "k", apiUrl: "https://api.alpha.com", apiModel: "a" },
        { id: "2", label: "Beta", apiKey: "k", apiUrl: "https://api.beta.com", apiModel: "b" }
      ];
      await setSearchKeyword("beta");
      const cards = document.querySelectorAll(".model-card");
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-config-id")).toBe("2");
    });

    test("検索ヒット 0 のとき『一致なし』メッセージ", async () => {
      mockStorage.configs = [
        { id: "1", label: "Alpha", apiKey: "k", apiUrl: "https://api.alpha.com", apiModel: "a" }
      ];
      await setSearchKeyword("zzzz");
      const empty = document.querySelector('[data-empty="true"]');
      expect(empty).not.toBeNull();
      expect(empty.textContent).toContain("検索条件に一致するモデルがありません");
    });

    test("カードの edit/duplicate/delete ボタンに data-action と data-config-id", async () => {
      mockStorage.configs = [
        { id: "cfg_x", label: "X", apiKey: "k", apiUrl: "https://x.com", apiModel: "m" }
      ];
      await renderModelList();
      const editBtn = document.querySelector('button[data-action="edit"]');
      const dupBtn = document.querySelector('button[data-action="duplicate"]');
      const delBtn = document.querySelector('button[data-action="delete"]');
      expect(editBtn.getAttribute("data-config-id")).toBe("cfg_x");
      expect(dupBtn.getAttribute("data-config-id")).toBe("cfg_x");
      expect(delBtn.getAttribute("data-config-id")).toBe("cfg_x");
    });
  });

  describe("attachFormAsNew", () => {
    test("modelList 先頭に new-card プレースホルダを作ってフォームを attach", () => {
      const card1 = { id: "1", label: "A", apiKey: "k", apiUrl: "https://a.com", apiModel: "a" };
      mockStorage.configs = [card1];
      attachFormAsNew();
      const placeholder = document.querySelector(".model-card.new-card");
      expect(placeholder).not.toBeNull();
      const form = document.getElementById("modelFormContainer");
      expect(form.hidden).toBe(false);
      expect(placeholder.contains(form)).toBe(true);
    });
  });

  describe("attachFormToCard", () => {
    test("既存カードに .editing クラスを付与してフォームを append", async () => {
      mockStorage.configs = [
        { id: "cfg_y", label: "Y", apiKey: "k", apiUrl: "https://y.com", apiModel: "y" }
      ];
      await renderModelList();
      attachFormToCard("cfg_y");
      const card = document.querySelector('.model-card[data-config-id="cfg_y"]');
      expect(card.classList.contains("editing")).toBe(true);
      const form = document.getElementById("modelFormContainer");
      expect(form.hidden).toBe(false);
      expect(card.contains(form)).toBe(true);
    });

    test("存在しない id の場合は何もしない", async () => {
      mockStorage.configs = [
        { id: "cfg_y", label: "Y", apiKey: "k", apiUrl: "https://y.com", apiModel: "y" }
      ];
      await renderModelList();
      attachFormToCard("not-exists");
      const form = document.getElementById("modelFormContainer");
      expect(form.hidden).toBe(true);
    });
  });

  describe("detachForm", () => {
    test("フォームを非表示にしてカードから remove", async () => {
      mockStorage.configs = [
        { id: "cfg_y", label: "Y", apiKey: "k", apiUrl: "https://y.com", apiModel: "y" }
      ];
      await renderModelList();
      const form = document.getElementById("modelFormContainer");
      attachFormToCard("cfg_y");
      expect(form.parentNode).not.toBeNull();
      detachForm();
      // form は DOM から外れる（parentNode が null）し hidden になる
      expect(form.hidden).toBe(true);
      expect(form.parentNode).toBeNull();
      const card = document.querySelector('.model-card[data-config-id="cfg_y"]');
      expect(card.classList.contains("editing")).toBe(false);
    });

    test("onFormClosed コールバックが呼ばれる", async () => {
      const onFormClosed = jest.fn();
      bindCardHandlers({
        onEdit: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: jest.fn(),
        onFormClosed: onFormClosed
      });
      mockStorage.configs = [
        { id: "1", label: "A", apiKey: "k", apiUrl: "https://a.com", apiModel: "a" }
      ];
      await renderModelList();
      attachFormToCard("1");
      detachForm();
      expect(onFormClosed).toHaveBeenCalled();
    });
  });

  describe("イベント委譲", () => {
    test("edit ボタン click で onEdit(id) が呼ばれる", async () => {
      const onEdit = jest.fn();
      bindCardHandlers({
        onEdit: onEdit,
        onDuplicate: jest.fn(),
        onDelete: jest.fn()
      });
      mockStorage.configs = [
        { id: "cfg_e", label: "E", apiKey: "k", apiUrl: "https://e.com", apiModel: "e" }
      ];
      await renderModelList();
      document.querySelector('button[data-action="edit"]').click();
      expect(onEdit).toHaveBeenCalledWith("cfg_e");
    });

    test("delete ボタン click で onDelete(id) が呼ばれる", async () => {
      const onDelete = jest.fn();
      bindCardHandlers({
        onEdit: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: onDelete
      });
      mockStorage.configs = [
        { id: "cfg_d", label: "D", apiKey: "k", apiUrl: "https://d.com", apiModel: "d" }
      ];
      await renderModelList();
      document.querySelector('button[data-action="delete"]').click();
      expect(onDelete).toHaveBeenCalledWith("cfg_d");
    });

    test("duplicate ボタン click で onDuplicate(id) が呼ばれる", async () => {
      const onDuplicate = jest.fn();
      bindCardHandlers({
        onEdit: jest.fn(),
        onDuplicate: onDuplicate,
        onDelete: jest.fn()
      });
      mockStorage.configs = [
        { id: "cfg_dup", label: "D", apiKey: "k", apiUrl: "https://d.com", apiModel: "d" }
      ];
      await renderModelList();
      document.querySelector('button[data-action="duplicate"]').click();
      expect(onDuplicate).toHaveBeenCalledWith("cfg_dup");
    });

    test("空状態の + 最初のモデルを追加 ボタン click で #addModelBtn.click() が呼ばれる", async () => {
      // addBtn を DOM に追加
      const addBtn = document.createElement("button");
      addBtn.id = "addModelBtn";
      document.body.appendChild(addBtn);
      const clickSpy = jest.spyOn(addBtn, "click");
      mockStorage.configs = [];
      await renderModelList();
      document.getElementById("emptyAddBtn").click();
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
