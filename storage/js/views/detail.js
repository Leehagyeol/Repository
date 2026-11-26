// 상세: 링크(미리보기·열기) / 사진(넘기기 또는 순서대로 세로로) / 텍스트, 제목·키워드·메모, 수정·삭제
import { h, formatFullDate, linkify } from '../ui/dom.js';
import { categoryName, getCategory } from '../config.js';
import { blobUrl } from '../ui/blob-url.js';
import { createCarousel } from '../ui/carousel.js';
import { openViewer } from '../ui/viewer.js';
import { hostLabel, youtubeAppUrl } from '../links.js';
import { header, backButton } from './common.js';

function photoBlock(item) {
  const photos = item.photos || [];
  if (!photos.length) return null;

  // 레시피처럼 사진을 묶는 카테고리: 고른 순서대로 위에서 아래로
  if (photos.length > 1 && getCategory(item.category)?.groupPhotos) {
    return h(
      'ol',
      { class: 'photo-stack', 'aria-label': `사진 ${photos.length}장, 순서대로` },
      photos.map((p, i) =>
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'stack-item', 'aria-label': `${i + 1}번째 사진 크게 보기`, onClick: () => openViewer(photos, i) },
            h('img', { src: blobUrl(p.full || p.thumb), alt: '', loading: i > 1 ? 'lazy' : null, decoding: 'async', width: p.width || null, height: p.height || null }),
            h('span', { class: 'stack-num', 'aria-hidden': 'true' }, `${i + 1}`),
          ),
        ),
      ),
    );
  }

  return h(
    'div',
    { class: 'detail-photos' },
    createCarousel(photos, { className: 'car-inline', onTap: (i) => openViewer(photos, i) }).el,
    h('p', { class: 'detail-photo-hint' }, photos.length > 1 ? `사진 ${photos.length}장 · 좌우로 넘기기 · 누르면 크게` : '누르면 크게 보기'),
  );
}

function linkBlock(item) {
  if (item.type !== 'link' || !item.url) return null;
  const appUrl = youtubeAppUrl(item.url);
  const img = item.previewImage
    ? h(
        'a',
        { class: 'link-hero', href: appUrl || item.url, target: appUrl ? null : '_blank', rel: 'noopener noreferrer', 'aria-label': '원본 열기' },
        h('img', { src: blobUrl(item.previewImage), alt: '' }),
        item.linkKind === 'video' ? h('span', { class: 'play-badge big', 'aria-hidden': 'true' }, '▶') : null,
      )
    : null;

  return h(
    'div',
    { class: 'link-detail' },
    img,
    h('p', { class: 'link-source' }, item.siteName && item.siteName !== hostLabel(item.url) ? `${item.siteName} · ${hostLabel(item.url)}` : hostLabel(item.url)),
  );
}

function openButtons(item) {
  if (item.type !== 'link' || !item.url) return null;
  const appUrl = youtubeAppUrl(item.url);
  return h(
    'div',
    { class: 'open-row' },
    appUrl
      ? [
          h('a', { class: 'open-btn primary', href: appUrl }, 'YouTube 앱으로 열기'),
          h('a', { class: 'open-btn', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, '브라우저로 열기'),
        ]
      : h('a', { class: 'open-btn primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, '열기'),
  );
}

export function renderDetail(ctx) {
  const item = ctx.items.find((it) => it.id === ctx.route.id);

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
      linkBlock(item),
      photoBlock(item),
      item.title ? h('h1', { class: 'detail-title' }, item.title) : null,
      item.type === 'link' && item.description ? h('p', { class: 'link-desc' }, item.description) : null,
      openButtons(item),
      (item.keywords || []).length
        ? h(
            'ul',
            { class: 'detail-kw', 'aria-label': '키워드 (누르면 같은 키워드 항목만 보기)' },
            item.keywords.map((k) =>
              h('li', {}, h('button', { type: 'button', class: 'chip kw-filter-btn', onClick: () => ctx.filterByKeyword(k) }, `#${k}`)),
            ),
          )
        : null,
      item.note ? h('div', { class: 'detail-note' }, linkify(item.note)) : null,
      item.type === 'link' ? h('p', { class: 'link-url' }, item.url) : null,
      h('p', { class: 'detail-dates' }, dates.join('\n')),
      h('button', { type: 'button', class: 'danger-btn', onClick: () => ctx.removeItem(item) }, '삭제'),
    ),
  ];
}
