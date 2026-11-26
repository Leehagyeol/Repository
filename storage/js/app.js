// 앱 시작점: 화면 전환, 데이터 불러오기·저장, 마지막 화면 기억, 서비스 워커 등록
import { KEY_PREFIX, UNDO_SECONDS, getCategory, categoryName } from './config.js';
import { getAllItems, putItem, deleteItem } from './db.js';
import { newItem, keywordList } from './items.js';
import { h } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { openItemSheet, isSheetOpen, closeItemSheet } from './ui/add-sheet.js';
import { renderHome } from './views/home.js';
import { renderCategory } from './views/category.js';
import { renderDetail } from './views/detail.js';
import { renderSettings } from './views/settings.js';

const LAST_VIEW_KEY = `${KEY_PREFIX}last-view`;
const HIDE_BANNER_KEY = `${KEY_PREFIX}hide-install-banner`;

const appEl = document.getElementById('app');
let items = [];
let route = { view: 'home' };
const scrollMemory = new Map();

// ───────── 주소(#) ↔ 화면 ─────────
// #/  홈 · #/c/recipe  카테고리 · #/i/<id>  상세 · #/settings  설정
function toHash(r) {
  if (r.view === 'category') return `#/c/${r.id}`;
  if (r.view === 'detail') return `#/i/${r.id}`;
  if (r.view === 'settings') return '#/settings';
  return '#/';
}

function fromHash(hash) {
  const [, kind, id] = (hash || '').replace(/^#/, '').split('/');
  if (kind === 'c' && id) return { view: 'category', id: decodeURIComponent(id) };
  if (kind === 'i' && id) return { view: 'detail', id: decodeURIComponent(id) };
  if (kind === 'settings') return { view: 'settings' };
  return { view: 'home' };
}

const routeKey = (r) => toHash(r);

// 마지막에 보던 화면(홈 또는 카테고리)을 기억 → 앱을 다시 열면 거기서 시작
function saveLastView(r) {
  if (r.view !== 'home' && r.view !== 'category') return;
  try {
    localStorage.setItem(LAST_VIEW_KEY, toHash(r));
  } catch {
    /* 저장 못 해도 앱은 동작 */
  }
}

function lastView() {
  try {
    const r = fromHash(localStorage.getItem(LAST_VIEW_KEY) || '#/');
    if (r.view === 'category' && getCategory(r.id)) return r;
  } catch {
    /* 무시 */
  }
  return { view: 'home' };
}

/** 없는 카테고리·지워진 항목을 가리키면 알맞은 화면으로 바꿈 */
function validRoute(r) {
  if (r.view === 'category' && !getCategory(r.id)) return { view: 'home' };
  if (r.view === 'detail' && !items.some((it) => it.id === r.id)) return lastView();
  return r;
}

function go(next, { restoreScroll = false } = {}) {
  scrollMemory.set(routeKey(route), window.scrollY);
  closeItemSheet();
  route = validRoute(next);
  history.replaceState(null, '', toHash(route));
  saveLastView(route);
  render();
  const y = restoreScroll ? scrollMemory.get(routeKey(route)) || 0 : 0;
  window.scrollTo(0, y);
}

/** ‹ 버튼·왼쪽 끝 밀기: 카테고리 → 홈, 상세·설정 → 마지막으로 보던 목록 */
function back() {
  if (route.view === 'home') return;
  go(route.view === 'category' ? { view: 'home' } : lastView(), { restoreScroll: true });
}

// ───────── 데이터 ─────────
async function addItem(fields) {
  const item = newItem({ type: 'text', ...fields });
  await putItem(item);
  items.push(item);
  render();
  showToast(`${categoryName(item.category)}에 저장했어요`);
}

async function updateItem(item, fields) {
  const updated = { ...item, ...fields, updatedAt: Date.now() };
  await putItem(updated);
  items = items.map((it) => (it.id === item.id ? updated : it));
  render();
}

async function removeItem(item) {
  try {
    await deleteItem(item.id);
  } catch (err) {
    console.error(err);
    showToast('삭제하지 못했어요');
    return;
  }
  items = items.filter((it) => it.id !== item.id);
  back();
  showToast('삭제했어요', {
    actionLabel: '되돌리기',
    seconds: UNDO_SECONDS,
    onAction: async () => {
      await putItem(item);
      items.push(item);
      render();
    },
  });
}

const knownKeywords = () => keywordList(items);

const ctx = {
  get items() {
    return items;
  },
  get route() {
    return route;
  },
  go,
  back,
  openAdd(defaultCategory) {
    openItemSheet({ mode: 'add', defaultCategory, getKnownKeywords: knownKeywords, onSave: addItem });
  },
  openEdit(item) {
    openItemSheet({
      mode: 'edit',
      item,
      getKnownKeywords: knownKeywords,
      onSave: (fields) => updateItem(item, fields),
    });
  },
  removeItem,
};

// ───────── 그리기 ─────────
const VIEWS = {
  home: renderHome,
  category: renderCategory,
  detail: renderDetail,
  settings: renderSettings,
};

function render() {
  route = validRoute(route);
  appEl.replaceChildren(...VIEWS[route.view](ctx));
}

// ───────── 왼쪽 끝에서 오른쪽으로 밀면 뒤로 ─────────
function setupEdgeSwipe() {
  let start = null;
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= 24 && route.view !== 'home' && !isSheetOpen() ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchend',
    (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx > 70 && dy < 60) back();
    },
    { passive: true },
  );
}

// ───────── Safari 탭에서 열렸을 때 안내 ─────────
function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function showInstallBanner() {
  try {
    if (sessionStorage.getItem(HIDE_BANNER_KEY)) return;
  } catch {
    /* 무시 */
  }
  const banner = h(
    'div',
    { class: 'install-banner', role: 'note' },
    h(
      'p',
      {},
      h('strong', {}, '홈 화면 앱으로 써 주세요'),
      h('br'),
      '공유 버튼 → 홈 화면에 추가 후 그 아이콘으로 열어 주세요. Safari에서 저장한 내용은 홈 화면 앱에 보이지 않을 수 있어요.',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'text-btn',
        onClick: () => {
          banner.remove();
          try {
            sessionStorage.setItem(HIDE_BANNER_KEY, '1');
          } catch {
            /* 무시 */
          }
        },
      },
      '닫기',
    ),
  );
  appEl.before(banner);
}

// ───────── 서비스 워커 (오프라인에서도 열리게) ─────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  // 새 버전이 설치되면 한 번 새로고침해서 새 파일로 바꿈 (처음 설치 때는 하지 않음)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || isSheetOpen()) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('서비스 워커 등록 실패', err));
}

// ───────── 시작 ─────────
async function start() {
  if (!isStandalone()) showInstallBanner();
  registerServiceWorker();
  setupEdgeSwipe();

  try {
    items = await getAllItems();
  } catch (err) {
    console.error(err);
    appEl.replaceChildren(
      h('p', { class: 'empty' }, '저장소를 열지 못했어요.\n개인정보 보호 브라우징을 끄거나, 홈 화면 앱으로 다시 열어 주세요.'),
    );
    return;
  }

  // 주소에 화면이 적혀 있으면(새로고침) 그 화면, 아니면 마지막에 보던 화면
  route = location.hash && location.hash !== '#' ? fromHash(location.hash) : lastView();
  go(route);

  // PC에서 주소창의 #을 직접 바꿨을 때
  window.addEventListener('hashchange', () => go(fromHash(location.hash)));
}

start();
