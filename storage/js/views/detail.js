// 상세: (사진) 크게 보기·좌우 넘기기, 제목, 키워드, 본문(줄바꿈·링크 보존), 수정·삭제
import { h, formatFullDate, linkify } from '../ui/dom.js';
import { categoryName } from '../config.js';
import { createCarousel } from '../ui/carousel.js';
import { openViewer } from '../ui/viewer.js';
import { header, backButton } from './common.js';

export function renderDetail(ctx) {
  const item = ctx.items.find((it) => it.id === ctx.route.id);
  const photos = item.photos || [];

  const dates = [`저장 ${formatFullDate(item.createdAt)}`];
  if (item.updatedAt && item.updatedAt - item.createdAt > 60 * 1000) dates.push(`수정 ${formatFullDate(item.updatedAt)}`);

  return [
    header({
      left: backButton(() => ctx.back()),
      center: h('span', { class: 'topbar-title small' }, categoryName(item.category)),
      right: h('button', { type: 'button', class: 'text-btn', onClick: () => ctx.openEdit(item) }, '수정'),
    }),
    h(
      'main',
      { class: 'page detail' },
      photos.length
        ? h(
            'div',
            { class: 'detail-photos' },
            createCarousel(photos, { className: 'car-inline', onTap: (i) => openViewer(photos, i) }).el,
            h('p', { class: 'detail-photo-hint' }, photos.length > 1 ? `사진 ${photos.length}장 · 좌우로 넘기기 · 누르면 크게` : '누르면 크게 보기'),
          )
        : null,
      item.title ? h('h1', { class: 'detail-title' }, item.title) : null,
      (item.keywords || []).length
        ? h('ul', { class: 'detail-kw', 'aria-label': '키워드' }, item.keywords.map((k) => h('li', { class: 'chip static' }, k)))
        : null,
      item.note ? h('div', { class: 'detail-note' }, linkify(item.note)) : null,
      h('p', { class: 'detail-dates' }, dates.join('\n')),
      h('button', { type: 'button', class: 'danger-btn', onClick: () => ctx.removeItem(item) }, '삭제'),
    ),
  ];
}
