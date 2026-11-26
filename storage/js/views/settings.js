// 설정: 저장된 항목, 사진 용량, 사용 중인 저장 공간 (백업은 4단계에서 추가)
import { h } from '../ui/dom.js';
import { APP_VERSION } from '../config.js';
import { header, backButton } from './common.js';

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '알 수 없음';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

export function renderSettings(ctx) {
  const row = (label, value, id) =>
    h('div', { class: 'set-row' }, h('span', {}, label), h('span', { class: 'muted', id }, value));

  const items = ctx.items;
  const textCount = items.filter((it) => it.type === 'text').length;
  const photoItems = items.filter((it) => it.type === 'photo');
  let photoCount = 0;
  let photoBytes = 0;
  for (const it of items) {
    for (const p of it.photos || []) {
      photoCount += 1;
      photoBytes += (p.full?.size || 0) + (p.thumb?.size || 0);
    }
  }

  const usageEl = h('span', { class: 'muted' }, '계산 중…');
  const quotaEl = h('span', { class: 'muted' }, '계산 중…');
  estimate(usageEl, quotaEl);

  return [
    header({
      left: backButton(() => ctx.back()),
      center: h('h1', { class: 'topbar-title' }, '설정'),
    }),
    h(
      'main',
      { class: 'page' },
      h('h2', { class: 'section-title' }, '저장 공간'),
      h(
        'section',
        { class: 'set-group' },
        h('div', { class: 'set-row' }, h('span', {}, '사용 중인 저장 공간'), usageEl),
        h('div', { class: 'set-row' }, h('span', {}, '쓸 수 있는 최대 공간'), quotaEl),
        row('사진', photoCount ? `${photoCount}장 · ${formatBytes(photoBytes)}` : '0장'),
        photoCount ? row('사진 1장 평균', formatBytes(photoBytes / photoCount)) : null,
      ),
      h(
        'p',
        { class: 'set-note' },
        '"사용 중인 저장 공간"은 브라우저가 계산한 대략적인 값이에요. 같은 주소(leehagyeol.github.io)를 쓰는 장보기 앱 데이터가 함께 들어갈 수 있어요. "사진" 줄은 이 앱에 저장된 사진(원본 축소본 + 썸네일)만 더한 값이에요.',
      ),
      h('h2', { class: 'section-title' }, '항목'),
      h(
        'section',
        { class: 'set-group' },
        row('저장된 항목', `${items.length}개`),
        row('텍스트', `${textCount}개`),
        row('사진 항목', `${photoItems.length}개`),
      ),
      h('h2', { class: 'section-title' }, '앱 정보'),
      h('section', { class: 'set-group' }, row('버전', APP_VERSION)),
      h('p', { class: 'set-note' }, '백업 내보내기·가져오기는 다음 업데이트에서 추가돼요.'),
    ),
  ];
}

async function estimate(usageEl, quotaEl) {
  try {
    if (!navigator.storage?.estimate) throw new Error('unsupported');
    const { usage, quota } = await navigator.storage.estimate();
    usageEl.textContent = formatBytes(usage);
    quotaEl.textContent = quota ? `약 ${formatBytes(quota)}` : '알 수 없음';
  } catch {
    usageEl.textContent = '이 기기에서는 확인할 수 없어요';
    quotaEl.textContent = '알 수 없음';
  }
}
