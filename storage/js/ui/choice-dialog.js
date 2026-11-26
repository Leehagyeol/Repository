// 고르기 창 (예: 백업 가져오기 → 합치기 / 덮어쓰기 / 취소)
import { h } from './dom.js';

/**
 * @param {{ title: string, message?: string, choices: { id: string, label: string, desc?: string, danger?: boolean }[], cancelLabel?: string }} opts
 * @returns {Promise<string|null>} 고른 id, 취소하면 null
 */
export function chooseDialog({ title, message, choices, cancelLabel = '취소' }) {
  return new Promise((resolve) => {
    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      el.classList.remove('open');
      document.documentElement.classList.remove('sheet-lock');
      setTimeout(() => el.remove(), 200);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
    };

    const el = h(
      'div',
      { class: 'dialog-overlay' },
      h('div', { class: 'dialog-backdrop', onClick: () => finish(null) }),
      h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title' },
        h('h2', { id: 'dlg-title', class: 'dialog-title' }, title),
        message ? h('p', { class: 'dialog-msg' }, message) : null,
        h(
          'div',
          { class: 'dialog-choices' },
          choices.map((c) =>
            h(
              'button',
              { type: 'button', class: c.danger ? 'dialog-btn danger' : 'dialog-btn', onClick: () => finish(c.id) },
              h('span', { class: 'dialog-btn-label' }, c.label),
              c.desc ? h('span', { class: 'dialog-btn-desc' }, c.desc) : null,
            ),
          ),
          h('button', { type: 'button', class: 'dialog-btn cancel', onClick: () => finish(null) }, cancelLabel),
        ),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(el);
    document.documentElement.classList.add('sheet-lock');
    requestAnimationFrame(() => el.classList.add('open'));
  });
}
