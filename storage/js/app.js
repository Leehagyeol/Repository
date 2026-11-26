// 앱 시작점: 화면 전환, 데이터 불러오기·저장, 마지막 화면 기억, 서비스 워커 등록
import { KEY_PREFIX, UNDO_SECONDS, getCategory, categoryName } from './config.js';
import { getAllItems, putItem, putItems, deleteItem } from './db.js';
import { newItem, keywordList } from './items.js';
import { h } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { openItemSheet, isSheetOpen, closeItemSheet } from './ui/add-sheet.js';
import { isViewerOpen, closeViewer } from './ui/viewer.js';
import { renderHome } from './views/home.js';
import { renderCategory } from './views/category.js';
import { renderDetail } from './views/detail.js';
import { renderSettings } from './views/settings.js';

const LAST_VIEW_KEY = `${KEY_PREFIX}last-view`;
const HIDE_BANNER_KEY = `${KEY_PREFIX}hide-install-banner`;
const LAST_TYPE_KEY = `${KEY_PREFIX}last-type`; // 추가 시트에서 마지막으로 고른 유형(텍스트/사진)

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

// 스크롤은 페이지 전체가 아니라 본문(.page) 안에서 일어남
const scroller = () => appEl.querySelector('.page');

function go(next, { restoreScroll = false } = {}) {
  scrollMemory.set(routeKey(route), scroller()?.scrollTop || 0);
  closeItemSheet();
  closeViewer();
  route = validRoute(next);
  history.replaceState(null, '', toHash(route));
  saveLastView(route);
  render();
  const el = scroller();
  if (el) el.scrollTop = restoreScroll ? scrollMemory.get(routeKey(route)) || 0 : 0;
}

/** ‹ 버튼·왼쪽 끝 밀기: 카테고리 → 홈, 상세·설정 → 마지막으로 보던 목록 */
function back() {
  if (route.view === 'home') return;
  go(route.view === 'category' ? { view: 'home' } : lastView(), { restoreScroll: true });
}

// ───────── 데이터 ─────────
/** 사진 여러 장: 카테고리 설정(groupPhotos)이 없으면 사진마다 따로 저장 */
function splitPhotos(fields) {
  const group = getCategory(fields.category)?.groupPhotos;
  if (fields.type !== 'photo' || group || fields.photos.length <= 1) return [newItem(fields)];
  // 고른 순서대로 목록 위에서부터 보이도록 첫 사진을 가장 최근 시각으로
  const now = Date.now();
  const n = fields.photos.length;
  return fields.photos.map((photo, i) =>
    newItem({ ...fields, photos: [photo], createdAt: now + (n - 1 - i), updatedAt: now + (n - 1 - i) }),
  );
}

async function addItem(fields) {
  const created = splitPhotos(fields);
  await putItems(created);
  items.push(...created);
  try {
    localStorage.setItem(LAST_TYPE_KEY, fields.type);
  } catch {
    /* 무시 */
  }
  render();
  const where = categoryName(fields.category);
  showToast(created.length > 1 ? `${where}에 ${created.length}개 저장했어요` : `${where}에 저장했어요`);
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
    // 마지막에 쓴 유형, 처음이면 링크(앱의 핵심 기능)
    let defaultType = 'link';
    try {
      const last = localStorage.getItem(LAST_TYPE_KEY);
      if (['link', 'photo', 'text'].includes(last)) defaultType = last;
    } catch {
      /* 무시 */
    }
    openItemSheet({ mode: 'add', defaultCategory, defaultType, getKnownKeywords: knownKeywords, onSave: addItem });
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

let renderedKey = null;

function render() {
  route = validRoute(route);
  // 같은 화면을 다시 그릴 때(저장·수정·되돌리기 후)는 보던 위치를 유지
  const key = routeKey(route);
  const keepTop = key === renderedKey ? scroller()?.scrollTop : null;
  appEl.replaceChildren(...VIEWS[route.view](ctx));
  renderedKey = key;
  if (keepTop != null && scroller()) scroller().scrollTop = keepTop;
}

// ───────── 아래쪽 안전 영역 고정 ─────────
// 일부 iOS에서 env(safe-area-inset-bottom) 값이 순간적으로 바뀌면서 + 버튼이 튀는 것을 막기 위해,
// 값을 재서 가장 큰 값으로 고정함. 화면 방향(가로·세로)이 바뀌면 다시 잼.
function lockSafeAreaBottom() {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
  document.body.append(probe);
  let width = window.innerWidth;
  let max = -1;
  const measure = () => {
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      max = -1;
    }
    const v = probe.offsetHeight;
    if (v > max) {
      max = v;
      document.documentElement.style.setProperty('--safe-bottom-fixed', `${v}px`);
    }
  };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));
}

// ───────── 왼쪽 끝에서 오른쪽으로 밀면 뒤로 ─────────
function setupEdgeSwipe() {
  let start = null;
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= 24 && route.view !== 'home' && !isSheetOpen() && !isViewerOpen() ? { x: t.clientX, y: t.clientY } : null;
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
    // 사진을 고르는 중이면 새로고침하지 않음 (다음에 열 때 반영)
    if (!hadController || reloaded || isSheetOpen()) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('서비스 워커 등록 실패', err));
}

// ───────── 시작 ─────────
async function start() {
  lockSafeAreaBottom();
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
