// 검색(F8)과 키워드 필터(F9)
//
// 한글 부분 일치: 글자를 자모로 풀어서(NFD) 비교하므로, 입력 중인 "닭나"도 "닭날개"를 찾음.
// 검색 대상: 제목, 키워드, 메모(텍스트 본문), 사이트 이름(링크는 도메인도)
import { hostLabel } from './links.js';

export function normalize(s) {
  return String(s || '').normalize('NFD').toLowerCase();
}

/** 띄어쓰기로 나눈 낱말이 모두 들어 있어야 찾음. 앞의 #은 무시 */
export function parseQuery(query) {
  return normalize(query)
    .split(/\s+/)
    .map((t) => t.replace(/^#+/, ''))
    .filter(Boolean);
}

function haystack(item) {
  return normalize(
    [item.title, (item.keywords || []).join(' '), item.note, item.siteName, item.url ? hostLabel(item.url) : ''].join('\n'),
  );
}

export function hasKeyword(item, keyword) {
  const k = normalize(keyword);
  return (item.keywords || []).some((x) => normalize(x) === k);
}

/**
 * @param {Array} items
 * @param {{ query?: string, keyword?: string|null }} opts
 */
export function filterItems(items, { query = '', keyword = null } = {}) {
  const terms = parseQuery(query);
  return items.filter((item) => {
    if (keyword && !hasKeyword(item, keyword)) return false;
    if (!terms.length) return true;
    const text = haystack(item);
    return terms.every((t) => text.includes(t));
  });
}
