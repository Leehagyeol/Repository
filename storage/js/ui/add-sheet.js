// 아래에서 올라오는 추가·수정 시트. 유형: 링크 / 사진 / 텍스트
import { h } from './dom.js';
import { CATEGORIES, getCategory } from '../config.js';
import { createKeywordInput } from './keyword-input.js';
import { createPhotoPicker } from './photo-picker.js';
import { createLinkInput } from './link-input.js';

const TYPES = [
  { id: 'link', label: '링크', title: '링크 추가' },
  { id: 'photo', label: '사진', title: '사진 추가' },
  { id: 'text', label: '텍스트', title: '텍스트 추가' },
];

let openSheet = null;

export function isSheetOpen() {
  return openSheet !== null;
}

/**
 * @param {object} opts
 * @param {'add'|'edit'} opts.mode
 * @param {object} [opts.item] 수정할 항목
 * @param {string} [opts.defaultCategory] 추가할 때 미리 고를 카테고리 id ('' = 직접 선택)
 * @param {'link'|'photo'|'text'} [opts.defaultType] 추가할 때 처음 보여 줄 유형
 * @param {() => string[]} opts.getKnownKeywords
 * @param {(fields) => Promise<void>} opts.onSave
 */
export function openItemSheet({
  mode,
  item,
  defaultCategory = '',
  defaultType = 'link',
  getKnownKeywords,
  onSave,
  prefillLink = '',
  findDuplicate,
  onOpenExisting,
}) {
  if (openSheet) return;

  const start = {
    type: item?.type || defaultType,
    title: item?.title || '',
    note: item?.note || '',
    category: item?.category || defaultCategory || '',
    keywords: item?.keywords || [],
    photos: item?.photos || [],
  };
  let type = start.type;
  let category = start.category;
  // 사용자가 제목을 직접 고쳤으면 링크 미리보기 제목으로 덮어쓰지 않음 (수정할 때는 처음부터 그대로 둠)
  let titleTouched = mode === 'edit' && Boolean(start.title);

  // ── 유형 고르기 (추가할 때만) ──
  const typeButtons = TYPES.map((t) =>
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(t.id === type), onClick: () => setType(t.id) }, t.label),
  );
  const segment = mode === 'add' ? h('div', { class: 'seg', role: 'group', 'aria-label': '유형' }, typeButtons) : null;

  // ── 링크 ──
  const link = createLinkInput({
    initial: item?.type === 'link' ? item : null,
    prefillText: prefillLink,
    // 수정할 때는 자기 자신은 빼고 찾음
    findDuplicate: findDuplicate ? (url) => findDuplicate(url, item?.id) : null,
    onOpenExisting: onOpenExisting
      ? (existing) => {
          close();
          onOpenExisting(existing);
        }
      : null,
    onTitle: (candidate) => {
      if (!titleTouched) titleInput.value = candidate;
      hideError();
    },
    onChange: hideError,
  });
  const linkSection = h('div', { class: 'type-section' }, link.el);

  // ── 사진 ──
  const picker = createPhotoPicker({ initial: start.photos, onChange: onPhotosChange });
  const groupNote = h('p', { class: 'group-note', hidden: true });
  const photoSection = h('div', { class: 'type-section' }, picker.el, groupNote);

  // ── 제목·내용 ──
  const titleInput = h('input', {
    type: 'text',
    id: 'f-title',
    class: 'field',
    placeholder: '제목 (선택)',
    value: start.title,
    enterkeyhint: 'next',
    autocomplete: 'off',
  });
  const noteInput = h('textarea', { id: 'f-note', class: 'field note', value: start.note });
  titleInput.addEventListener('input', () => (titleTouched = titleInput.value.trim() !== ''));
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      noteInput.focus();
    }
  });

  // ── 카테고리 ──
  const catButtons = CATEGORIES.map((c) =>
    h(
      'button',
      {
        type: 'button',
        class: 'cat-btn',
        'aria-pressed': String(c.id === category),
        onClick: () => {
          category = c.id;
          catButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(CATEGORIES[i].id === category)));
          hideError();
          updateGroupNote();
        },
      },
      c.name,
    ),
  );

  // ── 키워드 ──
  const kwHint = h('p', { class: 'kw-hint' }, '키워드를 넣으면 찾기 쉽습니다');
  const kw = createKeywordInput({ initial: start.keywords, getKnown: getKnownKeywords, onChange: updateHint });
  const kwLabelNote = h('span', { class: 'muted' });

  const errorEl = h('p', { class: 'form-error', role: 'alert', hidden: true });
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError() {
    errorEl.hidden = true;
  }
  noteInput.addEventListener('input', hideError);

  // ── 시트 틀 ──
  const cancelBtn = h('button', { type: 'button', class: 'sheet-btn' }, '취소');
  const saveBtn = h('button', { type: 'button', class: 'sheet-btn primary' }, '저장');
  const sheetTitle = h('h2', { id: 'sheet-title', class: 'sheet-title' });
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'sheet-head' }, cancelBtn, sheetTitle, saveBtn),
    h(
      'div',
      { class: 'sheet-body' },
      segment,
      linkSection,
      photoSection,
      h('label', { class: 'sr-only', for: 'f-title' }, '제목'),
      titleInput,
      h('label', { class: 'sr-only', for: 'f-note' }, '내용'),
      noteInput,
      h('p', { class: 'form-label' }, '카테고리'),
      h('div', { class: 'cat-grid', role: 'group', 'aria-label': '카테고리' }, catButtons),
      h('label', { class: 'form-label', for: 'kw-input' }, '키워드 ', kwLabelNote),
      kw.el,
      kwHint,
      errorEl,
    ),
  );
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const overlay = h('div', { class: 'sheet-overlay' }, backdrop, panel);

  function setType(next) {
    type = next;
    typeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(TYPES[i].id === type)));
    linkSection.hidden = type !== 'link';
    photoSection.hidden = type !== 'photo';
    const isText = type === 'text';
    titleInput.placeholder = type === 'link' ? '제목 (자동으로 채워져요)' : '제목 (선택)';
    noteInput.placeholder = isText ? '내용을 입력하세요' : '메모 (선택)';
    noteInput.rows = isText ? 6 : 3;
    noteInput.classList.toggle('short', !isText);
    kwLabelNote.textContent = isText ? '(선택)' : '(권장)';
    sheetTitle.textContent = mode === 'edit' ? '수정' : TYPES.find((t) => t.id === type).title;
    hideError();
    updateHint();
  }

  function updateHint() {
    kwHint.hidden = !(type !== 'text' && kw.getKeywords().length === 0);
  }

  /** 사진 여러 장일 때 어떻게 저장되는지 미리 알려 줌 */
  function updateGroupNote() {
    const n = picker.getPhotos().length;
    if (mode === 'edit' || n < 2 || !category) {
      groupNote.hidden = true;
      return;
    }
    const cat = getCategory(category);
    groupNote.textContent = cat?.groupPhotos
      ? `사진 ${n}장을 한 항목으로 묶어 고른 순서대로 저장해요.`
      : `사진 ${n}장을 각각 따로 저장해요.`;
    groupNote.hidden = false;
  }

  function onPhotosChange() {
    hideError();
    updateGroupNote();
  }

  setType(type);

  // ── 키보드가 올라오면 시트가 키보드 위에 오도록 화면 보이는 영역에 맞춤 ──
  const vv = window.visualViewport;
  const fitViewport = () => {
    if (!vv) return;
    overlay.style.top = `${vv.offsetTop}px`;
    overlay.style.height = `${vv.height}px`;
  };
  vv?.addEventListener('resize', fitViewport);
  vv?.addEventListener('scroll', fitViewport);
  fitViewport();

  // ── 열기·닫기 ──
  document.body.append(overlay);
  document.documentElement.classList.add('sheet-lock');
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
  openSheet = { close };

  function isDirty() {
    return (
      titleInput.value !== start.title ||
      noteInput.value !== start.note ||
      category !== start.category ||
      kw.getKeywords().join('\n') !== start.keywords.join('\n') ||
      picker.isChanged() ||
      link.isChanged()
    );
  }

  function close() {
    vv?.removeEventListener('resize', fitViewport);
    vv?.removeEventListener('scroll', fitViewport);
    document.activeElement?.blur?.();
    overlay.classList.remove('open');
    document.documentElement.classList.remove('sheet-lock');
    openSheet = null;
    setTimeout(() => overlay.remove(), 300);
  }

  function tryCancel() {
    kw.flush();
    if (isDirty() && !confirm('작성 중인 내용을 버릴까요?')) return;
    picker.discard();
    close();
  }

  cancelBtn.addEventListener('click', tryCancel);
  backdrop.addEventListener('click', tryCancel);

  let saving = false;
  saveBtn.addEventListener('click', async () => {
    if (saving) return;
    kw.flush();
    const note = noteInput.value.replace(/\s+$/, '');

    if (type === 'text' && !note.trim()) return showError('내용을 입력해 주세요.');
    if (type === 'photo' && !picker.isBusy() && picker.getPhotos().length === 0) return showError('사진을 골라 주세요.');
    if (!category) return showError('카테고리를 골라 주세요.');

    saving = true;
    saveBtn.disabled = true;
    try {
      let extra = { photos: [] };
      if (type === 'photo') {
        if (picker.isBusy()) {
          saveBtn.textContent = '줄이는 중…';
          await picker.whenIdle();
        }
        if (picker.getPhotos().length === 0) throw new Error('no-photo');
        extra = { photos: picker.getPhotos() };
      } else if (type === 'link') {
        if (link.isBusy()) saveBtn.textContent = '불러오는 중…';
        await link.settle();
        const data = link.getData();
        if (!data.url) throw new Error('no-link');
        extra = { ...data, photos: [] };
      }
      saveBtn.textContent = '저장';
      const title = titleInput.value.trim() || (type === 'link' ? link.getTitleCandidate() : '');
      await onSave({ type, title, note, category, keywords: kw.getKeywords(), ...extra });
      close();
    } catch (err) {
      saveBtn.textContent = '저장';
      const msg = {
        'no-photo': '사진을 열지 못했어요. 다른 사진을 골라 주세요.',
        'no-link': '링크를 넣어 주세요.',
      }[err.message];
      if (!msg) console.error(err);
      showError(msg || '저장하지 못했어요. 다시 시도해 주세요.');
      saving = false;
      saveBtn.disabled = false;
    }
  });
}

/** 다른 화면으로 강제로 넘어갈 때 시트를 닫음 */
export function closeItemSheet() {
  openSheet?.close();
}
