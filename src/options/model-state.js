// ============================================================
//  model-state.js — モデル管理タブの共有状態
//  currentModelPool（モデル候補）と currentModelProviderKey を保持。
//  model-picker / model-form から bindModelState / bindFormState 経由で参照。
// ============================================================

let currentModelPool = [];
let currentModelProviderKey = "custom";

let getModelPool = null;
let getModelProviderKey = null;
let setModelPool = null;
let setModelProviderKey = null;

export function bindModelState(handlers) {
  if (handlers && typeof handlers.getPool === "function") {
    getModelPool = handlers.getPool;
  }
  if (handlers && typeof handlers.getProviderKey === "function") {
    getModelProviderKey = handlers.getProviderKey;
  }
}

export function bindFormState(handlers) {
  if (handlers && typeof handlers.setPool === "function") {
    setModelPool = handlers.setPool;
  }
  if (handlers && typeof handlers.setProviderKey === "function") {
    setModelProviderKey = handlers.setProviderKey;
  }
}

export function getPool() {
  return getModelPool ? getModelPool() : currentModelPool;
}

export function getProviderKey() {
  return getModelProviderKey ? getModelProviderKey() : currentModelProviderKey;
}

export function setPool(v) {
  if (setModelPool) setModelPool(v);
  currentModelPool = v;
}

export function setProviderKey(v) {
  if (setModelProviderKey) setModelProviderKey(v);
  currentModelProviderKey = v;
}
