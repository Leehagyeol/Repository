// 카테고리 화면: 제목 "레시피 ▾"를 누르면 다른 카테고리로 바로 옮기는 메뉴가 열림
import { h, icon } from '../ui/dom.js';
import { CATEGORIES, getCategory } from '../config.js';
import { sortItems } from '../items.js';
import { itemList } from '../ui/item-row.js';
import { header, backButton, searchPlaceholder, fab, emptyState } from './common.js';

export function renderCategory(ctx) {
  const cat = getCategory(ctx.route.id);
  const list = sortItems(ctx.items.filter((it) => it.category === cat.id));

  const counts = new Map();
  for (const item of ctx.items) counts.set(item.category, (counts.get(item.category) || 0) + 1);

  // ── 카테고리 전환 메뉴 ──
  const menu = h(
    'div',
    { class: 'cat-menu', id: 'cat-menu', hidden: true },
    h('div', { class: 'cat-menu-backdrop', onClick: () => toggle(false) }),
    h(
      'ul',
      { class: 'cat-menu-list', role: 'menu' },
      CATEGORIES.map((c) =>
        h(
          'li',
          { role: 'none' },
          h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              class: 'cat-menu-item',
              'aria-current': c.id === cat.id ? 'true' : null,
              onClick: () => {
                toggle(false);
                if (c.id !== cat.id) ctx.go({ view: 'category', id: c.id });
              },
            },
            h('span', { class: 'cat-menu-name' }, c.name),
            h('span', { class: 'cat-menu-count' }, `${counts.get(c.id) || 0}`),
            c.id === cat.id ? icon('check') : h('span', { class: 'icon' }),
          ),
        ),
      ),
    ),
  );

  const titleBtn = h(
    'button',
    {
      type: 'button',
      class: 'topbar-title title-btn',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-controls': 'cat-menu',
      onClick: () => toggle(menu.hidden),
    },
    cat.name,
    h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'),
  );

  function toggle(open) {
    if (open) {
      // 제목 줄 바로 아래에 펼침 (Safari 탭 안내가 위에 있어도 맞게)
      const bar = titleBtn.closest('.topbar').getBoundingClientRect();
      menu.querySelector('.cat-menu-list').style.top = `${Math.max(0, bar.bottom) + 6}px`;
    }
    menu.hidden = !open;
    titleBtn.setAttribute('aria-expanded', String(open));
  }

  return [
    header({
      left: backButton(() => ctx.go({ view: 'home' }), '홈으로'),
      center: titleBtn,
    }),
    menu,
    h(
      'main',
      { class: 'page' },
      searchPlaceholder(`${cat.name}에서 검색 (준비 중)`),
      list.length
        ? itemList(list, { onOpen: (item) => ctx.go({ view: 'detail', id: item.id }) })
        : emptyState(`${cat.name}에 저장한 항목이 없어요.\n+ 버튼으로 추가해 보세요.`),
    ),
    fab(() => ctx.openAdd(cat.id)),
  ];
}
