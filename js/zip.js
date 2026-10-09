// Historical context: see docs/CODEBASE_NOTES.md#jszip-js-1-16

// ── CRC-32 (standard table-based implementation) ───────────────────────────

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── little-endian byte helpers ──────────────────────────────────────────

function u16(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

// Historical context: see docs/CODEBASE_NOTES.md#jszip-js-48-52
const DOS_TIME = 0;
const DOS_DATE = (1 << 9) | (1 << 5) | 1; // 1980-01-01, the DOS epoch

function textToBytes(str) {
  return new TextEncoder().encode(str);
}

// One entry going into the archive. `data` is either a string (encoded as
// UTF-8) or bytes already in hand (Uint8Array/ArrayBuffer, e.g. an image
// blob's contents) — callers shouldn't need to care which.
function normalizeData(data) {
  if (typeof data === 'string') return textToBytes(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('zip entry data must be a string, Uint8Array, or ArrayBuffer');
}

// Historical context: see docs/CODEBASE_NOTES.md#jszip-js-70-73
export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = textToBytes(name);
    const fileBytes = normalizeData(data);
    const crc = crc32(fileBytes);
    const size = fileBytes.length;

    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // local file header signature
      ...u16(20),             // version needed to extract
      ...u16(0),               // general purpose flag
      ...u16(0),               // compression method — 0 = store
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),             // compressed size (== size, stored)
      ...u32(size),             // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0),                // extra field length
    ]);

    localParts.push(localHeader, nameBytes, fileBytes);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, // central directory file header signature
      ...u16(20),             // version made by
      ...u16(20),             // version needed to extract
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),               // extra field length
      ...u16(0),               // comment length
      ...u16(0),               // disk number start
      ...u16(0),               // internal file attributes
      ...u32(0),               // external file attributes
      ...u32(offset),          // relative offset of local header
    ]);

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + fileBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) centralDirSize += part.length;

  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, // end of central directory signature
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),  // entries on this disk
    ...u16(entries.length),  // total entries
    ...u32(centralDirSize),
    ...u32(centralDirOffset),
    ...u16(0),               // comment length
  ]);

  const totalSize = offset + centralDirSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
