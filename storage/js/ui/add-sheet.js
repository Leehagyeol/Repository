// 아래에서 올라오는 추가·수정 시트. 유형: 텍스트 / 사진 (링크는 3단계)
import { h } from './dom.js';
import { CATEGORIES } from '../config.js';
import { createKeywordInput } from './keyword-input.js';
import { createPhotoPicker } from './photo-picker.js';

const TYPES = [
  { id: 'text', label: '텍스트' },
  { id: 'photo', label: '사진' },
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
 * @param {'text'|'photo'} [opts.defaultType] 추가할 때 처음 보여 줄 유형
 * @param {() => string[]} opts.getKnownKeywords
 * @param {(fields) => Promise<void>} opts.onSave { type, title, note, category, keywords, photos }
 */
export function openItemSheet({ mode, item, defaultCategory = '', defaultType = 'text', getKnownKeywords, onSave }) {
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

  // ── 유형 고르기 (추가할 때만) ──
  const typeButtons = TYPES.map((t) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg-btn',
        'aria-pressed': String(t.id === type),
        onClick: () => setType(t.id),
      },
      t.label,
    ),
  );
  const segment = mode === 'add' ? h('div', { class: 'seg', role: 'group', 'aria-label': '유형' }, typeButtons) : null;

  // ── 사진 ──
  const picker = createPhotoPicker({ initial: start.photos, onChange: hideError });
  const photoSection = h('div', { class: 'photo-section' }, picker.el);

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
    const isPhoto = type === 'photo';
    photoSection.hidden = !isPhoto;
    noteInput.placeholder = isPhoto ? '메모 (선택)' : '내용을 입력하세요';
    noteInput.rows = isPhoto ? 3 : 6;
    noteInput.classList.toggle('short', isPhoto);
    kwLabelNote.textContent = isPhoto ? '(권장)' : '(선택)';
    sheetTitle.textContent = mode === 'edit' ? '수정' : isPhoto ? '사진 추가' : '텍스트 추가';
    hideError();
    updateHint();
  }

  function updateHint() {
    kwHint.hidden = !(type === 'photo' && kw.getKeywords().length === 0);
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
      picker.isChanged()
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
      if (type === 'photo' && picker.isBusy()) {
        saveBtn.textContent = '줄이는 중…';
        await picker.whenIdle();
        saveBtn.textContent = '저장';
        if (picker.getPhotos().length === 0) throw new Error('no-photo');
      }
      await onSave({
        type,
        title: titleInput.value.trim(),
        note,
        category,
        keywords: kw.getKeywords(),
        photos: type === 'photo' ? picker.getPhotos() : [],
      });
      close();
    } catch (err) {
      console.error(err);
      saveBtn.textContent = '저장';
      showError(err.message === 'no-photo' ? '사진을 열지 못했어요. 다른 사진을 골라 주세요.' : '저장하지 못했어요. 다시 시도해 주세요.');
      saving = false;
      saveBtn.disabled = false;
    }
  });
}

/** 다른 화면으로 강제로 넘어갈 때 시트를 닫음 */
export function closeItemSheet() {
  openSheet?.close();
}
