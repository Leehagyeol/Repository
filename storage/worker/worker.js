// 저장소 앱 — 링크 미리보기 함수 (Cloudflare Worker)
//
// 브라우저는 다른 사이트의 HTML을 직접 읽지 못하므로(CORS) 이 함수가 대신 읽어 제목·이미지를 뽑아 줍니다.
//
//   GET ?url=<링크>      → JSON { ok, kind, title, siteName, description, image }
//   GET ?image=<주소>    → 이미지를 대신 받아 그대로 돌려줌 (앱이 폰에 사본을 저장할 수 있게)
//   GET ?ping=1          → { ok: true } (설정 화면의 "연결 확인")
//
// 보안
//   - ALLOWED_ORIGINS(wrangler.toml)에 적힌 주소에서 온 요청만 받음
//   - 요청 헤더 X-Storage-Key 가 비밀 값 PREVIEW_KEY 와 같아야 함
//     PREVIEW_KEY는 코드에 넣지 않고 `npx wrangler secret put PREVIEW_KEY` 로 Cloudflare에만 저장

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 StoragePreview/1.0';
const MAX_HTML_BYTES = 800 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 8000;
const QUICK_TIMEOUT_MS = 4500; // 인스타그램·쿠팡: 실패할 가능성이 높아 빨리 포기 (5초 안에)
const QUICK_FAIL_HOSTS = ['instagram.com', 'coupang.com', 'coupa.ng'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || 'https://leehagyeol.github.io')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes(origin)) return json({ ok: false, error: 'origin-not-allowed' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Storage-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'GET') return json({ ok: false, error: 'method-not-allowed' }, 405, cors);
    if (!env.PREVIEW_KEY) return json({ ok: false, error: 'server-key-missing' }, 500, cors);
    if (!safeEqual(request.headers.get('X-Storage-Key') || '', String(env.PREVIEW_KEY))) {
      return json({ ok: false, error: 'bad-key' }, 401, cors);
    }

    const params = new URL(request.url).searchParams;
    if (params.has('ping')) return json({ ok: true }, 200, cors);
    if (params.has('image')) return proxyImage(params.get('image'), params.get('ref'), cors);
    if (params.has('url')) return json(await preview(params.get('url')), 200, cors);
    return json({ ok: false, error: 'missing-url' }, 400, cors);
  },
};

// ───────── 미리보기 ─────────

export async function preview(raw) {
  let target;
  try {
    target = parseTarget(raw);
  } catch {
    return { ok: false, error: 'bad-url' };
  }

  const ytId = youtubeId(target);
  if (ytId) return youtubePreview(ytId);

  const quick = QUICK_FAIL_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith(`.${h}`));
  try {
    const result = await pagePreview(rewriteNaver(target), quick ? QUICK_TIMEOUT_MS : PAGE_TIMEOUT_MS);
    // 로그인 화면 같은 쓸모없는 결과는 실패로 처리
    if (quick && (!result.image || /^(instagram|쿠팡!?|coupang)$/i.test(result.title) || /log ?in|로그인/i.test(result.title))) {
      return { ok: false, error: 'blocked', siteName: hostLabel(target) };
    }
    return result;
  } catch (err) {
    return {
      ok: false,
      error: err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'fetch-failed',
      siteName: hostLabel(target),
    };
  }
}

/** YouTube: 공식 oEmbed로 제목·채널, 썸네일은 영상 ID로 바로 만듦 (일반·Shorts·youtu.be 모두) */
async function youtubePreview(id) {
  const image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        kind: 'video',
        title: clip(data.title, 300),
        siteName: data.author_name ? clip(`YouTube · ${data.author_name}`, 100) : 'YouTube',
        description: '',
        image,
      };
    }
  } catch {
    /* 아래로 */
  }
  // 비공개 영상 등으로 oEmbed가 안 되면 썸네일만
  return { ok: true, kind: 'video', title: '', siteName: 'YouTube', description: '', image };
}

async function pagePreview(url, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6',
  };
  let res = await fetch(url.href, { headers, redirect: 'follow', signal });
  let finalUrl = new URL(res.url || url.href);

  // 짧은 주소(naver.me 등)가 PC 블로그 주소로 넘어가면 모바일 주소로 다시 읽음
  const mobile = rewriteNaver(finalUrl);
  if (mobile.href !== finalUrl.href) {
    await res.body?.cancel();
    res = await fetch(mobile.href, { headers, redirect: 'follow', signal });
    finalUrl = new URL(res.url || mobile.href);
  }

  if (!res.ok) {
    await res.body?.cancel();
    return { ok: false, error: `http-${res.status}`, siteName: hostLabel(finalUrl) };
  }

  const type = res.headers.get('content-type') || '';
  if (type.startsWith('image/')) {
    await res.body?.cancel();
    const name = decodeURIComponent(finalUrl.pathname.split('/').pop() || '');
    return { ok: true, kind: 'page', title: clip(name, 300), siteName: hostLabel(finalUrl), description: '', image: finalUrl.href };
  }
  if (!/html|xml/i.test(type)) {
    await res.body?.cancel();
    return { ok: false, error: 'not-html', siteName: hostLabel(finalUrl) };
  }

  const html = await readHead(res, type);
  const meta = extractMeta(html);
  const title = meta['og:title'] || meta['twitter:title'] || meta.__title || '';
  const image = absolute(
    meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'] || meta['twitter:image'] || meta['twitter:image:src'],
    finalUrl,
  );
  return {
    ok: Boolean(title || image),
    kind: /video/i.test(meta['og:type'] || '') ? 'video' : 'page',
    title: clip(title, 300),
    siteName: clip(meta['og:site_name'] || hostLabel(finalUrl), 100),
    description: clip(meta['og:description'] || meta['twitter:description'] || meta.description || '', 500),
    image,
  };
}

/** HTML 앞부분(</head>까지)만 읽음 */
async function readHead(res, contentType) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  let tail = '';
  const sniff = new TextDecoder('utf-8');
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    const text = tail + sniff.decode(value, { stream: true });
    if (/<\/head\s*>/i.test(text)) break;
    tail = text.slice(-16);
  }
  reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return decodeHtml(bytes, contentType);
}

/** 글자 인코딩: 응답 헤더 → <meta charset> → UTF-8 (옛 한국 사이트의 EUC-KR 대비) */
function decodeHtml(bytes, contentType) {
  let label = (contentType.match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!label) {
    const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096));
    label = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try {
    return new TextDecoder(label || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function extractMeta(html) {
  const head = html.split(/<\/head\s*>/i)[0];
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(m[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase().trim();
    if (key && attrs.content != null && !(key in meta)) {
      const value = decodeEntities(attrs.content).trim();
      if (value) meta[key] = value;
    }
  }
  const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  meta.__title = t ? decodeEntities(t[1]).replace(/\s+/g, ' ').trim() : '';
  return meta;
}

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', times: '×', bull: '•',
};
/** &amp;middot; 처럼 두 번 감싼 경우도 있어 최대 두 번 풀어 줌 */
function decodeEntities(s) {
  const once = decodeEntitiesOnce(s);
  return /&(#x[0-9a-f]+|#\d+|[a-z]+);/i.test(once) ? decodeEntitiesOnce(once) : once;
}
function decodeEntitiesOnce(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
    const c = code.toLowerCase();
    if (c in ENTITIES) return ENTITIES[c];
    if (c.startsWith('#x')) return safeChar(parseInt(c.slice(2), 16), all);
    if (c.startsWith('#')) return safeChar(parseInt(c.slice(1), 10), all);
    return all;
  });
}
function safeChar(n, fallback) {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : fallback;
  } catch {
    return fallback;
  }
}

// ───────── 이미지 대신 받기 ─────────

async function proxyImage(raw, ref, cors) {
  let target;
  try {
    target = parseTarget(raw);
  } catch {
    return json({ ok: false, error: 'bad-url' }, 400, cors);
  }
  const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
  // 네이버 등은 원래 페이지 주소(Referer)가 없으면 이미지를 막음
  try {
    if (ref) headers.Referer = parseTarget(ref).href;
  } catch {
    /* 무시 */
  }
  let res;
  try {
    res = await fetch(target.href, { headers, redirect: 'follow', signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
  } catch {
    return json({ ok: false, error: 'image-fetch-failed' }, 502, cors);
  }
  if (!res.ok) {
    await res.body?.cancel();
    return json({ ok: false, error: `image-http-${res.status}` }, 502, cors);
  }
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) {
    await res.body?.cancel();
    return json({ ok: false, error: 'not-image' }, 415, cors);
  }
  if (Number(res.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
    await res.body?.cancel();
    return json({ ok: false, error: 'image-too-large' }, 413, cors);
  }
  return new Response(res.body, {
    headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' },
  });
}

// ───────── 주소 도우미 ─────────

/** http(s) 주소만, 내부망 주소는 거부 */
export function parseTarget(raw) {
  const u = new URL(String(raw || '').trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h.startsWith('[')
  ) {
    throw new Error('private');
  }
  return u;
}

/** YouTube 영상 ID (일반 watch, Shorts, youtu.be, embed, live) */
export function youtubeId(u) {
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1] || null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** 네이버 블로그 PC 주소 → 모바일 주소 (PC 주소는 본문이 프레임 안에 있어 제목·이미지를 못 읽음) */
export function rewriteNaver(u) {
  if (u.hostname.toLowerCase() !== 'blog.naver.com') return u;
  const m = new URL(u.href);
  m.hostname = 'm.blog.naver.com';
  const blogId = u.searchParams.get('blogId');
  const logNo = u.searchParams.get('logNo');
  if (blogId && logNo) {
    m.pathname = `/${blogId}/${logNo}`;
    m.search = '';
  }
  return m;
}

function hostLabel(u) {
  return u.hostname.replace(/^(www\.|m\.)/i, '');
}

function absolute(src, base) {
  if (!src) return '';
  try {
    const u = new URL(src, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

function clip(s, n) {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
