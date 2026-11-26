// 항목 목록. 모양은 config.js의 카테고리 layout을 따름:
//   'list' 목록 (작은 썸네일 + 제목) / 'card' 카드 (썸네일 크게, 2열) / 'grid' 사진 격자 (3열)
// 링크: 영상은 썸네일 + ▶ + 제목, 웹페이지는 대표 이미지 + 제목 + 도메인
// 고정(핀) 항목은 노란 핀 표시. 선택 모드에서는 누르면 열지 않고 선택/해제.
import { h, icon, formatShortDate } from './dom.js';
import { categoryName } from '../config.js';
import { blobUrl, itemThumb } from './blob-url.js';
import { hostLabel } from '../links.js';

/** 목록에 보일 제목: 제목 → (사진이면 키워드 → 사진 N장) / (링크면 도메인) */
function headline(item) {
  if (item.title) return item.title;
  if (item.type === 'photo') {
    if (item.keywords?.length) return item.keywords.join(', ');
    return `사진 ${item.photos?.length || 0}장`;
  }
  if (item.type === 'link') return hostLabel(item.url) || '링크';
  return '';
}

/** 링크 출처: 영상은 채널(YouTube · ○○), 웹페이지는 도메인 */
function linkSource(item) {
  if (item.type !== 'link') return null;
  return item.linkKind === 'video' ? item.siteName || hostLabel(item.url) : hostLabel(item.url);
}

const isVideo = (item) => item.type === 'link' && item.linkKind === 'video';

function thumbImg(item, className) {
  const blob = itemThumb(item);
  if (!blob) return null;
  return h('img', { class: className, src: blobUrl(blob), alt: '', loading: 'lazy', decoding: 'async' });
}

function pinMark(item, className = 'pin-mark') {
  if (!item.pinned) return null;
  const el = icon('pin');
  el.classList.add(className);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', '고정됨');
  return el;
}

function overlays(item) {
  const n = item.photos?.length || 0;
  return [
    n > 1 ? h('span', { class: 'badge-count', 'aria-label': `사진 ${n}장` }, `${n}`) : null,
    isVideo(item) ? h('span', { class: 'play-badge', 'aria-label': '영상' }, '▶') : null,
  ];
}

function metaLine(item, showCategory) {
  const meta = [showCategory ? categoryName(item.category) : null, linkSource(item), formatShortDate(item.createdAt)]
    .filter(Boolean)
    .join(' · ');
  // 제목 없는 사진은 키워드가 이미 제목 자리에 보이므로 다시 쓰지 않음
  const showKw = item.keywords?.length > 0 && !(item.type === 'photo' && !item.title);
  return h(
    'span',
    { class: 'row-meta' },
    h('span', { class: 'row-meta-main' }, meta),
    showKw ? h('span', { class: 'row-kw' }, item.keywords.map((k) => `#${k}`).join(' ')) : null,
  );
}

/** 선택 모드면 동그라미 체크 표시 */
function selMark(sel) {
  return sel ? h('span', { class: 'sel-mark', 'aria-hidden': 'true' }, icon('check')) : null;
}

/** 버튼 공통: 선택 모드면 누를 때 선택/해제, 아니면 열기 */
function itemButton(item, className, { onOpen, sel }, ...children) {
  const selected = sel?.ids.has(item.id);
  const btn = h(
    'button',
    {
      type: 'button',
      class: `${className}${sel ? ' selectable' : ''}${selected ? ' selected' : ''}`,
      'aria-pressed': sel ? String(Boolean(selected)) : null,
    },
    ...children,
  );
  btn.addEventListener('click', () => {
    if (sel) {
      const on = sel.toggle(item.id);
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    } else {
      onOpen(item);
    }
  });
  return btn;
}

// ── 목록 ──
function listRow(item, opts) {
  const title = headline(item);
  const thumb = thumbImg(item, 'row-thumb');
  return h(
    'li',
    {},
    itemButton(
      item,
      thumb ? 'row has-thumb' : 'row',
      opts,
      selMark(opts.sel),
      thumb ? h('span', { class: 'row-thumb-wrap' }, thumb, overlays(item)) : null,
      h(
        'span',
        { class: 'row-text' },
        title ? h('span', { class: 'row-title' }, pinMark(item, 'pin-inline'), title) : null,
        item.note ? h('span', { class: title ? 'row-body' : 'row-body solo' }, title ? null : pinMark(item, 'pin-inline'), item.note) : null,
        metaLine(item, opts.showCategory),
      ),
    ),
  );
}

// ── 카드 ──
function card(item, opts) {
  const title = headline(item);
  const thumb = thumbImg(item, 'card-img');
  const meta = [opts.showCategory ? categoryName(item.category) : null, linkSource(item), formatShortDate(item.createdAt)]
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    {},
    itemButton(
      item,
      thumb ? 'card' : 'card no-img',
      opts,
      selMark(opts.sel),
      pinMark(item, 'pin-corner'),
      thumb ? h('span', { class: 'card-img-wrap' }, thumb, overlays(item)) : null,
      h(
        'span',
        { class: 'card-text' },
        title ? h('span', { class: 'card-title' }, title) : null,
        !thumb && item.note ? h('span', { class: 'card-body' }, item.note) : null,
        h('span', { class: 'row-meta' }, meta),
      ),
    ),
  );
}

// ── 격자 ──
function gridCell(item, opts) {
  const thumb = thumbImg(item, 'grid-img');
  const label = headline(item) || item.note || '';
  const btn = itemButton(
    item,
    'grid-cell',
    opts,
    thumb || h('span', { class: 'grid-text' }, label),
    overlays(item),
    pinMark(item, 'pin-corner'),
    selMark(opts.sel),
  );
  btn.setAttribute('aria-label', `${item.pinned ? '고정됨, ' : ''}${label || '항목'}`);
  return h('li', {}, btn);
}

/**
 * @param {Array} items
 * @param {object} o
 * @param {'list'|'card'|'grid'} [o.layout]
 * @param {boolean} [o.showCategory]
 * @param {(item) => void} o.onOpen
 * @param {{ ids: Set<string>, toggle: (id: string) => boolean }} [o.selection] 있으면 선택 모드
 */
export function itemList(items, { layout = 'list', showCategory = false, onOpen, selection = null }) {
  const opts = { showCategory, onOpen, sel: selection };
  const cls = selection ? ' selecting' : '';
  if (layout === 'grid') return h('ul', { class: `grid${cls}` }, items.map((it) => gridCell(it, opts)));
  if (layout === 'card') return h('ul', { class: `cards${cls}` }, items.map((it) => card(it, opts)));
  return h('ul', { class: `list${cls}` }, items.map((it) => listRow(it, opts)));
}
