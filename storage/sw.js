// 서비스 워커: 오프라인 동작 + 업데이트 반영
// 이 파일이 storage/ 안에 있으므로 범위(scope)는 /Repository/storage/ 로 제한됩니다.
//
// ★★★ 앱을 수정해서 다시 배포할 때는 아래 CACHE_VERSION 값을 올리세요 (예: 'v1' → 'v2') ★★★
// 값이 바뀌면 아이폰이 새 서비스 워커를 설치하고, 예전 캐시를 지운 뒤 새 파일로 바꿉니다.
const CACHE_VERSION = 'v4';

// 장보기 앱과 같은 사이트라 캐시 저장 공간을 함께 씁니다.
// 그래서 이름 앞에 'storage-'를 붙이고, 지울 때도 'storage-'로 시작하는 것만 지웁니다.
const CACHE_PREFIX = 'storage-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// 오프라인용으로 미리 저장할 파일. 파일을 새로 추가하면 여기에도 넣어 주세요.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/items.js',
  './js/photo.js',
  './js/links.js',
  './js/preview.js',
  './js/ui/dom.js',
  './js/ui/link-input.js',
  './js/ui/blob-url.js',
  './js/ui/photo-picker.js',
  './js/ui/carousel.js',
  './js/ui/viewer.js',
  './js/ui/toast.js',
  './js/ui/keyword-input.js',
  './js/ui/item-row.js',
  './js/ui/add-sheet.js',
  './js/views/common.js',
  './js/views/home.js',
  './js/views/category.js',
  './js/views/detail.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  event.respondWith(isHTML ? networkFirst(req) : staleWhileRevalidate(event, req));
});

// HTML: 네트워크 우선 (새 배포가 바로 반영), 오프라인이면 캐시
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // no-cache: GitHub Pages의 HTTP 캐시(약 10분) 대신 서버에 새 버전 확인
    // redirect: 'manual' → 리다이렉트 응답을 그대로 브라우저에 넘김 (Safari는 리다이렉트된 응답을 페이지로 쓰지 않음)
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match('./index.html')) ||
      Response.error()
    );
  }
}

// JS/CSS/아이콘: 캐시로 바로 응답하고 뒤에서 새 버전을 받아 캐시 갱신
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return (await update) || Response.error();
}
