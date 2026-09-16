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
 * The rows are found from the transparent gutter between them rather than by
 * dividing the sheet in half. Artists do not export exact halves: the putter
 * sheet's top row is 580px and its bottom row 553px, and slicing it down the
 * middle cut nine pixels off the address pose — which is exactly the missing
 * shoe that showed up on the green. A gutter is a real, findable feature, and a
 * baseline is what registers a standing figure, so each row is cropped relative
 * to the lowest ink in that row: the poses in a row keep their relative heights,
 * and the two rows stand on the same line.
 *
 * Columns stay on the even division. There are vertical gaps between the poses
 * too, but the figures are laid out on an even horizontal pitch, and a trailing
 * arm or club reaching into a gap would move a boundary that is currently right.
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
    const result = await page.evaluate(sliceInPage, {
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
      const frame = result.frames[i];
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
    for (const note of result.notes) console.log(note);
  } finally {
    await browser.close();
  }
}

/**
 * Runs inside the page: find the rows, cut each pose out, and crop them all to
 * one box measured from the row baselines.
 */
function sliceInPage({ dataUrl, cols, rows, map, whiteKey, trim, maxHeight }) {
  return new Promise((done, fail) => {
    const image = new Image();
    image.onerror = () => fail(new Error('Could not decode the sheet image'));
    image.onload = () => {
      const notes = [];

      // A margin of clear space around the sheet, so a crop that reaches past
      // the artwork reads as transparent instead of having to be clamped — which
      // would change one frame's size and break the register.
      const PAD = 48;
      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = image.width + PAD * 2;
      sheetCanvas.height = image.height + PAD * 2;
      const sheetCtx = sheetCanvas.getContext('2d', { willReadFrequently: true });
      sheetCtx.drawImage(image, PAD, PAD);

      const pixels = sheetCtx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height);
      const data = pixels.data;

      if (whiteKey) {
        for (let p = 0; p < data.length; p += 4) {
          // Near-white and unsaturated: background rather than a highlight on
          // the figure. Shoes and shafts have enough tint to survive this.
          const [r, g, b] = [data[p], data[p + 1], data[p + 2]];
          const spread = Math.max(r, g, b) - Math.min(r, g, b);
          if (r > 236 && g > 236 && b > 236 && spread < 12) data[p + 3] = 0;
        }
        sheetCtx.putImageData(pixels, 0, 0);
      }

      const stride = sheetCanvas.width;
      const inked = (x, y) => data[((y + PAD) * stride + (x + PAD)) * 4 + 3] > 8;

      // Ink per row of the sheet, which is what the gutter between rows shows up in.
      const rowInk = [];
      for (let y = 0; y < image.height; y++) {
        let n = 0;
        for (let x = 0; x < image.width; x++) if (inked(x, y)) n++;
        rowInk.push(n);
      }

      const strips = detectRowStrips(rowInk, rows, image.height, notes);
      const cellWidth = Math.floor(image.width / cols);

      // Where each pose sits, measured against its own row's baseline: the lowest
      // ink in the row, which is the ground the figures stand on.
      const cells = map.map((cellNumber) => {
        const index = cellNumber - 1;
        const col = index % cols;
        const strip = strips[Math.floor(index / cols)];
        const sx = col * cellWidth;

        let minX = cellWidth;
        let maxX = -1;
        let minY = strip.bottom + 1;
        let maxY = strip.top - 1;
        for (let y = strip.top; y <= strip.bottom; y++) {
          for (let x = 0; x < cellWidth; x++) {
            if (!inked(sx + x, y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }

        const empty = maxX < 0;
        return {
          sx,
          baseline: strip.baseline,
          stripTop: strip.top,
          stripBottom: strip.bottom,
          minX,
          maxX,
          // Relative to the baseline, so rows of different heights still line up.
          topRel: empty ? 0 : minY - strip.baseline,
          bottomRel: empty ? 0 : maxY - strip.baseline,
          stripTopRel: strip.top - strip.baseline,
          stripBottomRel: strip.bottom - strip.baseline,
          empty
        };
      });

      // One box for every frame, so the poses stay in register on the plane.
      const pad = 4;
      const drawn = cells.filter((cell) => !cell.empty);
      const box = trim && drawn.length > 0
        ? {
            x: Math.max(0, Math.min(...drawn.map((c) => c.minX)) - pad),
            right: Math.min(cellWidth, Math.max(...drawn.map((c) => c.maxX)) + 1 + pad),
            top: Math.min(...drawn.map((c) => c.topRel)) - pad,
            bottom: Math.max(...drawn.map((c) => c.bottomRel)) + 1 + pad
          }
        : {
            x: 0,
            right: cellWidth,
            top: Math.min(...cells.map((c) => c.stripTopRel)),
            bottom: Math.max(...cells.map((c) => c.stripBottomRel)) + 1
          };

      const cropW = box.right - box.x;
      const cropH = box.bottom - box.top;
      const scale = maxHeight > 0 ? Math.min(1, maxHeight / cropH) : 1;
      const outW = Math.max(1, Math.round(cropW * scale));
      const outH = Math.max(1, Math.round(cropH * scale));

      const frames = cells.map((cell) => {
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const outCtx = out.getContext('2d');
        outCtx.imageSmoothingQuality = 'high';

        // The crop is as tall as the tallest row needs, so on a shorter row it
        // reaches past that row's own strip — and would pick up the feet of the
        // poses above. Only the strip this pose lives in is copied; the rest of
        // the frame stays clear, which is what the headroom is for.
        const srcTop = cell.baseline + box.top;
        const from = Math.max(srcTop, cell.stripTop);
        const to = Math.min(srcTop + cropH, cell.stripBottom + 1);

        if (to > from) {
          outCtx.drawImage(
            sheetCanvas,
            cell.sx + box.x + PAD,
            from + PAD,
            cropW,
            to - from,
            0,
            Math.round((from - srcTop) * scale),
            outW,
            Math.round((to - from) * scale)
          );
        }

        // Where this pose sits inside the shared box, as fractions — useful for
        // sizing the plane so the figure ends up the right height in the world.
        const figure = cell.empty
          ? null
          : {
              heightFraction: +((cell.bottomRel - cell.topRel + 1) / cropH).toFixed(3),
              feetFraction: +((cell.bottomRel - box.top) / cropH).toFixed(3)
            };

        return { png: out.toDataURL('image/png'), width: outW, height: outH, empty: cell.empty, figure };
      });

      done({ frames, notes });
    };

    /**
     * Split the sheet into rows on the clear gutters between them.
     *
     * Falls back to an even division if the gutters are not where a grid of this
     * shape would put them, but says so: an even division is what cut the feet
     * off the putter sheet, so it should not happen quietly.
     */
    function detectRowStrips(rowInk, rows, height, notes) {
      const gaps = [];
      let start = -1;
      for (let y = 0; y < height; y++) {
        if (rowInk[y] === 0) {
          if (start < 0) start = y;
        } else if (start >= 0) {
          gaps.push([start, y - 1]);
          start = -1;
        }
      }
      if (start >= 0) gaps.push([start, height - 1]);

      // Gutters, not the blank margin above the first row or below the last.
      const gutters = gaps.filter(([a, b]) => b - a >= 3 && a > 0 && b < height - 1);

      let bounds;
      if (gutters.length === rows - 1) {
        const cuts = gutters.map(([a, b]) => Math.floor((a + b) / 2));
        bounds = [];
        for (let r = 0; r < rows; r++) {
          bounds.push([r === 0 ? 0 : cuts[r - 1] + 1, r === rows - 1 ? height - 1 : cuts[r]]);
        }
      } else {
        notes.push(
          `NOTE: found ${gutters.length} clear gutter(s) where a ${rows}-row sheet wants ${rows - 1}; ` +
          'falling back to an even split, which can cut through the artwork.'
        );
        const cellHeight = Math.floor(height / rows);
        bounds = [];
        for (let r = 0; r < rows; r++) bounds.push([r * cellHeight, (r + 1) * cellHeight - 1]);
      }

      return bounds.map(([from, to], r) => {
        let top = -1;
        let bottom = -1;
        for (let y = from; y <= to; y++) {
          if (rowInk[y] === 0) continue;
          if (top < 0) top = y;
          bottom = y;
        }
        if (top < 0) {
          top = from;
          bottom = to;
        }
        if (bottom === height - 1) {
          notes.push(
            `WARNING: row ${r + 1} runs off the bottom of the sheet, so those poses are ` +
            'clipped in the artwork itself — re-export with the feet inside the canvas to fix it.'
          );
        }
        return { top, bottom, baseline: bottom };
      });
    }

    image.src = dataUrl;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
