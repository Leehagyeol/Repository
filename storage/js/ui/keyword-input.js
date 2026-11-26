// 키워드 입력 칸: 엔터·쉼표·띄어쓰기로 칩이 되고, 전에 쓴 키워드를 추천합니다.
import { h, icon } from './dom.js';
import { normalizeKeyword } from '../items.js';

const MAX_SUGGESTIONS = 8;

/**
 * @param {string[]} initial 처음 넣어 둘 키워드
 * @param {() => string[]} getKnown 전에 쓴 키워드 목록(자주 쓴 순)
 */
export function createKeywordInput({ initial = [], getKnown, onChange }) {
  let keywords = [...initial];

  const input = h('input', {
    type: 'text',
    class: 'kw-input',
    id: 'kw-input',
    placeholder: '입력 후 띄어쓰기',
    enterkeyhint: 'done',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const box = h('div', { class: 'kw-box' });
  const suggestBox = h('div', { class: 'kw-suggest', hidden: true });
  const el = h('div', { class: 'kw' }, box, suggestBox);

  box.addEventListener('click', (e) => {
    if (e.target === box) input.focus();
  });

  const has = (word) => keywords.some((k) => k.toLowerCase() === word.toLowerCase());

  function add(raw) {
    const word = normalizeKeyword(raw);
    if (!word || has(word)) return;
    keywords.push(word);
    renderChips();
    onChange?.(keywords);
  }

  function removeAt(index) {
    keywords.splice(index, 1);
    renderChips();
    renderSuggest();
    onChange?.(keywords);
  }

  // 입력 칸은 그대로 두고 칩만 다시 그림 (입력 칸을 옮기면 아이폰 키보드가 닫힘)
  function renderChips() {
    for (const child of [...box.children]) if (child !== input) child.remove();
    if (!input.parentNode) box.append(input);
    input.before(
      ...keywords.map((k, i) =>
        h(
          'span',
          { class: 'chip' },
          h('span', { class: 'chip-text' }, k),
          h(
            'button',
            { type: 'button', class: 'chip-remove', 'aria-label': `${k} 키워드 빼기`, onClick: () => removeAt(i) },
            icon('close'),
          ),
        ),
      ),
    );
  }

  function renderSuggest() {
    if (document.activeElement !== input) {
      suggestBox.hidden = true;
      return;
    }
    const q = input.value.trim().toLowerCase();
    const list = (getKnown?.() || [])
      .filter((k) => !has(k) && (!q || k.toLowerCase().includes(q)))
      .slice(0, MAX_SUGGESTIONS);
    suggestBox.replaceChildren(
      ...list.map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: 'kw-suggest-item',
            // 누르는 순간 입력 칸의 포커스(키보드)가 사라지지 않게
            onPointerdown: (e) => e.preventDefault(),
            onClick: () => {
              add(k);
              input.value = '';
              renderSuggest();
              input.focus();
            },
          },
          k,
        ),
      ),
    );
    suggestBox.hidden = list.length === 0;
  }

  /** 입력 칸에 남은 글자를 칩으로 만듦 */
  function flush() {
    if (input.value.trim()) add(input.value);
    input.value = '';
    renderSuggest();
  }

  input.addEventListener('input', () => {
    const v = input.value;
    if (/[,\s]/.test(v)) {
      const parts = v.split(/[,\s]+/);
      const rest = parts.pop();
      parts.forEach(add);
      input.value = rest;
    }
    renderSuggest();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 한글 조합이 끝난 뒤의 값으로 칩을 만들기 위해 한 박자 늦춤
      setTimeout(flush, 0);
    } else if (e.key === 'Backspace' && input.value === '' && !e.isComposing && keywords.length) {
      removeAt(keywords.length - 1);
    }
  });

  input.addEventListener('focus', renderSuggest);
  input.addEventListener('blur', () => {
    flush();
    suggestBox.hidden = true;
  });

  renderChips();

  return {
    el,
    flush,
    getKeywords: () => [...keywords],
  };
}
