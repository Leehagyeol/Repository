// 앱 설정 한 곳. 카테고리 이름을 바꾸거나 추가하려면 CATEGORIES만 고치면 됩니다.
//
// - id: 저장할 때 쓰는 영문 이름. 한 번 정하면 바꾸지 마세요(이미 저장된 항목이 이 값을 가리킵니다).
// - name: 화면에 보이는 이름. 언제든 바꿔도 됩니다.
// - layout: 카테고리 화면의 목록 모양. 'list' 목록 / 'card' 카드(썸네일 크게, 2열) / 'grid' 사진 격자(3열).
//   홈의 "최근 저장"은 항상 목록입니다.
// - groupPhotos: true면 사진 여러 장을 한 항목으로 묶어 고른 순서대로 보여 줌(위에서 아래로).
//   없거나 false면 사진마다 따로 저장됨.
export const CATEGORIES = [
  { id: 'recipe', name: '레시피', layout: 'card', groupPhotos: true },
  { id: 'parenting', name: '육아', layout: 'list' },
  { id: 'craft', name: '만들기', layout: 'card' },
  { id: 'shopping', name: '쇼핑', layout: 'list' },
  { id: 'memo', name: '메모', layout: 'list' },
  { id: 'meme', name: '짤방', layout: 'grid' },
];

export const APP_VERSION = '1.0.0 (1차 완성)';

// 장보기 앱(grocery)과 같은 사이트를 쓰므로 이름 앞에 꼭 'storage-'를 붙입니다.
export const DB_NAME = 'storage-db';
export const KEY_PREFIX = 'storage-';

export const UNDO_SECONDS = 5;
export const RECENT_LIMIT = 30;

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function categoryName(id) {
  const c = getCategory(id);
  return c ? c.name : '분류 없음';
}
