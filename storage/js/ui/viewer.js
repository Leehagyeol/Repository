// 사진 크게 보기 (화면 전체, 검은 바탕, 좌우로 넘기기)
import { h, icon } from './dom.js';
import { createCarousel } from './carousel.js';

let open = null;

export function isViewerOpen() {
  return open !== null;
}

export function openViewer(photos, start = 0) {
  if (open) return;
  const carousel = createCarousel(photos, { start, className: 'car-full' });
  const closeBtn = h('button', { type: 'button', class: 'viewer-close', 'aria-label': '닫기' }, icon('close'));
  const el = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': '사진 크게 보기' }, carousel.el, closeBtn);

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  function close() {
    document.removeEventListener('keydown', onKey);
    el.classList.remove('open');
    document.documentElement.classList.remove('sheet-lock');
    open = null;
    setTimeout(() => el.remove(), 200);
  }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  document.documentElement.classList.add('sheet-lock');
  requestAnimationFrame(() => el.classList.add('open'));
  el.querySelector('.car-track').focus({ preventScroll: true });
  open = { close };
}

export function closeViewer() {
  open?.close();
}
