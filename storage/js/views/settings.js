// 설정 (1단계는 앱 정보만. 저장 공간·백업은 다음 단계에서 추가)
import { h } from '../ui/dom.js';
import { APP_VERSION } from '../config.js';
import { header, backButton } from './common.js';

export function renderSettings(ctx) {
  const row = (label, value) =>
    h('div', { class: 'set-row' }, h('span', {}, label), h('span', { class: 'muted' }, value));

  return [
    header({
      left: backButton(() => ctx.back()),
      center: h('h1', { class: 'topbar-title' }, '설정'),
    }),
    h(
      'main',
      { class: 'page' },
      h('section', { class: 'set-group' }, row('저장된 항목', `${ctx.items.length}개`), row('버전', APP_VERSION)),
      h('p', { class: 'set-note' }, '저장 공간 보기, 백업 내보내기·가져오기는 다음 업데이트에서 추가돼요.'),
    ),
  ];
}
