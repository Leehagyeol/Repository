// 링크 미리보기 함수(Cloudflare Worker) 부르기.
// 함수 주소와 비밀 키는 코드에 넣지 않고 설정 화면에서 입력해 이 기기(localStorage)에만 저장합니다.
import { KEY_PREFIX } from './config.js';
import { shrinkImage } from './photo.js';
import { youtubeInfo, hostLabel } from './links.js';

const URL_KEY = `${KEY_PREFIX}preview-url`;
const SECRET_KEY = `${KEY_PREFIX}preview-key`;
export const PREVIEW_IMAGE_SIDE = 800;

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function getPreviewConfig() {
  return { url: read(URL_KEY), key: read(SECRET_KEY) };
}

export function savePreviewConfig({ url, key }) {
  localStorage.setItem(URL_KEY, url.trim());
  localStorage.setItem(SECRET_KEY, key.trim());
}

export function isPreviewConfigured() {
  const c = getPreviewConfig();
  return Boolean(c.url && c.key);
}

function endpoint(params) {
  const { url } = getPreviewConfig();
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
}

async function call(params, timeoutMs) {
  const { key } = getPreviewConfig();
  return fetch(endpoint(params), {
    headers: { 'X-Storage-Key': key },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
}

/** 설정 화면 "연결 확인": 'ok' | 'bad-key' | 'origin' | 'server-key' | 'unreachable' */
export async function pingPreview() {
  try {
    const res = await call({ ping: '1' }, 8000);
    if (res.ok) return 'ok';
    if (res.status === 401) return 'bad-key';
    if (res.status === 403) return 'origin';
    if (res.status === 500) return 'server-key';
    return 'unreachable';
  } catch {
    // 다른 주소에서 막히면(CORS) 브라우저는 이유를 알려 주지 않고 실패만 알려 줌
    return 'unreachable';
  }
}

/**
 * 링크 미리보기 + 대표 이미지 사본까지
 * @returns {Promise<{ok, kind, title, siteName, description, image: Blob|null, error?}>}
 */
export async function loadPreview(link) {
  const yt = youtubeInfo(link);
  const fallback = {
    ok: false,
    kind: yt ? 'video' : 'page',
    title: '',
    siteName: yt ? 'YouTube' : hostLabel(link),
    description: '',
    image: null,
  };
  if (!isPreviewConfigured()) return { ...fallback, error: 'not-configured' };

  let data;
  try {
    const res = await call({ url: link }, 12000);
    data = await res.json();
    if (!res.ok) return { ...fallback, error: data?.error || `http-${res.status}` };
  } catch {
    return { ...fallback, error: 'unreachable' };
  }
  if (!data?.ok) return { ...fallback, siteName: data?.siteName || fallback.siteName, error: data?.error || 'failed' };

  let image = null;
  if (data.image) {
    try {
      const res = await call({ image: data.image, ref: link }, 12000);
      if (res.ok) image = await shrinkImage(await res.blob(), PREVIEW_IMAGE_SIDE);
    } catch (err) {
      console.warn('미리보기 이미지 실패', err);
    }
  }
  return {
    ok: true,
    kind: data.kind === 'video' || yt ? 'video' : 'page',
    title: data.title || '',
    siteName: data.siteName || fallback.siteName,
    description: data.description || '',
    image,
  };
}
