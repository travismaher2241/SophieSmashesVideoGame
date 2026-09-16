/**
 * Slice a swing sprite sheet into the individual frames the game loads.
 *
 * The sheets are drawn as a grid of poses on one canvas. The game wants one
 * transparent PNG per pose, all the same size and all sharing one origin: the
 * frames are swapped on a single fixed plane, so trimming each pose to its own
 * bounding box would both distort it and make the golfer jump around between
 * frames. Every frame is therefore cropped to the same box — the union of all
 * the poses — which drops the wasted margin while keeping them in register.
 *
 * There is no ImageMagick or sharp in this environment, so the work is done in
 * the headless Chromium that is already here for screenshots.
 *
 * Usage:
 *   node tools/sprites/slice-swing-sheet.mjs <sheet.png> <out-dir> [--cols=3] [--rows=2]
 *        [--map=1,0,2,3,4] [--white-key] [--no-trim] [--max-height=700]
 *
 * --map lists which grid cell feeds each output frame, in reading order
 * (left to right, top to bottom), as: address1,address2,backswingTop,
 * downswingImpact,followThrough.
 *
 * --white-key removes a white background. Only use it on a sheet that has no
 * alpha channel of its own: keying leaves a pale fringe on anti-aliased edges,
 * so an export with real transparency is always better.
 *
 * --max-height caps the output height. Source art is usually drawn far larger
 * than it is ever displayed: the golfer stands about 400px tall on screen, so
 * shipping 1300px frames costs megabytes of download for detail no one sees.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import puppeteer from 'puppeteer';

const FRAME_NAMES = [
  'frame-00-address-1',
  'frame-01-address-2-wiggle',
  'frame-02-backswing-top',
  'frame-03-downswing-impact',
  'frame-04-follow-through'
];

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const flags = Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value ?? true];
      })
  );

  if (positional.length < 2) {
    throw new Error('Usage: node tools/sprites/slice-swing-sheet.mjs <sheet.png> <out-dir> [flags]');
  }

  return {
    sheetPath: resolve(positional[0]),
    outDir: resolve(positional[1]),
    cols: Number(flags.cols ?? 3),
    rows: Number(flags.rows ?? 2),
    // Default order matches the driver sheet: the two address poses are on the
    // bottom row, with address 1 in the middle cell.
    map: String(flags.map ?? '4,3,5,2,1').split(',').map(Number),
    whiteKey: Boolean(flags['white-key']),
    trim: flags.trim !== 'false' && !flags['no-trim'],
    maxHeight: flags['max-height'] ? Number(flags['max-height']) : 0
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sheet = readFileSync(options.sheetPath);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-proxy-server']
  });

  try {
    const page = await browser.newPage();
    const frames = await page.evaluate(sliceInPage, {
      dataUrl: `data:image/png;base64,${sheet.toString('base64')}`,
      cols: options.cols,
      rows: options.rows,
      map: options.map,
      whiteKey: options.whiteKey,
      trim: options.trim,
      maxHeight: options.maxHeight
    });

    mkdirSync(options.outDir, { recursive: true });

    for (let i = 0; i < FRAME_NAMES.length; i++) {
      const frame = frames[i];
      if (!frame) throw new Error(`No image produced for ${FRAME_NAMES[i]}`);

      const outPath = resolve(options.outDir, `${FRAME_NAMES[i]}.png`);
      writeFileSync(outPath, Buffer.from(frame.png.split(',')[1], 'base64'));
      console.log(
        `${FRAME_NAMES[i].padEnd(28)} cell ${options.map[i]}  ${frame.width}x${frame.height}` +
        (frame.figure ? `  figure ${(frame.figure.heightFraction * 100).toFixed(0)}% tall, feet at ${(frame.figure.feetFraction * 100).toFixed(0)}%` : '') +
        (frame.empty ? '  *** EMPTY — check the cell map ***' : '')
      );
    }

    console.log(`\n${FRAME_NAMES.length} frames written to ${options.outDir}`);
    console.log(`source: ${basename(options.sheetPath)} (${options.cols}x${options.rows} grid)`);
  } finally {
    await browser.close();
  }
}

/**
 * Runs inside the page: cut each cell out of the sheet, optionally key out white,
 * then trim to the figure's own bounding box.
 */
function sliceInPage({ dataUrl, cols, rows, map, whiteKey, trim, maxHeight }) {
  return new Promise((done, fail) => {
    const image = new Image();
    image.onerror = () => fail(new Error('Could not decode the sheet image'));
    image.onload = () => {
      const cellWidth = Math.floor(image.width / cols);
      const cellHeight = Math.floor(image.height / rows);

      // First pass: cut out each cell and find where the ink is.
      const cells = map.map((cellNumber) => {
        const index = cellNumber - 1;
        const sx = (index % cols) * cellWidth;
        const sy = Math.floor(index / cols) * cellHeight;

        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);

        const pixels = ctx.getImageData(0, 0, cellWidth, cellHeight);
        const data = pixels.data;

        if (whiteKey) {
          for (let p = 0; p < data.length; p += 4) {
            // Near-white and unsaturated: background rather than a highlight on
            // the figure. Shoes and shafts have enough tint to survive this.
            const [r, g, b] = [data[p], data[p + 1], data[p + 2]];
            const spread = Math.max(r, g, b) - Math.min(r, g, b);
            if (r > 236 && g > 236 && b > 236 && spread < 12) data[p + 3] = 0;
          }
          ctx.putImageData(pixels, 0, 0);
        }

        let minX = cellWidth;
        let minY = cellHeight;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < cellHeight; y++) {
          for (let x = 0; x < cellWidth; x++) {
            if (data[(y * cellWidth + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        return { canvas, minX, minY, maxX, maxY, empty: maxX < 0 };
      });

      // One box for every frame, so the poses stay in register on the plane.
      const pad = 4;
      const drawn = cells.filter((cell) => !cell.empty);
      const box = trim && drawn.length > 0
        ? {
            x: Math.max(0, Math.min(...drawn.map((c) => c.minX)) - pad),
            y: Math.max(0, Math.min(...drawn.map((c) => c.minY)) - pad),
            right: Math.min(cellWidth, Math.max(...drawn.map((c) => c.maxX)) + 1 + pad),
            bottom: Math.min(cellHeight, Math.max(...drawn.map((c) => c.maxY)) + 1 + pad)
          }
        : { x: 0, y: 0, right: cellWidth, bottom: cellHeight };

      const cropW = box.right - box.x;
      const cropH = box.bottom - box.y;
      const scale = maxHeight > 0 ? Math.min(1, maxHeight / cropH) : 1;
      const outW = Math.max(1, Math.round(cropW * scale));
      const outH = Math.max(1, Math.round(cropH * scale));

      const results = cells.map((cell) => {
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const outCtx = out.getContext('2d');
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(cell.canvas, box.x, box.y, cropW, cropH, 0, 0, outW, outH);

        // Where this pose sits inside the shared box, as fractions — useful for
        // sizing the plane so the figure ends up the right height in the world.
        const figure = cell.empty
          ? null
          : {
              heightFraction: +((cell.maxY - cell.minY + 1) / cropH).toFixed(3),
              feetFraction: +((cell.maxY - box.y) / cropH).toFixed(3)
            };

        return { png: out.toDataURL('image/png'), width: outW, height: outH, empty: cell.empty, figure };
      });

      done(results);
    };
    image.src = dataUrl;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
