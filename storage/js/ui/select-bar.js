// 여러 개 골라 삭제: 선택 모드일 때 + 버튼 자리에 뜨는 아래쪽 막대
import { h } from './dom.js';

/**
 * @param {object} o
 * @param {() => string[]} o.visibleIds 지금 화면에 보이는 항목 id (전체 선택용)
 * @param {{ ids: Set<string> }} o.selection
 * @param {(ids: string[]) => void} o.onDelete
 * @param {() => void} o.onSelectAll 전체 선택/해제 후 화면 다시 그리기
 */
export function createSelectBar({ visibleIds, selection, onDelete, onSelectAll }) {
  const count = h('span', { class: 'select-count', 'aria-live': 'polite' });
  const allBtn = h('button', { type: 'button', class: 'select-all' });
  const delBtn = h('button', { type: 'button', class: 'select-delete' }, '삭제');
  const el = h('div', { class: 'select-bar', role: 'toolbar', 'aria-label': '선택한 항목' }, count, allBtn, delBtn);

  const allSelected = () => {
    const ids = visibleIds();
    return ids.length > 0 && ids.every((id) => selection.ids.has(id));
  };

  function update() {
    const n = selection.ids.size;
    count.textContent = n ? `${n}개 선택` : '항목을 골라 주세요';
    allBtn.textContent = allSelected() ? '선택 해제' : '전체 선택';
    allBtn.disabled = visibleIds().length === 0;
    delBtn.disabled = n === 0;
  }

  allBtn.addEventListener('click', () => {
    const ids = visibleIds();
    if (allSelected()) ids.forEach((id) => selection.ids.delete(id));
    else ids.forEach((id) => selection.ids.add(id));
    onSelectAll();
  });
  delBtn.addEventListener('click', () => {
    if (selection.ids.size) onDelete([...selection.ids]);
  });

  update();
  return { el, update };
}
