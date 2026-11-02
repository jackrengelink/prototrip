// Copy a ready-made trip message for the group chat.
// Browsers differ: some refuse the clipboard API (in-app browsers, some phones), so there are two fallbacks.

import { h } from './dom.js';

const LABEL = 'Copy trip';
const COPIED_FOR_MS = 2500;

/** The older way to copy: select text in a hidden box. Works where the clipboard API is blocked. */
function copyWithSelection(text) {
  const box = h('textarea', { class: 'copy-buffer', readonly: true, 'aria-hidden': 'true' });
  box.value = text;
  document.body.append(box);
  box.select();
  box.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithSelection(text);
  }
}

/** Last resort: show the message, already selected, so it can be copied by hand. */
function showMessage(holder, text) {
  const box = h('textarea', { class: 'copy-fallback', readonly: true, rows: String(text.split('\n').length + 1), 'aria-label': 'Trip message to copy' });
  box.value = text;
  holder.replaceChildren(h('p', { class: 'copy-fallback-note' }, "Your browser won't let ProtoTrip copy. Select the message and copy it yourself:"), box);
  holder.hidden = false;
  box.focus();
  box.select();
}

/**
 * @param {()=>string} getMessage builds the message at click time, so it has the current group size
 * @returns {{button:HTMLElement, fallback:HTMLElement}} place the fallback where the message may appear
 */
export function copyButton(getMessage) {
  const label = h('span', {}, LABEL);
  const fallback = h('div', { class: 'copy-fallback-wrap', hidden: true });

  async function copy() {
    const text = getMessage();
    if (await copyText(text)) {
      fallback.hidden = true;
      label.textContent = 'Copied';
      setTimeout(() => { label.textContent = LABEL; }, COPIED_FOR_MS);
    } else showMessage(fallback, text);
  }

  return { button: h('button', { class: 'btn-ghost', type: 'button', onClick: copy }, label), fallback };
}
