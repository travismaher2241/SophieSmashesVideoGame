/**
 * Sophie Hills Hole 1 — "Clubhouse Climb" generator.
 *
 * Builds terrain.bin, terrain_meta.json and hole.json for the hole from a single
 * declarative trace, so every coordinate stays re-derivable instead of being a
 * hand-typed magic number.
 *
 * PROVENANCE
 * ----------
 * Sophie Hills is a FICTIONAL gameplay course. This hole's shape was drawn from a
 * reference overhead supplied by the design owner, but the result is Sophie Hills
 * data and must never be presented as any real course's layout.
 *
 * Measurements taken from the reference overhead:
 *   - 329.48 m along the playing line, with a 200.00 m node two-thirds of the way up.
 *   - 23.96 m and 31.48 m gaps between tree lines through the landing area.
 *   - Card length 337 m, par 4, from the back tee.
 *   - Ground rises ~20 m gradually from tee to green.
 *   - No bunkers on this hole (the sand visible in the reference belongs to the
 *     adjacent hole).
 *
 * The trace is in reference-image pixels, converted by PX_TO_METRES below. Tracing
 * was done by eye, so surface edges are accurate to roughly +/-5 m. Refine in-game
 * with the F2 alignment tool and paste corrections back into this file.
 *
 * Run: node tools/course-builder/build-sophie-hills-hole-01.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../public/courses/sophie-hills/hole-01');

// ---------------------------------------------------------------------------
// Reference-image trace parameters
// ---------------------------------------------------------------------------

/** Metres per pixel in the reference overhead, from the 329.48 m measured line. */
const PX_TO_METRES = 0.4928;

/** Reference pixel that corresponds to the back tee. */
const PX_ORIGIN = { x: 160, y: 690 };

/** World position of PX_ORIGIN. Everything else is measured from here. */
const WORLD_ORIGIN = { x: 150, z: 40 };

/** Reference image y grows downward; world z grows up the hole. */
function px(x, y) {
  return {
    x: round2(WORLD_ORIGIN.x + (x - PX_ORIGIN.x) * PX_TO_METRES),
    z: round2(WORLD_ORIGIN.z + (PX_ORIGIN.y - y) * PX_TO_METRES)
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Hole skeleton
// ---------------------------------------------------------------------------

const TEE = { x: 150, z: 40 };
/** Where the playing line bends left, 200 m out — the measured node. */
const BEND = { x: 144, z: 240 };
const GREEN_CENTRE = { x: 120, z: 375 };

/** Playing line length: tee -> bend -> green. Matches the 337 m card length. */
const PLAYING_LENGTH = Math.round(
  Math.hypot(BEND.x - TEE.x, BEND.z - TEE.z) + Math.hypot(GREEN_CENTRE.x - BEND.x, GREEN_CENTRE.z - BEND.z)
);

// Terrain field sized to this hole alone, with margin for wayward shots.
const GRID_SPACING = 2;
const WIDTH_SAMPLES = 121; // 240 m across
const HEIGHT_SAMPLES = 211; // 420 m along
const WORLD_X_EXTENT = (WIDTH_SAMPLES - 1) * GRID_SPACING;
const WORLD_Z_EXTENT = (HEIGHT_SAMPLES - 1) * GRID_SPACING;

const BASE_ELEVATION = 60;
/** Total climb from tee to green, per the design owner's description. */
const TOTAL_CLIMB = 20;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Ground height in metres above BASE_ELEVATION.
 *
 * Climbs TOTAL_CLIMB from tee to green at a near-constant grade, easing off
 * slightly at the tee end, with a mild cross-fall to the right and low-amplitude
 * undulation. The climb is described as gradual, so no stretch of the hole is
 * allowed to ramp much harder than the ~6% average. Tee and green are levelled
 * into pads.
 */
function elevationAt(x, z) {
  const progress = clamp((z - TEE.z) / (GREEN_CENTRE.z - TEE.z), 0, 1);
  const climb = TOTAL_CLIMB * (0.75 * progress + 0.25 * progress * progress);

  // Cross-fall: ground sheds gently to the right (towards the adjacent hole).
  const corridorCentreX = centrelineXAt(z);
  const crossFall = clamp((corridorCentreX - x) / 120, -1, 1) * 1.8;

  // Low-frequency roll so the fairway is not a ramp.
  const undulation =
    Math.sin(z * 0.031) * 0.45 +
    Math.sin(z * 0.017 + x * 0.013) * 0.35 +
    Math.cos(x * 0.026) * 0.3;

  let height = climb + crossFall + undulation;

  height = blendPad(height, x, z, TEE.x, TEE.z, 9, 16, (h) => h);
  height = blendPad(height, x, z, GREEN_CENTRE.x, GREEN_CENTRE.z, 15, 24, (h, dz) => {
    // Green falls gently from back to front, so putts from above run away.
    return h + (dz / 15) * 0.45;
  });

  return height;
}

/**
 * Flatten `height` towards the ambient height at a pad's centre, fading back to
 * natural ground between `innerRadius` and `outerRadius`.
 */
function blendPad(height, x, z, cx, cz, innerRadius, outerRadius, shape) {
  const dist = Math.hypot(x - cx, z - cz);
  if (dist > outerRadius) return height;

  const padHeight = shape(ambientHeight(cx, cz), z - cz);
  if (dist <= innerRadius) return padHeight;

  const t = (dist - innerRadius) / (outerRadius - innerRadius);
  const smooth = t * t * (3 - 2 * t);
  return padHeight * (1 - smooth) + height * smooth;
}

/** Natural ground height with no pads applied — used as each pad's datum. */
function ambientHeight(x, z) {
  const progress = clamp((z - TEE.z) / (GREEN_CENTRE.z - TEE.z), 0, 1);
  const climb = TOTAL_CLIMB * (0.75 * progress + 0.25 * progress * progress);
  const crossFall = clamp((centrelineXAt(z) - x) / 120, -1, 1) * 1.8;
  const undulation =
    Math.sin(z * 0.031) * 0.45 +
    Math.sin(z * 0.017 + x * 0.013) * 0.35 +
    Math.cos(x * 0.026) * 0.3;
  return climb + crossFall + undulation;
}

/** X of the playing line at a given z, following the tee -> bend -> green dogleg. */
function centrelineXAt(z) {
  if (z <= BEND.z) {
    const t = clamp((z - TEE.z) / (BEND.z - TEE.z), 0, 1);
    return TEE.x + (BEND.x - TEE.x) * t;
  }
  const t = clamp((z - BEND.z) / (GREEN_CENTRE.z - BEND.z), 0, 1);
  return BEND.x + (GREEN_CENTRE.x - BEND.x) * t;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function buildTerrain() {
  const values = new Float32Array(WIDTH_SAMPLES * HEIGHT_SAMPLES);
  let min = Infinity;
  let max = -Infinity;

  for (let row = 0; row < HEIGHT_SAMPLES; row++) {
    const z = row * GRID_SPACING;
    for (let col = 0; col < WIDTH_SAMPLES; col++) {
      const x = col * GRID_SPACING;
      const h = elevationAt(x, z);
      values[row * WIDTH_SAMPLES + col] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  return { values, min, max };
}

// ---------------------------------------------------------------------------
// Surface geometry
// ---------------------------------------------------------------------------

/**
 * Hole corridor edges, traced from the outline drawn on the reference overhead.
 *
 * Stored as left-hand and right-hand edge samples rather than one polygon ring,
 * because the corridor is a long ribbon: sampling each side independently keeps
 * the shape editable and lets buildCorridor() guarantee the mown surfaces sit
 * inside it. The reference crop cut off above the green, so the samples past
 * z = 380 extrapolate the outline over the green complex.
 */
const CORRIDOR_LEFT = [
  { z: 26, x: 142 }, { z: 33, x: 136 },
  { z: 54.8, x: 129.3 }, { z: 73.5, x: 124.4 }, { z: 94.2, x: 120.9 },
  { z: 114.9, x: 118.5 }, { z: 135.6, x: 116.0 }, { z: 156.3, x: 113.6 },
  { z: 176.9, x: 111.1 }, { z: 197.6, x: 108.6 }, { z: 214.4, x: 104.7 },
  { z: 231.1, x: 99.7 }, { z: 248.9, x: 93.3 }, { z: 266.6, x: 87.9 },
  { z: 284.4, x: 83.0 }, { z: 301.1, x: 81.5 }, { z: 318.9, x: 84.0 },
  { z: 335.6, x: 87.9 }, { z: 352.3, x: 94.3 }, { z: 365.1, x: 99.0 },
  { z: 378.0, x: 101.5 }, { z: 390.0, x: 106.0 }, { z: 396.0, x: 115.0 }
];

const CORRIDOR_RIGHT = [
  { z: 26, x: 158 }, { z: 33, x: 164 },
  { z: 46.9, x: 161.3 }, { z: 58.7, x: 167.7 }, { z: 75.5, x: 172.2 },
  { z: 95.2, x: 175.6 }, { z: 113.9, x: 177.1 }, { z: 133.7, x: 175.6 },
  { z: 153.4, x: 173.6 }, { z: 173.1, x: 171.2 }, { z: 192.8, x: 172.2 },
  { z: 212.6, x: 170.2 }, { z: 232.3, x: 167.7 }, { z: 251.0, x: 164.3 },
  { z: 267.8, x: 165.8 }, { z: 283.6, x: 161.3 }, { z: 298.4, x: 158.4 },
  { z: 307.1, x: 161.8 }, { z: 320.9, x: 164.8 }, { z: 337.6, x: 162.8 },
  { z: 354.4, x: 158.9 }, { z: 367.1, x: 153.9 }, { z: 378.0, x: 149.0 },
  { z: 390.0, x: 142.0 }, { z: 396.0, x: 128.0 }
];

/**
 * Fairway centreline. Note this is NOT the playing line: the stand of trees in
 * the middle of the hole forces the fairway up the right-hand side before it
 * swings back left towards the green. The 22 m waist through the landing area is
 * the gap measured on the reference overhead.
 */
const FAIRWAY_SPINE = [
  { x: 150, z: 58, width: 24 },
  { x: 154, z: 80, width: 24 },
  { x: 157, z: 105, width: 22 },
  { x: 159, z: 130, width: 22 },
  { x: 159, z: 155, width: 22 },
  { x: 157, z: 180, width: 24 },
  { x: 153, z: 205, width: 26 },
  { x: 147, z: 235, width: 28 },
  { x: 141, z: 265, width: 30 },
  { x: 134, z: 295, width: 30 },
  { x: 128, z: 325, width: 30 },
  { x: 124, z: 350, width: 28 },
  { x: 121, z: 368, width: 26 }
];

/** Linear interpolation across a table of edge samples sorted by z. */
function edgeXAt(samples, z) {
  if (z <= samples[0].z) return samples[0].x;
  if (z >= samples[samples.length - 1].z) return samples[samples.length - 1].x;

  for (let i = 1; i < samples.length; i++) {
    if (z <= samples[i].z) {
      const a = samples[i - 1];
      const b = samples[i];
      const t = (z - a.z) / (b.z - a.z);
      return a.x + (b.x - a.x) * t;
    }
  }
  return samples[samples.length - 1].x;
}

/**
 * Build the rough corridor ring from the traced edges, widened where needed so
 * that every mown surface sits inside it.
 *
 * The trace is accurate to a few metres, which is fine for the look of the hole
 * but not tight enough to trust as a containing boundary — a fairway edge poking
 * outside the rough would leave a strip of unclassified ground mid-hole. Rather
 * than hand-fitting the two against each other, the traced edge is treated as a
 * minimum and pushed out wherever a mown surface would otherwise escape.
 */
function buildCorridor(mownSurfaces, margin = 5, step = 4) {
  const zMin = CORRIDOR_LEFT[0].z;
  const zMax = CORRIDOR_LEFT[CORRIDOR_LEFT.length - 1].z;

  const left = [];
  const right = [];

  for (let z = zMin; z <= zMax + 1e-6; z += step) {
    let xLeft = edgeXAt(CORRIDOR_LEFT, z);
    let xRight = edgeXAt(CORRIDOR_RIGHT, z);

    // Widen to clear any mown geometry sitting near this station.
    for (const surface of mownSurfaces) {
      for (const point of surface.points) {
        if (Math.abs(point.z - z) > step) continue;
        xLeft = Math.min(xLeft, point.x - margin);
        xRight = Math.max(xRight, point.x + margin);
      }
    }

    left.push({ x: round2(xLeft), z: round2(z) });
    right.push({ x: round2(xRight), z: round2(z) });
  }

  return [...left, ...right.reverse()];
}

/** Build a polygon by offsetting a centreline left and right by its width. */
function ribbon(spine, widthDelta = 0) {
  const left = [];
  const right = [];

  for (let i = 0; i < spine.length; i++) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular to the direction of travel.
    const nx = -dz / len;
    const nz = dx / len;
    const half = (spine[i].width + widthDelta) / 2;

    left.push({ x: round2(spine[i].x + nx * half), z: round2(spine[i].z + nz * half) });
    right.push({ x: round2(spine[i].x - nx * half), z: round2(spine[i].z - nz * half) });
  }

  return [...left, ...right.reverse()];
}

/** Closed ellipse, used for the green and its fringe. */
function ellipse(cx, cz, radiusX, radiusZ, segments = 20) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: round2(cx + Math.cos(angle) * radiusX),
      z: round2(cz + Math.sin(angle) * radiusZ)
    });
  }
  return points;
}

/** Rectangle aligned to the hole direction, used for the tee box. */
function teeBox(cx, cz, width, depth) {
  const half = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: cx - half, z: cz - halfDepth },
    { x: cx + half, z: cz - halfDepth },
    { x: cx + half, z: cz + halfDepth },
    { x: cx - half, z: cz + halfDepth }
  ];
}

/** Cart path sweeping across the front of the tee, traced from the reference. */
const CART_PATH_PX = [
  [56, 648], [82, 662], [110, 674], [140, 684], [170, 690], [196, 686], [214, 676]
];

function pathRibbon(pixelPoints, widthMetres) {
  const spine = pixelPoints.map(([x, y]) => ({ ...px(x, y), width: widthMetres }));
  return ribbon(spine);
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

/**
 * Every tree readable in the reference overhead, as [pixelX, pixelY, type, scale].
 *
 * Types are the billboard kinds TreeRenderer already provides. Positions are
 * traced by eye and carry the same ~+/-5 m tolerance as the surface edges.
 */
const TREES_PX = [
  // Around and left of the green.
  [38, 22, 'PINE', 1.0], [60, 14, 'GUM_LARGE', 1.1], [84, 10, 'GUM_MEDIUM', 1.0],
  [30, 48, 'GUM_LARGE', 1.05], [52, 44, 'PINE', 0.95], [72, 60, 'GUM_MEDIUM', 1.0],
  [44, 78, 'CLUSTER', 1.0],
  // Right of the green.
  [150, 20, 'PINE', 1.05], [168, 40, 'GUM_LARGE', 1.1], [178, 66, 'PINE', 1.0],
  [186, 96, 'GUM_MEDIUM', 0.95],

  // Left avenue, upper half.
  [16, 110, 'GUM_LARGE', 1.1], [30, 132, 'PINE', 1.0], [20, 152, 'GUM_MEDIUM', 0.95],
  [34, 172, 'GUM_LARGE', 1.05], [26, 196, 'PINE', 1.0], [40, 214, 'GUM_MEDIUM', 0.95],
  [32, 236, 'GUM_LARGE', 1.1], [48, 252, 'PINE', 1.0], [42, 274, 'GUM_MEDIUM', 0.95],
  [56, 292, 'GUM_LARGE', 1.05], [50, 314, 'PINE', 1.0], [64, 330, 'GUM_MEDIUM', 0.95],

  // Left edge, lower half.
  [70, 360, 'GUM_LARGE', 1.1], [62, 388, 'PINE', 1.0], [74, 410, 'GUM_MEDIUM', 0.95],
  [66, 436, 'GUM_LARGE', 1.05], [78, 458, 'PINE', 1.0], [70, 484, 'GUM_MEDIUM', 0.95],
  [82, 508, 'GUM_LARGE', 1.1], [74, 534, 'PINE', 1.0], [86, 556, 'GUM_MEDIUM', 0.95],
  [78, 582, 'GUM_LARGE', 1.05], [90, 604, 'PINE', 1.0], [84, 628, 'BUSH', 1.0],
  [96, 648, 'GUM_MEDIUM', 0.9], [88, 668, 'BUSH', 1.0],

  // Right avenue, separating this hole from its neighbour.
  [196, 130, 'GUM_LARGE', 1.1], [188, 156, 'PINE', 1.0], [198, 180, 'GUM_MEDIUM', 0.95],
  [192, 206, 'GUM_LARGE', 1.05], [202, 232, 'PINE', 1.0], [196, 258, 'GUM_MEDIUM', 0.95],
  [206, 284, 'GUM_LARGE', 1.1], [200, 310, 'PINE', 1.0], [210, 336, 'GUM_MEDIUM', 0.95],
  [204, 362, 'GUM_LARGE', 1.05], [212, 388, 'PINE', 1.0], [206, 414, 'GUM_MEDIUM', 0.95],
  [216, 440, 'GUM_LARGE', 1.1], [210, 466, 'PINE', 1.0], [218, 492, 'GUM_MEDIUM', 0.95],
  [212, 518, 'GUM_LARGE', 1.05], [220, 544, 'PINE', 1.0], [214, 570, 'GUM_MEDIUM', 0.95],
  [206, 596, 'GUM_LARGE', 1.05], [198, 620, 'PINE', 1.0],

  // Specimen trees standing in the open upper half — these shape the second shot.
  [122, 64, 'GUM_LARGE', 1.15], [148, 92, 'GUM_MEDIUM', 1.0], [106, 128, 'GUM_LARGE', 1.1],
  [136, 152, 'PINE', 1.05], [160, 178, 'GUM_MEDIUM', 1.0], [114, 192, 'GUM_LARGE', 1.1],
  [146, 216, 'GUM_MEDIUM', 1.0], [126, 248, 'GUM_LARGE', 1.05], [156, 272, 'PINE', 1.0],
  [134, 300, 'GUM_MEDIUM', 0.95], [164, 326, 'GUM_LARGE', 1.05],

  // The stand through the middle of the hole that splits the corridor in two.
  [112, 424, 'GUM_LARGE', 1.15], [128, 436, 'CLUSTER', 1.1], [142, 452, 'GUM_LARGE', 1.1],
  [118, 462, 'GUM_MEDIUM', 1.0], [134, 478, 'GUM_LARGE', 1.15], [148, 492, 'CLUSTER', 1.05],
  [122, 500, 'GUM_MEDIUM', 1.0], [138, 516, 'GUM_LARGE', 1.1], [152, 530, 'GUM_MEDIUM', 1.0],
  [126, 540, 'GUM_LARGE', 1.15], [140, 556, 'CLUSTER', 1.1], [154, 570, 'GUM_MEDIUM', 1.0],
  [130, 580, 'GUM_LARGE', 1.1], [144, 596, 'GUM_MEDIUM', 1.0],

  // Between that stand and the right-hand avenue.
  [170, 430, 'GUM_MEDIUM', 1.0], [182, 456, 'GUM_LARGE', 1.05], [174, 486, 'PINE', 1.0],
  [186, 512, 'GUM_MEDIUM', 0.95], [178, 540, 'GUM_LARGE', 1.05], [190, 566, 'PINE', 1.0],
  [182, 592, 'GUM_MEDIUM', 0.95],

  // Framing the tee.
  [112, 652, 'GUM_MEDIUM', 1.0], [126, 668, 'BUSH', 1.0], [168, 656, 'GUM_MEDIUM', 1.0],
  [180, 672, 'BUSH', 1.0]
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildHole() {
  // Mown surfaces first: the rough corridor is then fitted around them.
  const fairway = {
    id: 'hole-01-fairway',
    type: 'FAIRWAY',
    name: 'Clubhouse Climb Fairway',
    points: ribbon(FAIRWAY_SPINE)
  };

  const firstCut = {
    id: 'hole-01-first-cut',
    type: 'FIRST_CUT',
    name: 'Clubhouse Climb First Cut',
    points: ribbon(FAIRWAY_SPINE, 8)
  };

  const green = {
    id: 'hole-01-green',
    type: 'GREEN',
    name: 'Clubhouse Climb Green',
    points: ellipse(GREEN_CENTRE.x, GREEN_CENTRE.z, 15, 13)
  };

  const fringe = {
    id: 'hole-01-fringe',
    type: 'FRINGE',
    name: 'Clubhouse Climb Fringe',
    points: ellipse(GREEN_CENTRE.x, GREEN_CENTRE.z, 17.5, 15.5)
  };

  const tee = {
    id: 'hole-01-tee',
    type: 'TEE',
    name: 'Clubhouse Climb Back Tee',
    points: teeBox(TEE.x, TEE.z, 12, 8)
  };

  const corridor = {
    id: 'hole-01-corridor',
    type: 'ROUGH',
    name: 'Clubhouse Climb Rough',
    points: buildCorridor([firstCut, green, fringe, tee])
  };

  // Widest first, so a narrower surface wins the lie lookup where they overlap.
  const surfaces = [
    corridor,
    firstCut,
    fairway,
    tee,
    fringe,
    green,
    {
      id: 'hole-01-cart-path',
      type: 'PATH',
      name: 'Clubhouse Cart Path',
      points: pathRibbon(CART_PATH_PX, 3)
    },
    {
      id: 'hole-01-clubhouse-oob',
      type: 'OUT_OF_BOUNDS',
      name: 'Clubhouse Grounds',
      points: [
        { x: 186, z: 0 },
        { x: 240, z: 0 },
        { x: 240, z: 96 },
        { x: 190, z: 96 }
      ]
    }
  ];

  const trees = TREES_PX.map(([x, y, type, scale]) => {
    const world = px(x, y);
    return { x: world.x, z: world.z, type, scale };
  });

  return {
    courseId: 'sophie-hills',
    courseName: 'Sophie Hills (Fictional)',
    holeId: 'hole-01',
    holeNumber: 1,
    par: 4,
    publishedLengthMetres: PLAYING_LENGTH,
    status: 'fictional-gameplay-course',
    tee: { x: TEE.x, y: 0, z: TEE.z },
    greenCentre: { x: GREEN_CENTRE.x, y: 0, z: GREEN_CENTRE.z },
    surfaces,
    trees,
    features: [],
    notes: [
      'Sophie Hills is a fictional gameplay course.',
      'Its layout must never be presented as Warragul Country Club or any other real course.',
      'Shape drawn from a reference overhead supplied by the design owner: 337 m par 4, no bunkers, ~20 m of climb from tee to green.',
      'The playing line runs straight into the stand of trees mid-hole, so the fairway favours the right-hand side.',
      'Surface edges and tree positions were traced by eye and are accurate to roughly +/-5 m.',
      'Regenerate with: node tools/course-builder/build-sophie-hills-hole-01.mjs'
    ]
  };
}

function buildTerrainMeta(min, max) {
  return {
    courseId: 'sophie-hills',
    courseName: 'Sophie Hills (Fictional)',
    holeId: 'hole-01',
    holeNumber: 1,
    status: 'fictional-gameplay-terrain',
    source: 'Synthetic heightfield authored for Sophie Hills hole 1, shaped to a ~20 m tee-to-green climb',
    sourceCRS: 'EPSG:7855',
    // Fictional bounds. They exist to satisfy the terrain schema and to keep the
    // debug readouts self-consistent; they do not locate a real place.
    sourceBoundsMGA55: {
      minEasting: 404800,
      minNorthing: 5776800,
      maxEasting: 404800 + WORLD_X_EXTENT,
      maxNorthing: 5776800 + WORLD_Z_EXTENT
    },
    gridSpacingMetres: GRID_SPACING,
    widthSamples: WIDTH_SAMPLES,
    heightSamples: HEIGHT_SAMPLES,
    axisMapping: {
      columns: 'worldX',
      rows: 'worldZ',
      worldXExtentMetres: WORLD_X_EXTENT,
      worldZExtentMetres: WORLD_Z_EXTENT,
      isNorthingProven: false,
      note: 'Fictional coordinates for Sophie Hills hole 1. This terrain belongs to this hole alone.'
    },
    baseElevationMetres: BASE_ELEVATION,
    minElevationMetres: BASE_ELEVATION + min,
    maxElevationMetres: BASE_ELEVATION + max,
    binary: {
      file: 'terrain.bin',
      type: 'Float32',
      endianness: 'little',
      order: 'row-major',
      valueMeaning: 'metres above baseElevationMetres',
      expectedValues: WIDTH_SAMPLES * HEIGHT_SAMPLES,
      expectedBytes: WIDTH_SAMPLES * HEIGHT_SAMPLES * 4
    },
    verticalScaleDefault: 1,
    warning: 'Fictional synthetic terrain authored for Sophie Hills hole 1. It does not represent any real course.'
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const { values, min, max } = buildTerrain();

  // Float32Array is already little-endian on every platform the game targets, but
  // write through a DataView so the encoding matches TerrainLoader's explicit
  // little-endian reader regardless of host byte order.
  const buffer = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(values[i], i * 4);
  }

  writeFileSync(resolve(OUT_DIR, 'terrain.bin'), buffer);
  writeFileSync(
    resolve(OUT_DIR, 'terrain_meta.json'),
    JSON.stringify(buildTerrainMeta(min, max), null, 2) + '\n'
  );
  writeFileSync(resolve(OUT_DIR, 'hole.json'), JSON.stringify(buildHole(), null, 2) + '\n');

  const hole = buildHole();
  console.log(`Sophie Hills hole 1 written to ${OUT_DIR}`);
  console.log(`  playing line   ${PLAYING_LENGTH} m (tee -> bend -> green)`);
  console.log(`  terrain        ${WIDTH_SAMPLES}x${HEIGHT_SAMPLES} @ ${GRID_SPACING} m = ${WORLD_X_EXTENT}x${WORLD_Z_EXTENT} m`);
  console.log(`  elevation      ${(BASE_ELEVATION + min).toFixed(2)} m to ${(BASE_ELEVATION + max).toFixed(2)} m`);
  console.log(`  climb tee->pin ${(elevationAt(GREEN_CENTRE.x, GREEN_CENTRE.z) - elevationAt(TEE.x, TEE.z)).toFixed(2)} m`);
  console.log(`  surfaces       ${hole.surfaces.length}`);
  console.log(`  trees          ${hole.trees.length}`);
}

main();
