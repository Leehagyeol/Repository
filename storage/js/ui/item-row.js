// 항목 목록. 모양은 config.js의 카테고리 layout을 따름:
//   'list' 목록 (작은 썸네일 + 제목) / 'card' 카드 (썸네일 크게, 2열) / 'grid' 사진 격자 (3열)
import { h, formatShortDate } from './dom.js';
import { categoryName } from '../config.js';
import { blobUrl, itemThumb } from './blob-url.js';

/** 목록에 보일 제목: 제목 → (사진이면) 키워드 → 사진 N장 */
function headline(item) {
  if (item.title) return item.title;
  if (item.type === 'photo') {
    if (item.keywords?.length) return item.keywords.join(', ');
    return `사진 ${item.photos?.length || 0}장`;
  }
  return '';
}

function thumbImg(item, className) {
  const blob = itemThumb(item);
  if (!blob) return null;
  return h('img', { class: className, src: blobUrl(blob), alt: '', loading: 'lazy', decoding: 'async' });
}

function photoCountBadge(item) {
  const n = item.photos?.length || 0;
  return n > 1 ? h('span', { class: 'badge-count', 'aria-label': `사진 ${n}장` }, `${n}`) : null;
}

function metaLine(item, showCategory) {
  const meta = [showCategory ? categoryName(item.category) : null, formatShortDate(item.createdAt)].filter(Boolean).join(' · ');
  // 제목 없는 사진은 키워드가 이미 제목 자리에 보이므로 다시 쓰지 않음
  const showKw = item.keywords?.length > 0 && !(item.type === 'photo' && !item.title);
  return h(
    'span',
    { class: 'row-meta' },
    h('span', {}, meta),
    showKw ? h('span', { class: 'row-kw' }, item.keywords.map((k) => `#${k}`).join(' ')) : null,
  );
}

// ── 목록 ──
function listRow(item, { showCategory, onOpen }) {
  const title = headline(item);
  const thumb = thumbImg(item, 'row-thumb');
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: thumb ? 'row has-thumb' : 'row', onClick: () => onOpen(item) },
      thumb ? h('span', { class: 'row-thumb-wrap' }, thumb, photoCountBadge(item)) : null,
      h(
        'span',
        { class: 'row-text' },
        title ? h('span', { class: 'row-title' }, title) : null,
        item.note ? h('span', { class: title ? 'row-body' : 'row-body solo' }, item.note) : null,
        metaLine(item, showCategory),
      ),
    ),
  );
}

// ── 카드 ──
function card(item, { showCategory, onOpen }) {
  const title = headline(item);
  const thumb = thumbImg(item, 'card-img');
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: thumb ? 'card' : 'card no-img', onClick: () => onOpen(item) },
      thumb ? h('span', { class: 'card-img-wrap' }, thumb, photoCountBadge(item)) : null,
      h(
        'span',
        { class: 'card-text' },
        title ? h('span', { class: 'card-title' }, title) : null,
        !thumb && item.note ? h('span', { class: 'card-body' }, item.note) : null,
        h('span', { class: 'row-meta' }, [showCategory ? categoryName(item.category) : null, formatShortDate(item.createdAt)].filter(Boolean).join(' · ')),
      ),
    ),
  );
}

// ── 격자 ──
function gridCell(item, { onOpen }) {
  const thumb = thumbImg(item, 'grid-img');
  const label = headline(item) || item.note || '';
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: 'grid-cell', 'aria-label': label || '항목', onClick: () => onOpen(item) },
      thumb || h('span', { class: 'grid-text' }, label),
      photoCountBadge(item),
    ),
  );
}

export function itemList(items, { layout = 'list', showCategory = false, onOpen }) {
  const opts = { showCategory, onOpen };
  if (layout === 'grid') return h('ul', { class: 'grid' }, items.map((it) => gridCell(it, opts)));
  if (layout === 'card') return h('ul', { class: 'cards' }, items.map((it) => card(it, opts)));
  return h('ul', { class: 'list' }, items.map((it) => listRow(it, opts)));
}
