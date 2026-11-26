// 아래에서 올라오는 추가·수정 시트. 1단계는 "텍스트"만.
import { h } from './dom.js';
import { CATEGORIES } from '../config.js';
import { createKeywordInput } from './keyword-input.js';

let openSheet = null;

export function isSheetOpen() {
  return openSheet !== null;
}

/**
 * @param {object} opts
 * @param {'add'|'edit'} opts.mode
 * @param {object} [opts.item] 수정할 항목
 * @param {string} [opts.defaultCategory] 추가할 때 미리 고를 카테고리 id ('' = 직접 선택)
 * @param {() => string[]} opts.getKnownKeywords
 * @param {(fields) => Promise<void>} opts.onSave { title, note, category, keywords }
 */
export function openItemSheet({ mode, item, defaultCategory = '', getKnownKeywords, onSave }) {
  if (openSheet) return;

  const start = {
    title: item?.title || '',
    note: item?.note || '',
    category: item?.category || defaultCategory || '',
    keywords: item?.keywords || [],
  };
  let category = start.category;

  // ── 입력 칸 ──
  const titleInput = h('input', {
    type: 'text',
    id: 'f-title',
    class: 'field',
    placeholder: '제목 (선택)',
    value: start.title,
    enterkeyhint: 'next',
    autocomplete: 'off',
  });
  const noteInput = h('textarea', {
    id: 'f-note',
    class: 'field note',
    rows: '6',
    placeholder: '내용을 입력하세요',
    value: start.note,
  });
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      noteInput.focus();
    }
  });

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

  const kw = createKeywordInput({ initial: start.keywords, getKnown: getKnownKeywords });

  const errorEl = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const hideError = () => (errorEl.hidden = true);
  noteInput.addEventListener('input', hideError);

  // ── 시트 틀 ──
  const cancelBtn = h('button', { type: 'button', class: 'sheet-btn' }, '취소');
  const saveBtn = h('button', { type: 'button', class: 'sheet-btn primary' }, '저장');
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    h(
      'div',
      { class: 'sheet-head' },
      cancelBtn,
      h('h2', { id: 'sheet-title', class: 'sheet-title' }, mode === 'edit' ? '수정' : '텍스트 추가'),
      saveBtn,
    ),
    h(
      'div',
      { class: 'sheet-body' },
      h('label', { class: 'sr-only', for: 'f-title' }, '제목'),
      titleInput,
      h('label', { class: 'sr-only', for: 'f-note' }, '내용'),
      noteInput,
      h('p', { class: 'form-label' }, '카테고리'),
      h('div', { class: 'cat-grid', role: 'group', 'aria-label': '카테고리' }, catButtons),
      h('label', { class: 'form-label', for: 'kw-input' }, '키워드 ', h('span', { class: 'muted' }, '(선택)')),
      kw.el,
      errorEl,
    ),
  );
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const overlay = h('div', { class: 'sheet-overlay' }, backdrop, panel);

  // ── 키보드가 올라오면 시트가 키보드 위에 오도록 화면 보이는 영역에 맞춤 ──
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    overlay.style.top = `${vv.offsetTop}px`;
    overlay.style.height = `${vv.height}px`;
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  // ── 열기·닫기 ──
  document.body.append(overlay);
  document.documentElement.classList.add('sheet-lock');
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
  openSheet = { close };

  function isDirty() {
    const kws = kw.getKeywords();
    return (
      titleInput.value !== start.title ||
      noteInput.value !== start.note ||
      category !== start.category ||
      kws.join('\n') !== start.keywords.join('\n')
    );
  }

  function close() {
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    document.activeElement?.blur?.();
    overlay.classList.remove('open');
    document.documentElement.classList.remove('sheet-lock');
    openSheet = null;
    setTimeout(() => overlay.remove(), 300);
  }

  function tryCancel() {
    kw.flush();
    if (isDirty() && !confirm('작성 중인 내용을 버릴까요?')) return;
    close();
  }

  cancelBtn.addEventListener('click', tryCancel);
  backdrop.addEventListener('click', tryCancel);

  let saving = false;
  saveBtn.addEventListener('click', async () => {
    if (saving) return;
    kw.flush();
    const note = noteInput.value.replace(/\s+$/, '');
    if (!note.trim()) {
      showError('내용을 입력해 주세요.');
      return;
    }
    if (!category) {
      showError('카테고리를 골라 주세요.');
      return;
    }
    saving = true;
    saveBtn.disabled = true;
    try {
      await onSave({
        title: titleInput.value.trim(),
        note,
        category,
        keywords: kw.getKeywords(),
      });
      close();
    } catch (err) {
      console.error(err);
      showError('저장하지 못했어요. 다시 시도해 주세요.');
      saving = false;
      saveBtn.disabled = false;
    }
  });
}

/** 다른 화면으로 강제로 넘어갈 때 시트를 닫음 */
export function closeItemSheet() {
  openSheet?.close();
}
