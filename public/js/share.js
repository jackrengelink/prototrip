// Copy a ready-made trip message for the group chat.

import { h } from './dom.js';

const LABEL = 'Copy trip';
const COPIED_FOR_MS = 2500;

/** @param {()=>string} getMessage builds the message at click time, so it has the current group size */
export function copyButton(getMessage) {
  const label = h('span', {}, LABEL);

  async function copy() {
    try {
      await navigator.clipboard.writeText(getMessage());
      label.textContent = 'Copied';
    } catch {
      label.textContent = "Couldn't copy";
    }
    setTimeout(() => { label.textContent = LABEL; }, COPIED_FOR_MS);
  }

  return h('button', { class: 'btn-ghost', type: 'button', onClick: copy }, label);
}
