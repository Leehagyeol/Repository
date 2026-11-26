// 저장된 사진(Blob)을 <img>에 보여 줄 주소로 바꿈. 같은 사진은 주소를 한 번만 만듦.
const cache = new WeakMap();

export function blobUrl(blob) {
  if (!(blob instanceof Blob)) return '';
  let url = cache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    cache.set(blob, url);
  }
  return url;
}

export function releaseBlobUrl(blob) {
  const url = blob && cache.get(blob);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(blob);
  }
}

/** 목록에 쓸 대표 이미지: 사진의 첫 장 썸네일, 없으면 링크 미리보기 이미지 */
export function itemThumb(item) {
  return item.photos?.[0]?.thumb || item.previewImage || null;
}
