// 링크 도우미: 붙여넣은 글에서 주소 찾기, YouTube 영상 ID, 도메인 이름

const URL_RE = /https?:\/\/[^\s<>"'「」『』()]+/i;
const TRAIL_RE = /[).,!?;:'"」』\]>…]+$/;

/**
 * 붙여넣은 글에서 링크와 나머지 문구를 나눔
 * 예) "쿠팡에서 맛있는 김치 1kg 확인해보세요! https://link.coupang.com/a/xyz"
 *   → { url: 'https://link.coupang.com/a/xyz', extra: '쿠팡에서 맛있는 김치 1kg 확인해보세요!' }
 */
export function extractLink(text) {
  const src = String(text || '').trim();
  if (!src) return { url: '', extra: '' };
  let raw = '';
  const m = src.match(URL_RE);
  if (m) raw = m[0].replace(TRAIL_RE, '');
  else if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(src)) raw = src; // "youtu.be/..." 처럼 http 없이
  if (!raw) return { url: '', extra: '' };

  let url = '';
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).href;
  } catch {
    return { url: '', extra: '' };
  }
  const extra = src
    .replace(raw, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|·,]+|[\s\-–—:|·,]+$/g, '')
    .trim();
  return { url, extra: extra.length >= 2 ? extra.slice(0, 120) : '' };
}

export function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^(www\.|m\.)/i, '');
  } catch {
    return '';
  }
}

/** YouTube 영상 ID (일반 watch, Shorts, youtu.be, embed, live) */
export function youtubeInfo(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  let shorts = false;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) {
        id = m[2];
        shorts = m[1] === 'shorts';
      }
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, shorts } : null;
}

/** YouTube 앱으로 여는 주소 (앱이 깔려 있으면 앱이 열림) */
export function youtubeAppUrl(url) {
  const yt = youtubeInfo(url);
  if (!yt) return null;
  return yt.shorts ? `youtube://www.youtube.com/shorts/${yt.id}` : `youtube://www.youtube.com/watch?v=${yt.id}`;
}
