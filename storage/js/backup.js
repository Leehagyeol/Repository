// 백업·복원(F12)과 영구 저장 요청
//
// 백업 파일: 일반 ZIP
//   manifest.json      항목 목록 (사진·미리보기 이미지는 아래 파일 이름으로 가리킴)
//   photos/<id>-1.jpg  원본 축소본,  photos/<id>-1-thumb.jpg  썸네일
//   previews/<id>.jpg  링크 미리보기 이미지
//   읽어주세요.txt
// 미리보기 함수 주소·비밀 키는 백업에 넣지 않습니다(파일이 iCloud 등에 저장되므로).
import { KEY_PREFIX, APP_VERSION } from './config.js';
import { getAllItems, putItems, replaceAllItems } from './db.js';
import { newItem } from './items.js';
import { createZip, readZip } from './zip.js';

const LAST_BACKUP_KEY = `${KEY_PREFIX}last-backup`;
const FIRST_RUN_KEY = `${KEY_PREFIX}first-run`;
const FORMAT = 1;
const DAY = 24 * 60 * 60 * 1000;
export const REMIND_DAYS = 30;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* 무시 */
  }
}

export function getLastBackup() {
  const v = Number(read(LAST_BACKUP_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function markBackedUp(when = Date.now()) {
  write(LAST_BACKUP_KEY, when);
}

export function markFirstRun() {
  if (!read(FIRST_RUN_KEY)) write(FIRST_RUN_KEY, Date.now());
}

/** 홈 알림 문구. 마지막 백업(없으면 처음 쓴 날)부터 30일이 지났으면 문구, 아니면 null */
export function backupReminder(itemCount, now = Date.now()) {
  if (!itemCount) return null;
  const last = getLastBackup();
  const since = last || Number(read(FIRST_RUN_KEY)) || now;
  const days = Math.floor((now - since) / DAY);
  if (days < REMIND_DAYS) return null;
  return last ? `마지막 백업 후 ${days}일이 지났어요.` : `아직 백업한 적이 없어요. 앱을 쓴 지 ${days}일이 지났어요.`;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * 백업 파일 만들기
 * @param {Array} items 메모리에 있는 전체 항목 (사진 Blob 포함)
 * @param {(done, total) => void} [onProgress]
 * @returns {Promise<File>}
 */
export async function buildBackup(items, onProgress) {
  const files = [];
  const list = items.map((item) => {
    const out = { ...item };
    out.photos = (item.photos || []).map((p, i) => {
      const base = `photos/${item.id}-${i + 1}`;
      if (p.full) files.push({ name: `${base}.jpg`, data: p.full });
      if (p.thumb) files.push({ name: `${base}-thumb.jpg`, data: p.thumb });
      return { full: p.full ? `${base}.jpg` : null, thumb: p.thumb ? `${base}-thumb.jpg` : null, width: p.width, height: p.height };
    });
    if (item.previewImage instanceof Blob) {
      const name = `previews/${item.id}.jpg`;
      files.push({ name, data: item.previewImage });
      out.previewImage = name;
    } else {
      out.previewImage = null;
    }
    return out;
  });

  const now = new Date();
  const manifest = { app: 'storage', format: FORMAT, appVersion: APP_VERSION, exportedAt: now.getTime(), itemCount: list.length, items: list };
  const readme =
    '저장소 앱 백업 파일입니다.\n\n' +
    '복원: 저장소 앱 → 설정 → 백업 가져오기에서 이 ZIP 파일을 고르세요.\n' +
    '사진은 photos 폴더, 링크 미리보기 이미지는 previews 폴더에 들어 있어 직접 꺼내 볼 수도 있습니다.\n' +
    '이 파일을 다른 압축 프로그램으로 다시 압축하면 앱에서 읽지 못할 수 있습니다.\n';

  const zip = await createZip(
    [
      { name: 'manifest.json', data: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) },
      { name: '읽어주세요.txt', data: new Blob([readme], { type: 'text/plain' }) },
      ...files,
    ],
    onProgress,
  );
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return new File([zip], `저장소-백업-${stamp}.zip`, { type: 'application/zip' });
}

/** 공유 시트(파일에 저장)로 넘김. PC 등 공유가 안 되면 내려받기. 'shared' | 'downloaded' | 'cancelled' */
export async function shareBackup(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '저장소 백업' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60 * 1000);
  return 'downloaded';
}

/**
 * 백업 파일 읽기 → { exportedAt, items } (사진은 Blob으로 되살림)
 * @param {File} file
 */
export async function readBackup(file) {
  let zip;
  try {
    zip = await readZip(file);
  } catch {
    throw new Error('not-backup');
  }
  if (!zip.has('manifest.json')) throw new Error('not-backup');
  let manifest;
  try {
    manifest = JSON.parse(await (await zip.get('manifest.json')).text());
  } catch (err) {
    throw new Error(err?.message === 'compressed' ? 'compressed' : 'not-backup');
  }
  if (manifest?.app !== 'storage' || !Array.isArray(manifest.items)) throw new Error('not-backup');
  if (manifest.format > FORMAT) throw new Error('newer-format');

  const image = async (name) => (name ? zip.get(name, 'image/jpeg') : null);
  const items = [];
  for (const raw of manifest.items) {
    if (!raw || typeof raw.id !== 'string' || !['link', 'photo', 'text'].includes(raw.type)) continue;
    const photos = [];
    for (const p of raw.photos || []) {
      const full = await image(p.full);
      const thumb = await image(p.thumb);
      if (full || thumb) photos.push({ full: full || thumb, thumb: thumb || full, width: p.width, height: p.height });
    }
    items.push({
      ...newItem(),
      ...raw,
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      photos,
      previewImage: await image(raw.previewImage),
    });
  }
  return { exportedAt: manifest.exportedAt, items };
}

/**
 * 복원
 * @param {Array} items 백업에서 읽은 항목
 * @param {'merge'|'replace'} mode 합치기: 지금 항목은 두고 백업 항목을 더함(같은 항목은 더 최근에 고친 쪽) / 덮어쓰기: 전부 백업으로
 * @returns {Promise<{ added: number, updated: number, total: number }>}
 */
export async function restoreBackup(items, mode) {
  if (mode === 'replace') {
    await replaceAllItems(items);
    return { added: items.length, updated: 0, total: items.length };
  }
  const existing = new Map((await getAllItems()).map((it) => [it.id, it]));
  const toPut = [];
  let added = 0;
  let updated = 0;
  for (const it of items) {
    const cur = existing.get(it.id);
    if (!cur) {
      added += 1;
      toPut.push(it);
    } else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) {
      updated += 1;
      toPut.push(it);
    }
  }
  if (toPut.length) await putItems(toPut);
  return { added, updated, total: existing.size + added };
}

// ───────── 영구 저장 ─────────

/** 브라우저가 저장 공간이 부족할 때 이 앱 데이터를 지우지 않도록 요청 */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted?.()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function persistState() {
  try {
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
