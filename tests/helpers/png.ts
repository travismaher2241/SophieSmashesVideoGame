import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major, 8 bits per channel. */
  pixels: Uint8Array;
}

/**
 * Enough of a PNG decoder to inspect the sprite frames.
 *
 * The frames are written by a canvas, which always produces 8-bit RGBA, so this
 * handles that and refuses anything else rather than decoding it wrongly.
 */
export function decodePng(file: Buffer): DecodedPng {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');

  let width = 0;
  let height = 0;
  let colourType = -1;
  let bitDepth = 0;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colourType = body[9];
      if (body[12] !== 0) throw new Error('Interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8 || colourType !== 6) {
    throw new Error(`Expected 8-bit RGBA, got bit depth ${bitDepth} colour type ${colourType}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const rowBytes = width * bpp;
  const pixels = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)];
    const from = y * (rowBytes + 1) + 1;
    const to = y * rowBytes;
    const above = (y - 1) * rowBytes;

    for (let i = 0; i < rowBytes; i++) {
      const value = raw[from + i];
      const left = i >= bpp ? pixels[to + i - bpp] : 0;
      const up = y > 0 ? pixels[above + i] : 0;
      const upLeft = y > 0 && i >= bpp ? pixels[above + i - bpp] : 0;

      let restored: number;
      switch (filter) {
        case 0: restored = value; break;
        case 1: restored = value + left; break;
        case 2: restored = value + up; break;
        case 3: restored = value + ((left + up) >> 1); break;
        case 4: restored = value + paeth(left, up, upLeft); break;
        default: throw new Error(`Unknown PNG row filter ${filter}`);
      }

      pixels[to + i] = restored & 0xff;
    }
  }

  return { width, height, pixels };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Bounding box of the non-transparent pixels, or null if the image is empty. */
export function inkBounds(image: DecodedPng): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
