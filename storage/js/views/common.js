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

/** 검색은 4단계에서 만듦. 지금은 자리만. */
export function searchPlaceholder(text) {
  return h(
    'div',
    { class: 'search' },
    icon('search'),
    h('input', {
      type: 'search',
      class: 'search-input',
      placeholder: text,
      disabled: true,
      'aria-label': '검색 (준비 중)',
    }),
  );
}

export function fab(onClick) {
  return h('button', { type: 'button', class: 'fab', 'aria-label': '추가', onClick }, icon('plus'));
}

export function emptyState(text) {
  return h('p', { class: 'empty' }, text);
}
