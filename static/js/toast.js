// @ts-check

import { TOAST_MS } from "./constants.js";
import { byId } from "./dom.js";

/**
 * @typedef {object} ToastAction
 * @property {string} label
 * @property {() => void} onClick
 */

const container = byId("toast", HTMLDivElement);
const text = byId("toast-text", HTMLSpanElement);
const actionButton = byId("toast-action", HTMLButtonElement);

/** @type {ReturnType<typeof setTimeout> | undefined} */
let hideTimer;
/** @type {ToastAction | null} */
let currentAction = null;

actionButton.addEventListener("click", () => {
  const action = currentAction;
  hide();
  action?.onClick();
});

function hide() {
  clearTimeout(hideTimer);
  currentAction = null;
  container.hidden = true;
}

/**
 * @param {string} message
 * @param {{ action?: ToastAction, durationMs?: number }} [options]
 */
export function showToast(message, { action, durationMs = TOAST_MS } = {}) {
  clearTimeout(hideTimer);
  currentAction = action ?? null;
  text.textContent = message;
  actionButton.hidden = !action;
  actionButton.textContent = action?.label ?? "";
  container.hidden = false;
  hideTimer = setTimeout(hide, durationMs);
}
