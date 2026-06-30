// ============================================================
//  model-form-dom.js — モデル管理タブ フォームの DOM 構築（ESM版）
//  Phase C-3: model-form.js から分割。
//  buildFormDom 関数と内部 DOM ヘルパ（el）のみを提供し、
//  値管理・保存ロジックは含まない（純粋な DOM 生成）。
// ============================================================

// ===== DOM ヘルパ =====
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

// ===== フォーム DOM を構築 =====
export function buildFormDom() {
  const wrap = document.createElement("div");
  wrap.className = "inline-form";
  wrap.id = "modelFormContainer";
  wrap.hidden = true;

  const header = el("div", "form-header");
  const title = el("h3", "form-title");
  title.id = "api-form-title";
  header.appendChild(title);
  wrap.appendChild(header);

  const fLabel = el("div", "field");
  const lblLabel = el("label", null, "ラベル名");
  lblLabel.setAttribute("for", "configLabel");
  const inputLabel = document.createElement("input");
  inputLabel.type = "text";
  inputLabel.id = "configLabel";
  inputLabel.placeholder = "例: DeepSeek Chat, OpenRouter GPT-4o";
  fLabel.appendChild(lblLabel);
  fLabel.appendChild(inputLabel);
  wrap.appendChild(fLabel);

  const fKey = el("div", "field");
  const lblKey = el("label", null, "APIキー");
  lblKey.setAttribute("for", "apiKey");
  const inputKey = document.createElement("input");
  inputKey.type = "password";
  inputKey.id = "apiKey";
  inputKey.placeholder = "sk-xxxxxxxx";
  fKey.appendChild(lblKey);
  fKey.appendChild(inputKey);
  wrap.appendChild(fKey);

  const fUrl = el("div", "field");
  const lblUrl = el("label", null, "APIエンドポイントURL");
  lblUrl.setAttribute("for", "apiUrl");
  const inputUrl = document.createElement("input");
  inputUrl.type = "url";
  inputUrl.id = "apiUrl";
  inputUrl.placeholder = "https://api.deepseek.com/v1/chat/completions";
  fUrl.appendChild(lblUrl);
  fUrl.appendChild(inputUrl);
  wrap.appendChild(fUrl);

  const fModel = el("div", "field");
  const lblModel = el("label", null, "モデル");
  lblModel.setAttribute("for", "apiModel");
  const inputModel = document.createElement("input");
  inputModel.type = "text";
  inputModel.id = "apiModel";
  inputModel.placeholder = "deepseek-chat";
  inputModel.autocomplete = "off";
  fModel.appendChild(lblModel);
  fModel.appendChild(inputModel);
  wrap.appendChild(fModel);

  const rowParams = el("div", "field-row");
  const fTemp = el("div", "field");
  const lblTemp = el("label", null, "Temperature");
  lblTemp.setAttribute("for", "temperature");
  const inputTemp = document.createElement("input");
  inputTemp.type = "number";
  inputTemp.id = "temperature";
  inputTemp.step = "0.1";
  inputTemp.min = "0";
  inputTemp.max = "2";
  inputTemp.placeholder = "0.3";
  fTemp.appendChild(lblTemp);
  fTemp.appendChild(inputTemp);
  fTemp.appendChild(el("div", "note", "0.0〜2.0"));
  const fMax = el("div", "field");
  const lblMax = el("label", null, "Max Tokens");
  lblMax.setAttribute("for", "maxTokens");
  const inputMax = document.createElement("input");
  inputMax.type = "number";
  inputMax.id = "maxTokens";
  inputMax.step = "1";
  inputMax.min = "1";
  inputMax.max = "32768";
  inputMax.placeholder = "4096";
  fMax.appendChild(lblMax);
  fMax.appendChild(inputMax);
  fMax.appendChild(el("div", "note", "最大トークン数"));
  rowParams.appendChild(fTemp);
  rowParams.appendChild(fMax);
  wrap.appendChild(rowParams);

  const fExtra = el("div", "field");
  const lblExtra = el("label", null, "追加パラメータ（JSON）");
  lblExtra.setAttribute("for", "extraParams");
  const inputExtra = document.createElement("textarea");
  inputExtra.id = "extraParams";
  inputExtra.rows = 2;
  inputExtra.placeholder = '{"thinking": {"type": "disabled"}}';
  fExtra.appendChild(lblExtra);
  fExtra.appendChild(inputExtra);
  fExtra.appendChild(el("div", "note", "APIリクエストボディに追加で送信するJSON"));
  wrap.appendChild(fExtra);

  const actions = el("div", "form-actions");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "saveConfigBtn";
  saveBtn.className = "primary";
  saveBtn.textContent = "保存";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.id = "cancelEditBtn";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "キャンセル";
  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.id = "duplicateConfigBtn";
  dupBtn.className = "secondary";
  dupBtn.textContent = "複製として保存";
  dupBtn.hidden = true;
  const errMsg = el("p", "form-error");
  errMsg.id = "apiFormError";
  errMsg.setAttribute("role", "alert");
  actions.appendChild(saveBtn);
  actions.appendChild(dupBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(errMsg);
  wrap.appendChild(actions);

  return wrap;
}