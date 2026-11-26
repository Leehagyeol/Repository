// 사진 줄이기: 긴 변 1600px JPEG(품질 0.8) + 목록용 400px 썸네일
//
// HEIC: 아이폰 Safari는 HEIC를 직접 열 수 있고, 사진 보관함에서 고를 때 보통 JPEG로 바꿔서 넘겨줍니다.
// 어느 쪽이든 <img>로 연 뒤 캔버스에서 JPEG로 다시 저장하므로 결과는 항상 JPEG입니다.
// 사진의 회전 정보(EXIF)는 <img>가 자동으로 반영하므로 세로 사진도 바로 섭니다.

export const FULL_SIDE = 1600;
export const FULL_QUALITY = 0.8;
export const THUMB_SIDE = 400;
export const THUMB_QUALITY = 0.75;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (ok) => {
      URL.revokeObjectURL(url);
      if (ok && img.naturalWidth > 0) resolve(img);
      else reject(new Error('이 사진 형식은 열 수 없어요.'));
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.decoding = 'async';
    img.src = url;
  });
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** 큰 비율로 한 번에 줄이면 거칠어지므로 반씩 나눠 줄임 */
function drawScaled(source, sw, sh, tw, th) {
  let cur = source;
  let cw = sw;
  let ch = sh;
  const temps = [];
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.round(cw / 2);
    const nh = Math.round(ch / 2);
    const step = makeCanvas(nw, nh);
    step.ctx.drawImage(cur, 0, 0, nw, nh);
    temps.push(step.canvas);
    cur = step.canvas;
    cw = nw;
    ch = nh;
  }
  const out = makeCanvas(tw, th);
  // 투명한 PNG(짤방 등)가 JPEG에서 검게 되지 않도록 흰 바탕
  out.ctx.fillStyle = '#FFFFFF';
  out.ctx.fillRect(0, 0, tw, th);
  out.ctx.drawImage(cur, 0, 0, tw, th);
  temps.forEach(freeCanvas);
  return out.canvas;
}

function fit(w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 저장하지 못했어요.'))), 'image/jpeg', quality),
  );
}

// 아이폰은 캔버스 메모리가 넉넉하지 않아 다 쓴 캔버스는 바로 비움
function freeCanvas(c) {
  c.width = 0;
  c.height = 0;
}

/**
 * 이미지 한 장을 긴 변 maxSide 이하 JPEG 하나로 줄임 (링크 미리보기 이미지·스크린샷용)
 * @param {Blob} blob
 */
export async function shrinkImage(blob, maxSide = 800, quality = 0.8) {
  const img = await loadImage(blob);
  const s = fit(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = drawScaled(img, img.naturalWidth, img.naturalHeight, s.w, s.h);
  const out = await toJpeg(canvas, quality);
  freeCanvas(canvas);
  img.src = '';
  return out;
}

/**
 * 사진 파일 하나를 줄여서 { full, thumb, width, height } 로 돌려줌
 * @param {File} file
 */
export async function processPhoto(file) {
  const img = await loadImage(file);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;

  const f = fit(sw, sh, FULL_SIDE);
  const fullCanvas = drawScaled(img, sw, sh, f.w, f.h);
  const full = await toJpeg(fullCanvas, FULL_QUALITY);

  const t = fit(f.w, f.h, THUMB_SIDE);
  const thumbCanvas = drawScaled(fullCanvas, f.w, f.h, t.w, t.h);
  const thumb = await toJpeg(thumbCanvas, THUMB_QUALITY);

  freeCanvas(fullCanvas);
  freeCanvas(thumbCanvas);
  img.src = '';

  return { full, thumb, width: f.w, height: f.h };
}
