// 홈 (C안): 검색창 → 카테고리 타일 6개 → 최근 저장 목록
// 검색어를 넣거나 키워드 필터를 켜면 타일·최근 목록 대신 전체에서 찾은 결과를 보여 줌
import { h, icon } from '../ui/dom.js';
import { CATEGORIES, RECENT_LIMIT } from '../config.js';
import { sortByRecent } from '../items.js';
import { filterItems } from '../search.js';
import { itemList } from '../ui/item-row.js';
import { header, searchBox, fab, emptyState } from './common.js';

export function renderHome(ctx) {
  const { items } = ctx;
  const keyword = ctx.keywordFilter;
  const openItem = (item) => ctx.go({ view: 'detail', id: item.id });

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
  const normal = h(
    'div',
    {},
    tiles,
    h('h2', { class: 'section-title' }, '최근 저장'),
    recent.length
      ? itemList(recent, { showCategory: true, onOpen: openItem })
      : emptyState('아직 저장한 항목이 없어요.\n오른쪽 아래 + 버튼으로 첫 항목을 남겨 보세요.'),
  );
  const results = h('section', { class: 'results', 'aria-live': 'polite', hidden: true });

  function update(query) {
    ctx.setQuery('home', query);
    const active = Boolean(query.trim() || keyword);
    normal.hidden = active;
    results.hidden = !active;
    if (!active) return;
    const found = sortByRecent(filterItems(items, { query, keyword }));
    const label = keyword && !query.trim() ? `#${keyword}` : '검색 결과';
    results.replaceChildren(
      h('h2', { class: 'section-title' }, `${label} ${found.length}개`),
      found.length
        ? itemList(found, { showCategory: true, onOpen: openItem })
        : emptyState('찾는 항목이 없어요.\n다른 낱말이나 키워드로 찾아보세요.'),
    );
  }

  // 키워드 필터 표시줄
  const filterBar = keyword
    ? h(
        'div',
        { class: 'filter-bar' },
        h('span', { class: 'filter-label' }, '키워드'),
        h('span', { class: 'chip static' }, `#${keyword}`),
        h('button', { type: 'button', class: 'filter-clear', onClick: () => ctx.setKeywordFilter(null) }, '필터 해제'),
      )
    : null;

  // 백업 알림 (마지막 백업 후 30일)
  const reminderText = ctx.backupReminder();
  const reminder = reminderText
    ? h(
        'div',
        { class: 'notice', role: 'note' },
        h('p', { class: 'notice-text' }, reminderText, h('br'), '폰을 잃어버려도 되찾을 수 있게 백업해 두세요.'),
        h(
          'div',
          { class: 'notice-actions' },
          h('button', { type: 'button', class: 'notice-btn primary', onClick: () => ctx.go({ view: 'settings' }) }, '백업하기'),
          h('button', { type: 'button', class: 'notice-btn', onClick: () => ctx.dismissReminder() }, '나중에'),
        ),
      )
    : null;

  const search = searchBox({ placeholder: '전체에서 검색', value: ctx.getQuery('home'), onInput: update });
  update(ctx.getQuery('home'));

  return [
    header({
      center: h('h1', { class: 'topbar-title' }, '저장소'),
      right: h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': '설정', onClick: () => ctx.go({ view: 'settings' }) },
        icon('gear'),
      ),
    }),
    h('main', { class: 'page' }, reminder, search, filterBar, normal, results),
    fab(() => ctx.openAdd('')),
  ];
}
