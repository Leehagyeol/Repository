// IndexedDB 저장소. 데이터베이스 'storage-db' 안에 표 'items' 하나를 씁니다.
import { DB_NAME } from './config.js';

const DB_VERSION = 1;
const STORE = 'items';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('category', 'category');
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 새 버전이 열리려 하면 연결을 닫아 막지 않게 함
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    let result;
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAllItems = () => run('readonly', (s) => s.getAll());
export const putItem = (item) => run('readwrite', (s) => s.put(item));
/** 여러 항목을 한 번에 저장 (사진 여러 장을 따로 저장할 때) */
export const putItems = (list) =>
  run('readwrite', (s) => {
    list.forEach((item) => s.put(item));
  });
export const deleteItem = (id) => run('readwrite', (s) => s.delete(id));
/** 전체를 지우고 바꿈 (백업 "덮어쓰기"). 한 번에 처리돼서 중간에 실패하면 원래대로 남음 */
export const replaceAllItems = (list) =>
  run('readwrite', (s) => {
    s.clear();
    list.forEach((item) => s.put(item));
  });
