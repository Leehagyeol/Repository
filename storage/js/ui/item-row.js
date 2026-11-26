// 목록 한 줄. 1단계는 텍스트 항목: 제목 + 본문 앞 2줄.
import { h, formatShortDate } from './dom.js';
import { categoryName } from '../config.js';

export function itemRow(item, { showCategory = false, onOpen }) {
  const meta = [showCategory ? categoryName(item.category) : null, formatShortDate(item.createdAt)]
    .filter(Boolean)
    .join(' · ');

  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: 'row', onClick: () => onOpen(item) },
      item.title ? h('span', { class: 'row-title' }, item.title) : null,
      item.note ? h('span', { class: item.title ? 'row-body' : 'row-body solo' }, item.note) : null,
      h(
        'span',
        { class: 'row-meta' },
        h('span', {}, meta),
        (item.keywords || []).length
          ? h('span', { class: 'row-kw' }, item.keywords.map((k) => `#${k}`).join(' '))
          : null,
      ),
    ),
  );
}

export function itemList(items, opts) {
  return h('ul', { class: 'list' }, items.map((item) => itemRow(item, opts)));
}
