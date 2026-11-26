// 홈 (C안): 검색창 → 카테고리 타일 6개 → 최근 저장 목록
import { h, icon } from '../ui/dom.js';
import { CATEGORIES, RECENT_LIMIT } from '../config.js';
import { sortByRecent } from '../items.js';
import { itemList } from '../ui/item-row.js';
import { header, searchPlaceholder, fab, emptyState } from './common.js';

export function renderHome(ctx) {
  const { items } = ctx;

  const counts = new Map(CATEGORIES.map((c) => [c.id, 0]));
  for (const item of items) counts.set(item.category, (counts.get(item.category) || 0) + 1);

  const tiles = h(
    'nav',
    { class: 'tiles', 'aria-label': '카테고리' },
    CATEGORIES.map((c) =>
      h(
        'button',
        { type: 'button', class: 'tile', onClick: () => ctx.go({ view: 'category', id: c.id }) },
        h('span', { class: 'tile-name' }, c.name),
        h('span', { class: 'tile-count' }, `${counts.get(c.id) || 0}개`),
      ),
    ),
  );

  const recent = sortByRecent(items).slice(0, RECENT_LIMIT);

  return [
    header({
      center: h('h1', { class: 'topbar-title' }, '저장소'),
      right: h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': '설정', onClick: () => ctx.go({ view: 'settings' }) },
        icon('gear'),
      ),
    }),
    h(
      'main',
      { class: 'page' },
      searchPlaceholder('검색 (준비 중)'),
      tiles,
      h('h2', { class: 'section-title' }, '최근 저장'),
      recent.length
        ? itemList(recent, { showCategory: true, onOpen: (item) => ctx.go({ view: 'detail', id: item.id }) })
        : emptyState('아직 저장한 항목이 없어요.\n오른쪽 아래 + 버튼으로 첫 메모를 남겨 보세요.'),
    ),
    fab(() => ctx.openAdd('')),
  ];
}
