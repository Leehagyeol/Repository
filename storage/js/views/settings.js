// 설정: 백업·복원, 링크 미리보기 함수, 영구 저장·저장 공간, 항목 수, 앱 정보
import { h, formatFullDate } from '../ui/dom.js';
import { APP_VERSION } from '../config.js';
import { getPreviewConfig, savePreviewConfig, pingPreview } from '../preview.js';
import { getLastBackup, markBackedUp, buildBackup, shareBackup, readBackup, restoreBackup, requestPersist, persistState } from '../backup.js';
import { chooseDialog } from '../ui/choice-dialog.js';
import { showToast } from '../ui/toast.js';
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
      backupSection(ctx),
      previewSection(),
      h('h2', { class: 'section-title' }, '저장 공간'),
      h(
        'section',
        { class: 'set-group' },
        persistRow(),
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
    ),
  ];
}

// ───────── 백업 ─────────

function lastBackupText() {
  const last = getLastBackup();
  if (!last) return '아직 없어요';
  const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  return `${formatFullDate(last)}${days > 0 ? ` (${days}일 전)` : ''}`;
}

const IMPORT_ERRORS = {
  'not-backup': '저장소 백업 파일이 아니에요. "저장소-백업-…zip" 파일을 골라 주세요.',
  compressed: '다른 프로그램으로 다시 압축한 파일이라 읽을 수 없어요. 앱에서 내보낸 원래 파일을 골라 주세요.',
  'newer-format': '더 새 버전의 앱에서 만든 백업이에요. 앱을 다시 열어 최신 버전으로 바꾼 뒤 가져와 주세요.',
};

function backupSection(ctx) {
  const lastEl = h('span', { class: 'muted' }, lastBackupText());
  const status = h('p', { class: 'set-status', role: 'status', hidden: true });
  const say = (text, kind = '') => {
    status.textContent = text;
    status.className = `set-status ${kind}`;
    status.hidden = !text;
  };

  // 백업 파일을 다 만든 뒤 한 번 더 눌러 공유 시트를 엶 (아이폰은 누른 직후에만 공유 시트를 허락함)
  const readyBox = h('div', { class: 'backup-ready', hidden: true });
  let readyFile = null;

  const exportBtn = h('button', { type: 'button', class: 'pp-btn' }, '백업 내보내기');
  exportBtn.addEventListener('click', async () => {
    if (!ctx.items.length) {
      say('백업할 항목이 아직 없어요.', 'error');
      return;
    }
    exportBtn.disabled = true;
    importBtn.disabled = true;
    readyBox.hidden = true;
    say('백업 파일 만드는 중…');
    try {
      readyFile = await buildBackup(ctx.items, (done, total) => say(`백업 파일 만드는 중… (${done}/${total})`));
      say('');
      readyBox.replaceChildren(
        h('p', { class: 'backup-ready-text' }, `백업 파일이 준비됐어요 · ${formatBytes(readyFile.size)}`),
        h('button', { type: 'button', class: 'paste-btn', onClick: saveFile }, '파일에 저장하기'),
        h('p', { class: 'set-note tight' }, '공유 시트에서 "파일에 저장" → iCloud Drive를 고르면 폰을 바꿔도 남아요.'),
      );
      readyBox.hidden = false;
    } catch (err) {
      console.error(err);
      say('백업 파일을 만들지 못했어요. 다시 시도해 주세요.', 'error');
    }
    exportBtn.disabled = false;
    importBtn.disabled = false;
  });

  async function saveFile() {
    if (!readyFile) return;
    try {
      const result = await shareBackup(readyFile);
      if (result === 'cancelled') {
        say('저장을 취소했어요. 다시 누르면 공유 시트가 열려요.');
        return;
      }
      markBackedUp();
      lastEl.textContent = lastBackupText();
      say(result === 'shared' ? '백업했어요.' : '백업 파일을 내려받았어요.', 'ok');
      readyBox.hidden = true;
      readyFile = null;
    } catch (err) {
      console.error(err);
      say('공유 시트를 열지 못했어요. "파일에 저장하기"를 다시 눌러 주세요.', 'error');
    }
  }

  const fileInput = h('input', { type: 'file', accept: '.zip,application/zip', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const importBtn = h('button', { type: 'button', class: 'pp-btn', onClick: () => fileInput.click() }, '백업 가져오기');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    exportBtn.disabled = true;
    importBtn.disabled = true;
    say('백업 파일 읽는 중…');
    try {
      const backup = await readBackup(file);
      const photoCount = backup.items.reduce((n, it) => n + (it.photos?.length || 0), 0);
      const summary = `${backup.exportedAt ? formatFullDate(backup.exportedAt) : '날짜 모름'} 백업 · 항목 ${backup.items.length}개 (사진 ${photoCount}장)`;

      let mode = 'replace';
      if (ctx.items.length) {
        mode = await chooseDialog({
          title: '백업 가져오기',
          message: `${summary}\n지금 앱에 항목이 ${ctx.items.length}개 있어요. 어떻게 할까요?`,
          choices: [
            { id: 'merge', label: '합치기', desc: '지금 항목은 그대로 두고, 백업에만 있는 항목을 더해요. 같은 항목은 더 최근에 고친 쪽을 남겨요.' },
            { id: 'replace', label: '덮어쓰기', desc: '지금 항목을 모두 지우고 백업 내용으로 바꿔요.', danger: true },
          ],
        });
        if (!mode) {
          say('가져오기를 취소했어요.');
          return;
        }
      }
      say('가져오는 중…');
      const result = await restoreBackup(backup.items, mode);
      await ctx.reloadItems(); // 설정 화면도 새 숫자로 다시 그려짐
      const msg =
        mode === 'replace'
          ? `백업으로 바꿨어요. 항목 ${result.total}개.`
          : `합쳤어요. 새로 ${result.added}개, 바뀐 것 ${result.updated}개 · 모두 ${result.total}개.`;
      showToast(msg, { seconds: 4 });
    } catch (err) {
      if (!IMPORT_ERRORS[err?.message]) console.error(err);
      say(IMPORT_ERRORS[err?.message] || '가져오지 못했어요. 파일을 확인해 주세요.', 'error');
    } finally {
      exportBtn.disabled = false;
      importBtn.disabled = false;
    }
  });

  return [
    h('h2', { class: 'section-title' }, '백업'),
    h(
      'section',
      { class: 'set-form' },
      h('div', { class: 'set-line' }, h('span', {}, '마지막 백업'), lastEl),
      h('div', { class: 'pp-actions' }, exportBtn, importBtn),
      status,
      readyBox,
      fileInput,
    ),
    h('p', { class: 'set-note' }, '사진·미리보기 이미지까지 ZIP 파일 하나에 담겨요. 미리보기 함수 주소·비밀 키는 백업에 넣지 않아요.'),
  ];
}

// ───────── 영구 저장 ─────────

const PERSIST_TEXT = { granted: '허용됨', denied: '허용 안 됨', unsupported: '확인할 수 없음' };

function persistRow() {
  const value = h('span', { class: 'muted' }, '확인 중…');
  const retry = h('button', { type: 'button', class: 'mini-btn', hidden: true }, '다시 요청');
  const show = (state) => {
    value.textContent = PERSIST_TEXT[state] || PERSIST_TEXT.unsupported;
    value.className = state === 'granted' ? 'ok-text' : 'muted';
    retry.hidden = state !== 'denied';
  };
  retry.addEventListener('click', async () => show(await requestPersist()));
  persistState().then(show);
  return h('div', { class: 'set-row' }, h('span', {}, '영구 저장'), h('span', { class: 'set-row-end' }, retry, value));
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
