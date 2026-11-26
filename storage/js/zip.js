// 아주 작은 ZIP 만들기·읽기 (압축하지 않는 "저장" 방식). 외부 라이브러리 없이 백업 파일에 씀.
// 사진은 이미 JPEG로 압축돼 있어 다시 압축해도 거의 줄지 않으므로 저장 방식이면 충분합니다.
// 만든 파일은 아이폰 파일 앱·PC에서 일반 ZIP으로 열 수 있습니다(사진을 직접 꺼낼 수 있음).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const FLAG_UTF8 = 0x0800; // 한글 파일 이름

/**
 * @param {{ name: string, data: Blob }[]} entries
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function createZip(entries, onProgress) {
  if (entries.length > 0xffff) throw new Error('too-many-files');
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const { name, data } = entries[i];
    const nameBytes = enc.encode(name);
    // CRC 계산에만 잠깐 읽고, 실제 파일 내용은 원래 Blob을 그대로 이어 붙임 (메모리 절약)
    const crc = crc32(new Uint8Array(await data.arrayBuffer()));
    const size = data.size;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, FLAG_UTF8, true);
    local.setUint16(8, 0, true); // 압축 안 함
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, FLAG_UTF8, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, nameBytes);

    offset += 30 + nameBytes.length + size;
    if (offset > 0xffffffff) throw new Error('too-large');
    onProgress?.(i + 1, entries.length);
    if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0)); // 화면이 멈추지 않게
  }

  const cdSize = central.reduce((sum, p) => sum + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/**
 * ZIP 읽기. 파일 내용은 필요할 때 잘라서(Blob.slice) 돌려주므로 큰 파일도 메모리에 다 올리지 않음.
 * @param {Blob} file
 */
export async function readZip(file) {
  const tailSize = Math.min(file.size, 65557);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not-zip');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());

  const dec = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('bad-zip');
    const method = cd.getUint16(p + 10, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    /** @returns {Promise<Blob|null>} */
    async get(name, type = '') {
      const e = entries.get(name);
      if (!e) return null;
      if (e.method !== 0) throw new Error('compressed'); // 다른 프로그램으로 다시 압축한 파일
      const lh = new DataView(await file.slice(e.local, e.local + 30).arrayBuffer());
      if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('bad-zip');
      const start = e.local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      return file.slice(start, start + e.size, type);
    },
  };
}
