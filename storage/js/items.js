// 항목(item) 모양과 정렬·키워드 도우미.
// 필드는 기획문서 "항목 유형과 데이터 모델"을 따릅니다. 사진·링크 필드는 다음 단계를 위해 자리만 둡니다.

export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newItem(fields = {}) {
  const now = Date.now();
  return {
    id: makeId(),
    type: 'text', // 'link' | 'photo' | 'text'
    category: '', // config.js CATEGORIES의 id
    keywords: [],
    title: '',
    note: '', // 메모 또는 텍스트 본문
    url: null, // 링크만
    linkKind: null, // 'video' | 'page' (링크만)
    siteName: null,
    previewImage: null, // Blob (링크 미리보기 사본)
    photos: [], // [{ full: Blob, thumb: Blob }]
    pinned: false,
    createdAt: now, // 밀리초 숫자
    updatedAt: now,
    ...fields,
  };
}

/** 고정(핀) 항목 먼저, 그다음 최신순 */
export function sortItems(items) {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

/** 최신순만 (홈의 최근 저장) */
export function sortByRecent(items) {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

export function normalizeKeyword(word) {
  return String(word || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[,\s]+/g, '');
}

/** 전에 쓴 키워드 목록: 많이 쓴 순, 같으면 최근에 쓴 순 */
export function keywordList(items) {
  const stats = new Map();
  for (const item of items) {
    for (const k of item.keywords || []) {
      const s = stats.get(k) || { count: 0, last: 0 };
      s.count += 1;
      s.last = Math.max(s.last, item.updatedAt || item.createdAt || 0);
      stats.set(k, s);
    }
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .map(([k]) => k);
}
