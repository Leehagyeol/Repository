// 사진 여러 장을 좌우로 넘겨 보는 띠 (CSS scroll-snap 사용 → 아이폰 손가락 넘김 그대로)
import { h } from './dom.js';
import { blobUrl } from './blob-url.js';

/**
 * @param {Array} photos [{ full, thumb, width, height }]
 * @param {object} opts
 * @param {number} [opts.start] 처음 보여 줄 사진 번호(0부터)
 * @param {(index:number) => void} [opts.onTap]
 * @param {string} [opts.className]
 */
export function createCarousel(photos, { start = 0, onTap, className = '' } = {}) {
  const track = h(
    'div',
    { class: 'car-track', tabindex: '0', 'aria-label': '사진, 좌우로 넘기기' },
    photos.map((p, i) =>
      h(
        'div',
        { class: 'car-slide' },
        h('img', {
          src: blobUrl(p.full || p.thumb),
          alt: `사진 ${i + 1}/${photos.length}`,
          decoding: 'async',
          width: p.width || null,
          height: p.height || null,
          onClick: onTap ? () => onTap(i) : null,
        }),
      ),
    ),
  );
  const counter = photos.length > 1 ? h('span', { class: 'car-counter', 'aria-live': 'polite' }) : null;
  const dots =
    photos.length > 1 && photos.length <= 10
      ? h('div', { class: 'car-dots', 'aria-hidden': 'true' }, photos.map(() => h('span', { class: 'car-dot' })))
      : null;
  const el = h('div', { class: `car ${className}` }, track, counter, dots);

  let index = -1;
  function setIndex(i) {
    if (i === index) return;
    index = i;
    if (counter) counter.textContent = `${i + 1} / ${photos.length}`;
    dots?.querySelectorAll('.car-dot').forEach((d, j) => d.classList.toggle('on', j === i));
  }

  track.addEventListener(
    'scroll',
    () => {
      const w = track.clientWidth || 1;
      setIndex(Math.max(0, Math.min(photos.length - 1, Math.round(track.scrollLeft / w))));
    },
    { passive: true },
  );

  // PC에서 키보드 ← → 로도 넘기기
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = Math.max(0, Math.min(photos.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  });

  setIndex(start);
  // 화면에 붙은 뒤 시작 위치로 이동
  requestAnimationFrame(() => {
    if (start > 0) track.scrollLeft = start * track.clientWidth;
  });

  return { el, getIndex: () => index };
}
