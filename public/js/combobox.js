// Type-ahead for From and To. The list hangs from the field, as wide as it, in the app's own style.

import { h } from './dom.js';

const TYPING_DELAY_MS = 180;

/**
 * @param {HTMLInputElement} input
 * @param {(query:string)=>Promise<{value:string,title:string,code?:string,hint?:string}[]>} suggest
 */
export function createCombobox(input, suggest) {
  const listId = `${input.id}-list`;
  const list = h('ul', { class: 'combo-list', id: listId, role: 'listbox', hidden: true });
  const box = input.closest('.combo');
  box.append(list);
  for (const [key, value] of Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId })) {
    input.setAttribute(key, value);
  }

  let items = [];
  let active = -1;
  let timer = null;
  let request = 0;

  const isOpen = () => !list.hidden;

  function close() {
    clearTimeout(timer);
    request += 1; // An answer that is still on its way must not reopen the list
    list.hidden = true;
    box.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function pick(item) {
    input.value = item.value;
    close();
  }

  function draw() {
    list.replaceChildren(...items.map((item, i) => h('li', {
      class: 'combo-option', id: `${listId}-${i}`, role: 'option', 'aria-selected': String(i === active),
      onMousedown: (e) => e.preventDefault(), // Keeps the field focused, so the click below still lands
      onClick: () => pick(item),
    },
    h('span', { class: 'combo-text' }, h('b', {}, item.title), item.hint ? h('small', {}, item.hint) : null),
    item.code ? h('span', { class: 'combo-code' }, item.code) : null)));
    const open = items.length > 0;
    list.hidden = !open;
    box.classList.toggle('is-open', open);
    input.setAttribute('aria-expanded', String(open));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${listId}-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  async function load(query) {
    request += 1;
    const asked = request;
    const found = await suggest(query);
    if (asked !== request) return;
    items = found;
    active = -1;
    draw();
  }

  function move(step) {
    if (!isOpen() || items.length === 0) return;
    active = (active + step + items.length) % items.length;
    draw();
  }

  input.addEventListener('focus', () => {
    input.select();
    load('');
  });
  input.addEventListener('click', () => { if (!isOpen()) load(''); });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(input.value.trim()), TYPING_DELAY_MS);
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (isOpen()) move(event.key === 'ArrowDown' ? 1 : -1);
      else load('');
    } else if (event.key === 'Escape' && isOpen()) {
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && isOpen() && active >= 0) {
      event.preventDefault();
      pick(items[active]);
    } else if (event.key === 'Enter' || event.key === 'Tab') close();
  });
}
