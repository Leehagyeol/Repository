// 추가 시트의 사진 고르기: 사진 보관함(여러 장) 또는 카메라. 고르는 즉시 한 장씩 줄여 둠.
import { h, icon } from './dom.js';
import { blobUrl, releaseBlobUrl } from './blob-url.js';
import { processPhoto } from '../photo.js';

/**
 * @param {Array} initial 이미 저장된 사진 [{ full, thumb, width, height }]
 */
export function createPhotoPicker({ initial = [], onChange }) {
  // 각 칸: { photo } 완료 / { pending: true } 줄이는 중
  const slots = initial.map((photo) => ({ photo }));
  let queue = Promise.resolve();
  let pendingCount = 0;
  let failed = 0;
  const idleWaiters = [];

  const libraryInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });

  const grid = h('ul', { class: 'pp-grid', 'aria-label': '고른 사진' });
  const status = h('p', { class: 'pp-status', role: 'status' });
  const el = h(
    'div',
    { class: 'pp' },
    grid,
    h(
      'div',
      { class: 'pp-actions' },
      h('button', { type: 'button', class: 'pp-btn', onClick: () => libraryInput.click() }, '사진 보관함'),
      h('button', { type: 'button', class: 'pp-btn', onClick: () => cameraInput.click() }, '카메라로 찍기'),
    ),
    status,
    libraryInput,
    cameraInput,
  );

  function render() {
    grid.replaceChildren(
      ...slots.map((slot) => {
        if (slot.pending) {
          return h('li', { class: 'pp-cell pending' }, h('span', { class: 'pp-spinner', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, '사진 줄이는 중'));
        }
        return h(
          'li',
          { class: 'pp-cell' },
          h('img', { src: blobUrl(slot.photo.thumb), alt: '', decoding: 'async' }),
          h(
            'button',
            {
              type: 'button',
              class: 'pp-remove',
              'aria-label': '이 사진 빼기',
              onClick: () => {
                const i = slots.indexOf(slot);
                if (i >= 0) slots.splice(i, 1);
                if (!initial.includes(slot.photo)) {
                  releaseBlobUrl(slot.photo.thumb);
                }
                render();
                onChange?.();
              },
            },
            icon('close'),
          ),
        );
      }),
    );
    grid.hidden = slots.length === 0;

    const done = slots.filter((s) => s.photo).length;
    const msgs = [];
    if (pendingCount) msgs.push(`사진 줄이는 중… (${done}/${done + pendingCount})`);
    else if (done) msgs.push(`${done}장`);
    if (failed) msgs.push(`${failed}장은 열지 못했어요`);
    status.textContent = msgs.join(' · ');
    status.classList.toggle('error', failed > 0 && !pendingCount);
  }

  function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    failed = 0;
    for (const file of files) {
      const slot = { pending: true };
      slots.push(slot);
      pendingCount += 1;
      // 아이폰 메모리를 아끼려고 한 장씩 차례로 처리
      queue = queue.then(async () => {
        try {
          slot.photo = await processPhoto(file);
          delete slot.pending;
        } catch (err) {
          console.warn(err);
          failed += 1;
          const i = slots.indexOf(slot);
          if (i >= 0) slots.splice(i, 1);
        }
        pendingCount -= 1;
        render();
        onChange?.();
        if (!pendingCount) idleWaiters.splice(0).forEach((fn) => fn());
      });
    }
    render();
    onChange?.();
  }

  for (const input of [libraryInput, cameraInput]) {
    input.addEventListener('change', () => {
      addFiles(input.files || []);
      input.value = ''; // 같은 사진을 다시 골라도 동작하게
    });
  }

  render();

  return {
    el,
    isBusy: () => pendingCount > 0,
    /** 줄이는 중인 사진이 모두 끝날 때까지 기다림 */
    whenIdle: () => (pendingCount ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve()),
    getPhotos: () => slots.filter((s) => s.photo).map((s) => s.photo),
    isChanged: () =>
      pendingCount > 0 ||
      slots.length !== initial.length ||
      slots.some((s, i) => s.photo !== initial[i]),
    /** 저장하지 않고 닫을 때 새로 만든 사진 주소 정리 */
    discard: () => slots.forEach((s) => s.photo && !initial.includes(s.photo) && releaseBlobUrl(s.photo.thumb)),
  };
}
