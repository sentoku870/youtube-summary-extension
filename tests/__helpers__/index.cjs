// tests/__helpers__/index.js — 共通テストヘルパのエントリポイント
const chromeMock = require("./chrome-mock.cjs");
const stateReset = require("./state-reset.cjs");
const domMock = require("./dom-mock.cjs");

module.exports = {
  ...chromeMock,
  ...stateReset,
  ...domMock
};