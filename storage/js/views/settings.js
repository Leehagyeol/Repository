// 설정: 저장된 항목, 사진 용량, 사용 중인 저장 공간 (백업은 4단계에서 추가)
import { h } from '../ui/dom.js';
import { APP_VERSION } from '../config.js';
import { getPreviewConfig, savePreviewConfig, pingPreview } from '../preview.js';
import { header, backButton } from './common.js';

const PING_MSG = {
  ok: ['연결됐어요. 이제 링크를 넣으면 제목과 썸네일이 자동으로 붙어요.', 'ok'],
  'bad-key': ['비밀 키가 맞지 않아요. 함수에 넣은 키와 같은지 확인해 주세요.', 'error'],
  origin: ['허용되지 않은 주소에서 요청했어요. 함수의 ALLOWED_ORIGINS를 확인해 주세요.', 'error'],
  'server-key': ['함수에 비밀 키(PREVIEW_KEY)가 아직 없어요. wrangler secret put 단계를 해 주세요.', 'error'],
  unreachable: ['함수에 연결하지 못했어요. 주소와 인터넷 연결을 확인해 주세요.', 'error'],
};

/** 링크 미리보기 함수 주소·비밀 키 입력 (이 기기에만 저장) */
function previewSection() {
  const cfg = getPreviewConfig();
  const urlInput = h('input', {
    type: 'url',
    id: 'pv-url',
    class: 'field',
    placeholder: 'https://storage-preview.이름.workers.dev',
    value: cfg.url,
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'url',
  });
  const keyInput = h('input', {
    type: 'text',
    id: 'pv-key',
    class: 'field mono',
    placeholder: '비밀 키',
    value: cfg.key,
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const status = h('p', { class: 'set-status', role: 'status', hidden: true });
  const say = (text, kind = '') => {
    status.textContent = text;
    status.className = `set-status ${kind}`;
    status.hidden = !text;
  };

  function save() {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    // https만 허용 (PC에서 시험할 때 쓰는 localhost는 예외)
    if (url && !/^https:\/\/[^\s/]+/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
      say('함수 주소는 https:// 로 시작해야 해요.', 'error');
      return false;
    }
    try {
      new URL(url || 'https://x');
    } catch {
      say('함수 주소가 올바르지 않아요.', 'error');
      return false;
    }
    savePreviewConfig({ url, key });
    say(url && key ? '저장했어요.' : '지웠어요. 미리보기 없이 제목을 직접 넣게 돼요.', 'ok');
    return true;
  }

  const saveBtn = h('button', { type: 'button', class: 'pp-btn', onClick: save }, '저장');
  const testBtn = h(
    'button',
    {
      type: 'button',
      class: 'pp-btn',
      onClick: async () => {
        if (!save()) return;
        if (!urlInput.value.trim() || !keyInput.value.trim()) {
          say('함수 주소와 비밀 키를 모두 넣어 주세요.', 'error');
          return;
        }
        testBtn.disabled = true;
        say('확인하는 중…');
        const [msg, kind] = PING_MSG[await pingPreview()] || PING_MSG.unreachable;
        say(msg, kind);
        testBtn.disabled = false;
      },
    },
    '연결 확인',
  );

  return [
    h('h2', { class: 'section-title' }, '링크 미리보기'),
    h(
      'section',
      { class: 'set-form' },
      h('label', { class: 'form-label first', for: 'pv-url' }, '함수 주소'),
      urlInput,
      h('label', { class: 'form-label', for: 'pv-key' }, '비밀 키'),
      keyInput,
      h('div', { class: 'pp-actions' }, saveBtn, testBtn),
      status,
    ),
    h('p', { class: 'set-note' }, '주소와 키는 이 아이폰의 저장소 앱 안에만 저장돼요. 배포 방법은 storage/worker/README.md에 있어요.'),
  ];
}

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
      previewSection(),
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
        row('링크', `${items.filter((it) => it.type === 'link').length}개`),
        row('사진 항목', `${photoItems.length}개`),
        row('텍스트', `${textCount}개`),
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
