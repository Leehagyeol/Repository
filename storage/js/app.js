// 앱 시작점: 화면 전환, 데이터 불러오기·저장, 마지막 화면 기억, 서비스 워커 등록
import { KEY_PREFIX, UNDO_SECONDS, getCategory, categoryName } from './config.js';
import { getAllItems, putItem, putItems, deleteItem, deleteItems } from './db.js';
import { linkKey, extractLink } from './links.js';
import { loadPreview, isPreviewConfigured } from './preview.js';
import { chooseDialog } from './ui/choice-dialog.js';
import { newItem, keywordList } from './items.js';
import { h } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { openItemSheet, isSheetOpen, closeItemSheet } from './ui/add-sheet.js';
import { isViewerOpen, closeViewer } from './ui/viewer.js';
import { backupReminder, markFirstRun, requestPersist } from './backup.js';
import { renderHome } from './views/home.js';
import { renderCategory } from './views/category.js';
import { renderDetail } from './views/detail.js';
import { renderSettings } from './views/settings.js';

const LAST_VIEW_KEY = `${KEY_PREFIX}last-view`;
const HIDE_BANNER_KEY = `${KEY_PREFIX}hide-install-banner`;
const LAST_TYPE_KEY = `${KEY_PREFIX}last-type`; // 추가 시트에서 마지막으로 고른 유형(링크/사진/텍스트)

const appEl = document.getElementById('app');
let items = [];
let route = { view: 'home' };
const scrollMemory = new Map();
const queries = new Map();
let keywordFilter = null;
let reminderDismissed = false; // "나중에"를 누르면 앱을 다시 열 때까지 숨김
let selection = null; // 여러 개 골라 삭제: { ids: Set, toggle, onChange }

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
  selection = null; // 다른 화면으로 가면 선택 모드 끝
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

/** 여러 개 골라 삭제. 5초 안에 한꺼번에 되돌릴 수 있음 */
async function deleteMany(ids) {
  const idSet = new Set(ids);
  const removed = items.filter((it) => idSet.has(it.id));
  if (!removed.length) return;
  try {
    await deleteItems(ids);
  } catch (err) {
    console.error(err);
    showToast('삭제하지 못했어요');
    return;
  }
  items = items.filter((it) => !idSet.has(it.id));
  selection = null;
  render();
  showToast(`${removed.length}개 삭제했어요`, {
    actionLabel: '되돌리기',
    seconds: UNDO_SECONDS,
    onAction: async () => {
      await putItems(removed);
      items.push(...removed);
      render();
    },
  });
}

/** F15 상단 고정 */
async function togglePin(item) {
  const pinned = !item.pinned;
  await updateItem(item, { pinned });
  showToast(pinned ? `${categoryName(item.category)} 맨 위에 고정했어요` : '고정을 풀었어요');
}

/** F16 미리보기 다시 불러오기: 이미지·사이트 이름·설명을 새로 받고, 제목이 바뀌었으면 바꿀지 물어봄 */
async function reloadPreview(item) {
  if (!isPreviewConfigured()) {
    showToast('설정에서 미리보기 함수를 먼저 연결해 주세요', { seconds: 4 });
    return;
  }
  const result = await loadPreview(item.url);
  if (!result.ok) {
    showToast('미리보기를 가져오지 못했어요. 지금 내용은 그대로 둘게요', { seconds: 4 });
    return;
  }
  const fields = {
    linkKind: result.kind,
    siteName: result.siteName || item.siteName,
    description: result.description || item.description || '',
  };
  if (result.image) fields.previewImage = result.image;
  if (result.title && result.title !== item.title) {
    const answer = await chooseDialog({
      title: '제목도 바꿀까요?',
      message: `지금: ${item.title || '(없음)'}\n새 제목: ${result.title}`,
      choices: [
        { id: 'replace', label: '새 제목으로 바꾸기' },
        { id: 'keep', label: '지금 제목 그대로' },
      ],
      cancelLabel: '미리보기도 바꾸지 않기',
    });
    if (!answer) return;
    if (answer === 'replace') fields.title = result.title;
  }
  const current = items.find((it) => it.id === item.id) || item;
  await updateItem(current, fields);
  showToast(result.image ? '미리보기를 새로 불러왔어요' : '정보를 새로 불러왔어요 (이미지는 없어서 그대로)');
}

/** F14 이미 저장한 같은 링크 찾기 → { item, categoryName } | null */
function findDuplicate(url, excludeId) {
  const key = linkKey(url);
  const found = items.find((it) => it.type === 'link' && it.id !== excludeId && it.url && linkKey(it.url) === key);
  return found ? { item: found, categoryName: categoryName(found.category) } : null;
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
  /** @param {string} defaultCategory @param {{ prefillLink?: string }} [opts] 공유 시트로 받은 링크 */
  openAdd(defaultCategory, { prefillLink = '' } = {}) {
    // 공유로 받은 링크면 링크, 아니면 마지막에 쓴 유형, 처음이면 링크(앱의 핵심 기능)
    let defaultType = 'link';
    try {
      const last = localStorage.getItem(LAST_TYPE_KEY);
      if (!prefillLink && ['link', 'photo', 'text'].includes(last)) defaultType = last;
    } catch {
      /* 무시 */
    }
    openItemSheet({
      mode: 'add',
      defaultCategory,
      defaultType,
      prefillLink,
      getKnownKeywords: knownKeywords,
      findDuplicate,
      onOpenExisting: (existing) => go({ view: 'detail', id: existing.id }),
      onSave: addItem,
    });
  },
  openEdit(item) {
    openItemSheet({
      mode: 'edit',
      item,
      getKnownKeywords: knownKeywords,
      findDuplicate,
      onSave: (fields) => updateItem(item, fields),
    });
  },
  removeItem,
  togglePin,
  reloadPreview,

  // ── 여러 개 골라 삭제 ──
  /** 지금 화면의 선택 상태 (없으면 null) */
  get selection() {
    return selection;
  },
  startSelect() {
    selection = {
      ids: new Set(),
      onChange: null,
      toggle(id) {
        if (this.ids.has(id)) this.ids.delete(id);
        else this.ids.add(id);
        this.onChange?.();
        return this.ids.has(id);
      },
    };
    render();
  },
  endSelect() {
    selection = null;
    render();
  },
  deleteMany,
  refresh: () => render(),

  // ── 검색어 (화면마다 기억, 앱을 닫으면 지워짐) ──
  getQuery: (key) => queries.get(key) || '',
  setQuery: (key, q) => queries.set(key, q),

  // ── 키워드 필터 (홈에서 전체 카테고리 대상) ──
  get keywordFilter() {
    return keywordFilter;
  },
  /** 상세 화면의 키워드 칩을 누르면: 홈으로 가서 같은 키워드 항목만 */
  filterByKeyword(keyword) {
    keywordFilter = keyword;
    queries.set('home', '');
    go({ view: 'home' });
  },
  setKeywordFilter(keyword) {
    keywordFilter = keyword || null;
    render();
    const el = scroller();
    if (el) el.scrollTop = 0;
  },

  // ── 백업 ──
  backupReminder: () => (reminderDismissed ? null : backupReminder(items.length)),
  dismissReminder() {
    reminderDismissed = true;
    render();
  },
  /** 백업을 가져온 뒤 저장소에서 다시 읽음 */
  async reloadItems() {
    items = await getAllItems();
    render();
  },
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

// ───────── F13 공유 시트(단축어)로 받은 링크 ─────────
// 단축어가 "앱주소/?add=<링크>"를 엶. 주소에서 꺼내고 바로 지워서 새로고침해도 다시 열리지 않게.
function takeSharedLink() {
  const params = new URLSearchParams(location.search);
  const text = (params.get('add') || params.get('url') || params.get('text') || '').trim();
  if (params.has('add') || params.has('url') || params.has('text')) {
    history.replaceState(null, '', location.pathname + location.hash);
  }
  return text;
}

/** Safari 탭으로 열렸을 때: 여기서 저장하면 홈 화면 앱에 안 보이므로 저장하지 않고 안내 */
function showShareHandoff(text) {
  const { url } = extractLink(text);
  const status = h('p', { class: 'set-status', role: 'status', hidden: true });
  const copyBtn = h('button', { type: 'button', class: 'paste-btn' }, '링크 다시 복사하기');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '복사했어요. 홈 화면의 저장소 앱에서 붙여넣어 주세요.';
      status.className = 'set-status ok';
    } catch {
      status.textContent = '복사하지 못했어요. 위 링크를 길게 눌러 복사해 주세요.';
      status.className = 'set-status error';
    }
    status.hidden = false;
  });
  const el = h(
    'div',
    { class: 'dialog-overlay open' },
    h('div', { class: 'dialog-backdrop' }),
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'handoff-title' },
      h('h2', { id: 'handoff-title', class: 'dialog-title' }, '홈 화면 앱에서 저장해 주세요'),
      h(
        'p',
        { class: 'dialog-msg' },
        'Safari에서 저장하면 홈 화면 앱에 보이지 않아요.\n단축어가 링크를 복사해 두었어요. 홈 화면의 저장소 앱을 열고 + → 붙여넣기를 눌러 주세요.',
      ),
      h('p', { class: 'handoff-link' }, url || text),
      copyBtn,
      status,
      h('button', { type: 'button', class: 'dialog-btn cancel', onClick: () => el.remove() }, '닫기'),
    ),
  );
  document.body.append(el);
}

// ───────── 시작 ─────────
async function start() {
  const sharedLink = takeSharedLink();
  lockSafeAreaBottom();
  markFirstRun();
  // 저장 공간이 부족해도 이 앱 데이터를 지우지 않도록 요청 (이미 허용됐으면 그대로)
  requestPersist();
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

  if (sharedLink) {
    if (isStandalone()) ctx.openAdd(route.view === 'category' ? route.id : '', { prefillLink: sharedLink });
    else showShareHandoff(sharedLink);
  }

  // PC에서 주소창의 #을 직접 바꿨을 때
  window.addEventListener('hashchange', () => go(fromHash(location.hash)));
}

start();
