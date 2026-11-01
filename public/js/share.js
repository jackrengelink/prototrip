// Share a trip: the phone's share sheet where there is one, otherwise copy a message. WhatsApp gets its own link.

import { h, extLink } from './dom.js';

const COPIED_FOR_MS = 2500;
const usesShareSheet = () => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** @param {()=>string} getMessage builds the message at click time, so it has the current group size */
export function shareButtons(getMessage) {
  const label = h('span', {}, 'Share trip');

  async function share() {
    const text = getMessage();
    try {
      if (usesShareSheet()) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        label.textContent = 'Message copied';
        setTimeout(() => { label.textContent = 'Share trip'; }, COPIED_FOR_MS);
      }
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (err.name !== 'AbortError') label.textContent = "Couldn't copy, try WhatsApp";
    }
  }

  return h('div', { class: 'share' },
    h('button', { class: 'btn-ghost', type: 'button', onClick: share }, label),
    extLink('https://wa.me/', {
      class: 'btn-ghost',
      onClick: (e) => { e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(getMessage())}`; },
    }, 'WhatsApp'));
}
