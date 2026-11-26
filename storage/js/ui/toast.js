// 아래쪽 알림 (예: "삭제했어요  [되돌리기]")
import { h } from './dom.js';

let current = null;

export function showToast(message, { actionLabel, onAction, seconds = 3 } = {}) {
  hideToast();
  const actionBtn = actionLabel
    ? h('button', { type: 'button', class: 'toast-action' }, actionLabel)
    : null;
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'toast-msg' }, message), actionBtn);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const timer = setTimeout(hideToast, seconds * 1000);
  current = { el, timer };

  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      hideToast();
      onAction?.();
    });
  }
}

export function hideToast() {
  if (!current) return;
  const { el, timer } = current;
  clearTimeout(timer);
  current = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
}
