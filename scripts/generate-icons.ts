// Generates the PWA/apple-touch placeholder icons (public/icons/*.png) at
// build-prep time — run manually via `npx tsx scripts/generate-icons.ts`
// whenever the icon design changes; the output PNGs are committed, not
// generated during `npm run build` (same "static, no asset pipeline" spirit
// as every other Graphics-drawn icon in this app — see CLAUDE.md).
//
// Deliberately zero new dependencies: a real PNG encoder (raw IHDR/IDAT/IEND
// chunks + CRC32, RGB truecolor, filter-none scanlines) built on Node's
// built-in `zlib` alone, rather than pulling in `sharp`/`canvas` (native
// bindings, exactly the kind of deploy-risk this slice's "keep minimal"
// deployment-prep instruction is trying to avoid). The motif is this app's
// own colorBlob "red circle + eyes" character (see rendering/renderers.ts's
// addEyes()) at icon scale — reusing the app's own visual identity instead of
// importing external art.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CREAM: [number, number, number] = [0xff, 0xf8, 0xee]; // background, matches BACKGROUND_COLOR across every scene
const RED: [number, number, number] = [0xff, 0x3b, 0x30]; // PALETTE.red
const WHITE: [number, number, number] = [0xff, 0xff, 0xff];
const PUPIL: [number, number, number] = [0x11, 0x11, 0x11]; // matches addEyes()'s 0x111111

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Same proportions as addEyes() (renderers.ts), scaled to this icon's circle
// radius instead of a match-item's radius.
function drawIcon(size: number): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const circleR = size * 0.38;
  const eyeOffsetX = circleR * 0.35;
  const eyeOffsetY = -circleR * 0.15;
  const eyeR = circleR * 0.18;
  const pupilR = eyeR * 0.5;
  const leftEyeX = cx - eyeOffsetX;
  const rightEyeX = cx + eyeOffsetX;
  const eyeY = cy + eyeOffsetY;

  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let color = CREAM;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= circleR * circleR) {
        color = RED;
        const dl = Math.hypot(x - leftEyeX, y - eyeY);
        const dr = Math.hypot(x - rightEyeX, y - eyeY);
        if (dl <= eyeR || dr <= eyeR) {
          color = WHITE;
          if (dl <= pupilR || dr <= pupilR) color = PUPIL;
        }
      }
      const off = 1 + x * 3;
      row[off] = color[0];
      row[off + 1] = color[1];
      row[off + 2] = color[2];
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = new URL('../public/icons/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const targets: { file: string; size: number }[] = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
  writeFileSync(outDir + file, drawIcon(size));
  console.log(`wrote ${file} (${size}x${size})`);
}
