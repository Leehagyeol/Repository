// 추가 시트의 링크 입력: 붙여넣기 → 미리보기(제목·썸네일) → 실패하면 스크린샷 고르기
import { h } from './dom.js';
import { blobUrl } from './blob-url.js';
import { extractLink, hostLabel, youtubeInfo } from '../links.js';
import { loadPreview, isPreviewConfigured, PREVIEW_IMAGE_SIDE } from '../preview.js';
import { shrinkImage } from '../photo.js';

const MSG = {
  loading: '미리보기 불러오는 중…',
  failed: '미리보기를 가져오지 못했어요. 제목을 직접 고치고, 스크린샷을 미리보기로 쓸 수 있어요.',
  notConfigured: '설정에서 미리보기 함수를 연결하면 제목과 썸네일이 자동으로 붙어요. 지금은 제목을 직접 넣어 주세요.',
  noLink: '링크를 찾지 못했어요. 주소가 들어 있는지 확인해 주세요.',
  pasteHelp: '입력 칸을 길게 눌러 "붙여넣기"를 골라 주세요.',
};

/**
 * @param {object} opts
 * @param {object} [opts.initial] 수정할 링크 항목 { url, linkKind, siteName, description, previewImage }
 * @param {(title: string) => void} opts.onTitle 제목 후보가 생기면 알려 줌 (사용자가 제목을 고치지 않았을 때만 시트가 반영)
 * @param {() => void} [opts.onChange]
 */
export function createLinkInput({ initial, onTitle, onChange }) {
  const state = {
    url: initial?.url || '',
    extra: '',
    kind: initial?.linkKind || 'page',
    siteName: initial?.siteName || '',
    description: initial?.description || '',
    image: initial?.previewImage || null,
    customImage: false, // 사용자가 스크린샷을 골랐으면 미리보기 이미지로 덮어쓰지 않음
    titleCandidate: '',
    status: '',
    statusKind: '',
  };
  let token = 0;
  let pending = null;
  let debounce = null;

  const input = h('textarea', {
    id: 'f-link',
    class: 'field link-field',
    rows: '2',
    placeholder: '링크 또는 공유 문구를 붙여넣으세요',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    value: state.url,
  });

  const canReadClipboard = Boolean(navigator.clipboard?.readText);
  const pasteBtn = canReadClipboard
    ? h('button', { type: 'button', class: 'paste-btn', onClick: pasteFromClipboard }, '붙여넣기')
    : null;

  const shotInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const shotBtn = h('button', { type: 'button', class: 'pp-btn shot-btn', onClick: () => shotInput.click() });
  const card = h('div', { class: 'link-card', hidden: true });
  const status = h('p', { class: 'link-status', role: 'status' });

  const el = h(
    'div',
    { class: 'link-section' },
    pasteBtn,
    h('label', { class: 'sr-only', for: 'f-link' }, '링크'),
    input,
    card,
    status,
    shotBtn,
    shotInput,
  );

  function setStatus(text, kind = '') {
    state.status = text;
    state.statusKind = kind;
  }

  function render() {
    // 미리보기 카드
    if (state.url) {
      const img = state.image
        ? h(
            'span',
            { class: 'link-card-img' },
            h('img', { src: blobUrl(state.image), alt: '' }),
            state.kind === 'video' ? h('span', { class: 'play-badge', 'aria-label': '영상' }, '▶') : null,
          )
        : null;
      card.replaceChildren(
        ...(img ? [img] : []),
        h(
          'span',
          { class: 'link-card-text' },
          h('span', { class: 'link-card-site' }, state.siteName || hostLabel(state.url)),
          state.description ? h('span', { class: 'link-card-desc' }, state.description) : null,
        ),
      );
      card.hidden = false;
    } else {
      card.hidden = true;
    }
    status.textContent = state.status;
    status.className = `link-status ${state.statusKind}`;
    status.hidden = !state.status;
    shotBtn.textContent = state.image ? '스크린샷으로 바꾸기' : '스크린샷 고르기';
    shotBtn.hidden = !state.url;
  }

  async function runPreview(url, extra) {
    const my = ++token;
    state.url = url;
    state.extra = extra;
    const yt = youtubeInfo(url);
    state.kind = yt ? 'video' : 'page';
    state.siteName = yt ? 'YouTube' : hostLabel(url);
    state.description = '';
    if (!state.customImage) state.image = null;
    state.titleCandidate = extra || hostLabel(url);
    onTitle?.(state.titleCandidate);
    setStatus(isPreviewConfigured() ? MSG.loading : MSG.notConfigured, isPreviewConfigured() ? 'loading' : '');
    render();
    onChange?.();
    if (!isPreviewConfigured()) return;

    const result = await loadPreview(url);
    if (my !== token) return; // 그사이 다른 링크를 넣었으면 무시
    state.kind = result.kind;
    state.siteName = result.siteName || state.siteName;
    state.description = result.description || '';
    if (result.image && !state.customImage) state.image = result.image;
    if (result.ok) {
      // 공유 문구보다 페이지 제목을 우선, 제목이 없으면 공유 문구 → 도메인
      state.titleCandidate = result.title || extra || hostLabel(url);
      setStatus('');
    } else {
      state.titleCandidate = extra || hostLabel(url);
      setStatus(MSG.failed, 'error');
    }
    onTitle?.(state.titleCandidate);
    render();
    onChange?.();
  }

  function handleText({ immediate = false } = {}) {
    clearTimeout(debounce);
    const go = () => {
      const { url, extra } = extractLink(input.value);
      if (!url) {
        if (input.value.trim()) {
          token++;
          state.url = '';
          setStatus(MSG.noLink, 'error');
          render();
        }
        return;
      }
      if (url === state.url && extra === state.extra) return;
      pending = runPreview(url, extra).finally(() => {
        pending = null;
      });
    };
    if (immediate) go();
    else debounce = setTimeout(go, 600);
  }

  async function pasteFromClipboard() {
    try {
      // 아이폰은 여기서 "붙여넣기" 확인 말풍선을 띄움 (앱이 클립보드를 몰래 읽을 수 없음)
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        setStatus('클립보드가 비어 있어요.', 'error');
        render();
        return;
      }
      input.value = text.trim();
      handleText({ immediate: true });
    } catch {
      setStatus(MSG.pasteHelp, 'error');
      render();
      input.focus();
    }
  }

  input.addEventListener('input', () => handleText());
  input.addEventListener('paste', () => setTimeout(() => handleText({ immediate: true }), 0));
  input.addEventListener('blur', () => handleText({ immediate: true }));

  shotInput.addEventListener('change', async () => {
    const file = shotInput.files?.[0];
    shotInput.value = '';
    if (!file) return;
    try {
      state.image = await shrinkImage(file, PREVIEW_IMAGE_SIDE);
      state.customImage = true;
      if (state.statusKind === 'error') setStatus('스크린샷을 미리보기로 쓸게요.');
    } catch {
      setStatus('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.', 'error');
    }
    render();
    onChange?.();
  });

  render();

  return {
    el,
    /** 저장 전에 입력 칸의 글을 바로 반영하고, 불러오는 중이면 기다림 */
    async settle() {
      handleText({ immediate: true });
      if (pending) await pending;
    },
    isBusy: () => Boolean(pending),
    getTitleCandidate: () => state.titleCandidate || (state.url ? hostLabel(state.url) : ''),
    getData: () => ({
      url: state.url,
      linkKind: state.kind,
      siteName: state.siteName || hostLabel(state.url),
      description: state.description,
      previewImage: state.image,
    }),
    isChanged: () => state.url !== (initial?.url || '') || state.image !== (initial?.previewImage || null),
  };
}
