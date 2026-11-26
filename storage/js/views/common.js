// 여러 화면이 함께 쓰는 조각: 위쪽 제목 줄, 검색창 자리, + 버튼, 빈 목록 안내
import { h, icon } from '../ui/dom.js';

export function header({ left, center, right }) {
  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'topbar-side' }, left),
    h('div', { class: 'topbar-center' }, center),
    h('div', { class: 'topbar-side right' }, right),
  );
}

export function backButton(onClick, label = '돌아가기') {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, onClick }, icon('back'));
}

/**
 * 검색창. 글자를 칠 때마다 onInput만 부르고 화면 전체를 다시 그리지 않음 (키보드가 닫히지 않게)
 * @param {{ placeholder: string, value?: string, onInput: (q: string) => void }} opts
 */
export function searchBox({ placeholder, value = '', onInput }) {
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder,
    value,
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-label': placeholder,
  });
  const clear = h('button', { type: 'button', class: 'search-clear', 'aria-label': '검색어 지우기', hidden: !value }, icon('close'));
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    onInput(input.value);
  });
  input.addEventListener('keydown', (e) => {
    // 검색 버튼(엔터)을 누르면 키보드를 내려 결과를 보기 쉽게
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      input.blur();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    onInput('');
    input.focus();
  });
  return h('div', { class: 'search', role: 'search' }, icon('search'), input, clear);
}

export function fab(onClick) {
  return h('button', { type: 'button', class: 'fab', 'aria-label': '추가', onClick }, icon('plus'));
}

export function emptyState(text) {
  return h('p', { class: 'empty' }, text);
}
