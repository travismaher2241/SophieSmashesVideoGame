/**
 * Sophie Hills holes 2-18 generator.
 *
 * Sophie Hills is a FICTIONAL gameplay course. These holes are original designs,
 * not traced from anywhere, and must never be presented as a real course.
 *
 * WHY THESE HOLES WERE REBUILT
 * ----------------------------
 * The original nine were laid out inside one shared 778x318m heightfield, so
 * every hole had to be short enough to fit alongside its neighbours: the par 4s
 * ran 194-263m. A driver carries 230m, which made every par 4 on the course
 * drivable from the tee. That is not how golf works.
 *
 * Each hole now owns its heightfield, the way hole 1 does, so length is a design
 * decision rather than a packing constraint. Lengths are ordinary ones: par 3s
 * of 165-185m, par 4s of 330-400m, a par 5 of 500m. Par is unchanged at 35.
 *
 * Each hole keeps the character its name implies — Creekside Carry still carries
 * a creek, Sandbelt Turn still turns through sand — at a length that asks for a
 * tee shot and then an approach.
 *
 * Run: node tools/course-builder/build-sophie-hills-holes.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPlayable,
  box,
  buildPinPositions,
  buildTeeBoxes,
  clamp,
  ellipse,
  offsetFromLine,
  pathLength,
  pointAtDistance,
  polygonGap,
  ribbon,
  round2,
  sampleCentreline,
  writeHole,
  writeTerrain
} from './lib/hole-geometry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COURSE_DIR = resolve(HERE, '../../public/courses/sophie-hills');

const GRID_SPACING = 2;
/** Where the tee sits while the hole is laid out; the result is recentred after. */
const LAYOUT_ORIGIN = { x: 200, z: 200 };
/** Playable ground kept beyond the outermost geometry, in metres. */
const EDGE_MARGIN = 30;
/** How far the rough corridor runs past the tee and the green, in metres. */
const END_MARGIN = 45;

/**
 * The holes.
 *
 * `length` is the playing line in metres. `dogleg` bends the line: `at` is the
 * fraction of the hole where it turns, `offset` how far sideways the green ends
 * up (positive right, negative left). `climb` is the elevation change from tee
 * to green, which may be negative for a downhill hole.
 */
const HOLES = [
  {
    number: 2,
    name: 'Creekside Carry',
    par: 3,
    length: 165,
    climb: -4,
    fairwayWidth: 26,
    green: { radiusX: 16, radiusZ: 14 },
    // A creek immediately in front of the green: the whole hole is the carry.
    water: [{ at: 0.82, halfLength: 18, halfWidth: 26, side: 0 }],
    bunkers: [
      { at: 0.96, side: 24, radius: 7 },
      { at: 1.02, side: -22, radius: 6 }
    ],
    path: { at: 0.12, side: 0, span: 70 },
    notes: ['A short iron over the creek. Long is safer than short.']
  },
  {
    number: 3,
    name: 'Wattle Bend',
    par: 4,
    length: 355,
    climb: 6,
    dogleg: { at: 0.66, offset: 58 },
    fairwayWidth: 30,
    green: { radiusX: 15, radiusZ: 14 },
    bunkers: [
      { at: 0.52, side: 26, radius: 8 },
      { at: 0.98, side: -21, radius: 7 }
    ],
    path: { at: 0.08, side: 34, span: 120 },
    notes: ['Bends right off the tee. The inside bunker punishes the greedy line.']
  },
  {
    number: 4,
    name: 'Long Paddock',
    par: 4,
    length: 380,
    climb: 3,
    fairwayWidth: 34,
    green: { radiusX: 16, radiusZ: 15 },
    bunkers: [
      { at: 0.62, side: 22, radius: 9 },
      { at: 0.66, side: -24, radius: 8 },
      { at: 0.97, side: 20, radius: 7 }
    ],
    notes: ['Straight, open and long. Two good shots, no tricks.']
  },
  {
    number: 5,
    name: 'Gumtree Rise',
    par: 3,
    length: 185,
    climb: 12,
    fairwayWidth: 24,
    green: { radiusX: 17, radiusZ: 14 },
    bunkers: [
      { at: 0.93, side: 19, radius: 7 },
      { at: 0.93, side: -19, radius: 7 }
    ],
    notes: ['Uphill all the way, so it plays a club longer than the card says.']
  },
  {
    number: 6,
    name: 'Billabong',
    par: 4,
    length: 365,
    climb: -5,
    dogleg: { at: 0.6, offset: -40 },
    fairwayWidth: 30,
    green: { radiusX: 15, radiusZ: 14 },
    // Water down the left of the approach. Kept out of the tee-shot landing zone:
    // a hazard the player is aimed into by default is a trap, not a decision.
    water: [{ at: 0.84, halfLength: 42, halfWidth: 20, side: -50 }],
    bunkers: [{ at: 0.98, side: 22, radius: 7 }],
    path: { at: 0.1, side: -38, span: 140 },
    notes: ['The billabong guards the short way home down the left.']
  },
  {
    number: 7,
    name: 'Ridge Runner',
    par: 4,
    length: 400,
    climb: -14,
    fairwayWidth: 32,
    green: { radiusX: 16, radiusZ: 15 },
    bunkers: [
      { at: 0.58, side: -26, radius: 8 },
      { at: 0.99, side: 23, radius: 8 }
    ],
    path: { at: 0.06, side: 30, span: 100 },
    notes: ['The longest hole on the card, running downhill off the ridge.']
  },
  {
    number: 8,
    name: 'Sandbelt Turn',
    par: 4,
    length: 330,
    climb: 4,
    dogleg: { at: 0.7, offset: -46 },
    fairwayWidth: 28,
    green: { radiusX: 15, radiusZ: 13 },
    bunkers: [
      { at: 0.48, side: -22, radius: 9 },
      { at: 0.55, side: 24, radius: 8 },
      { at: 0.95, side: -20, radius: 8 },
      { at: 1.0, side: 21, radius: 7 }
    ],
    notes: ['The shortest par 4 on the back half, defended by sand at both turns.']
  },
  {
    number: 9,
    name: 'Homeward Bound',
    par: 5,
    length: 500,
    climb: 8,
    dogleg: { at: 0.62, offset: 52 },
    fairwayWidth: 32,
    green: { radiusX: 16, radiusZ: 15 },
    // The creek crosses beyond a drive, so it is the second shot that must decide
    // whether to carry it or lay up short.
    water: [{ at: 0.68, halfLength: 15, halfWidth: 30, side: 0 }],
    bunkers: [
      { at: 0.78, side: 24, radius: 8 },
      { at: 0.98, side: -22, radius: 7 }
    ],
    path: { at: 0.05, side: -32, span: 110 },
    notes: [
      'Out of reach in two: a lay-up short of the creek, then a wedge in.',
      'Finishes back beside the clubhouse.'
    ]
  },

  // --- the back nine -------------------------------------------------------
  // Turns away from the clubhouse and works back along the ridge. Longer than
  // the front on the whole, with the two short holes set against the wind.
  {
    number: 10,
    name: 'Ironbark Turn',
    par: 4,
    length: 340,
    climb: 6,
    dogleg: { at: 0.55, offset: -34 },
    fairwayWidth: 30,
    green: { radiusX: 15, radiusZ: 14 },
    bunkers: [
      { at: 0.62, side: -20, radius: 8 },
      { at: 0.97, side: 20, radius: 7 }
    ],
    path: { at: 0.08, side: 30, span: 90 },
    notes: ['Bends left off the tee; the bunker on the corner is in range of a good drive.']
  },
  {
    number: 11,
    name: 'The Long Acre',
    par: 5,
    length: 480,
    climb: -5,
    dogleg: { at: 0.7, offset: 40 },
    fairwayWidth: 34,
    green: { radiusX: 17, radiusZ: 15 },
    bunkers: [
      { at: 0.55, side: 26, radius: 9 },
      { at: 0.99, side: -24, radius: 8 }
    ],
    path: { at: 0.06, side: -34, span: 120 },
    notes: ['Downhill and reachable in two for anyone who takes on the corner.']
  },
  {
    number: 12,
    name: 'Stockyard',
    par: 3,
    length: 155,
    climb: 3,
    fairwayWidth: 24,
    green: { radiusX: 15, radiusZ: 13 },
    bunkers: [
      { at: 0.94, side: 18, radius: 7 },
      { at: 1.02, side: -17, radius: 6 }
    ],
    notes: ['Short iron, but the green is ringed with sand.']
  },
  {
    number: 13,
    name: 'Shearers Rest',
    par: 4,
    length: 370,
    climb: 9,
    fairwayWidth: 30,
    green: { radiusX: 16, radiusZ: 14 },
    bunkers: [{ at: 0.96, side: -22, radius: 8 }],
    path: { at: 0.1, side: 32, span: 100 },
    notes: ['Straight and uphill. The second shot plays a club longer than it looks.']
  },
  {
    number: 14,
    name: 'Short Paddock',
    par: 4,
    length: 315,
    climb: -3,
    dogleg: { at: 0.5, offset: 26 },
    fairwayWidth: 26,
    green: { radiusX: 14, radiusZ: 13 },
    bunkers: [
      { at: 0.72, side: 18, radius: 8 },
      { at: 0.98, side: -18, radius: 7 }
    ],
    notes: ['Short enough to tempt, narrow enough to punish. A wedge in from the fairway.']
  },
  {
    number: 15,
    name: 'Windmill',
    par: 3,
    length: 195,
    climb: -7,
    fairwayWidth: 26,
    green: { radiusX: 17, radiusZ: 15 },
    bunkers: [{ at: 0.93, side: 20, radius: 8 }],
    notes: ['The long short hole, played downhill into whatever is blowing.']
  },
  {
    number: 16,
    name: 'Ridgeback',
    par: 4,
    length: 395,
    climb: 12,
    dogleg: { at: 0.6, offset: -30 },
    fairwayWidth: 30,
    green: { radiusX: 16, radiusZ: 14 },
    bunkers: [
      { at: 0.68, side: -24, radius: 9 },
      { at: 0.99, side: 22, radius: 7 }
    ],
    path: { at: 0.07, side: 34, span: 110 },
    notes: ['The hardest on the card: long, uphill and bending away.']
  },
  {
    number: 17,
    name: 'Dam Wall',
    par: 4,
    length: 350,
    climb: -4,
    fairwayWidth: 30,
    green: { radiusX: 15, radiusZ: 14 },
    // Set wide and late: a hazard the tee shot cannot reach, guarding the second
    // shot instead. Anything nearer the line is a trap rather than a hazard —
    // the player is aimed there by default and has no way round it.
    water: [{ at: 0.88, halfLength: 15, halfWidth: 20, side: -46 }],
    bunkers: [{ at: 0.97, side: 20, radius: 7 }],
    path: { at: 0.09, side: 30, span: 95 },
    notes: ['Water down the left of the approach. The miss is right.']
  },
  {
    number: 18,
    name: 'Homeward Again',
    par: 5,
    length: 520,
    climb: 7,
    dogleg: { at: 0.64, offset: 44 },
    fairwayWidth: 32,
    green: { radiusX: 18, radiusZ: 16 },
    bunkers: [
      { at: 0.58, side: -26, radius: 9 },
      { at: 0.86, side: 24, radius: 8 },
      { at: 1.0, side: -20, radius: 7 }
    ],
    path: { at: 0.05, side: 34, span: 130 },
    notes: [
      'Three shots for most, and a green big enough to hold the last of them.',
      'Finishes at the clubhouse.'
    ]
  }
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Waypoints of the playing line, from the tee to the centre of the green. */
function buildPlayingLine(spec) {
  const startX = LAYOUT_ORIGIN.x;
  const startZ = LAYOUT_ORIGIN.z;
  const tee = { x: startX, z: startZ };
  const green = {
    x: startX + (spec.dogleg?.offset ?? 0),
    z: startZ + spec.length
  };

  if (!spec.dogleg) return [tee, green];

  // Turn where the spec says, then run to the green.
  const bend = {
    x: startX,
    z: startZ + spec.length * spec.dogleg.at
  };
  return [tee, bend, green];
}

/**
 * Scale the waypoints so the playing line measures exactly the specified length.
 *
 * A dogleg's sideways move lengthens the path, so the straight-line portions are
 * shortened to compensate and the card length stays honest.
 */
function fitToLength(waypoints, targetLength) {
  const actual = pathLength(waypoints);
  if (Math.abs(actual - targetLength) < 0.05) return waypoints;

  const tee = waypoints[0];
  const scale = targetLength / actual;
  return waypoints.map((point, index) =>
    index === 0
      ? point
      : { x: round2(tee.x + (point.x - tee.x) * scale), z: round2(tee.z + (point.z - tee.z) * scale) }
  );
}

/**
 * How much daylight a hazard has to leave around a surface you can finish on.
 * Matches the rule assertPlayable enforces.
 */
const WATER_TARGET_CLEARANCE = 2;

/**
 * Draw a hazard where the spec asks for it, then back it off until it is clear
 * of the surfaces a good shot finishes on.
 *
 * A creek "in front of the green" is a distance the author means loosely, and
 * getting it wrong is not a near miss: it drew water across the front fifth of
 * hole 2's green, so a shot that pitched on the putting surface was fished out
 * and penalised. Rather than hand-fitting a number that breaks again the moment
 * the hole length or the green size changes, the hazard walks back down the line
 * until it clears — the carry stays where the design wants it, as close to the
 * green as it can honestly sit.
 */
function waterClearOfTargets(water, centreline, length, targets) {
  const MAX_RETREAT = 40;

  for (let retreat = 0; retreat <= MAX_RETREAT; retreat += 0.5) {
    const along = clamp(length * water.at - retreat, 0, length);
    const point = pointAtDistance(centreline, along);
    const centre = offsetFromLine(point, water.side);
    const points = ellipse(centre.x, centre.z, water.halfWidth, water.halfLength, 18, point.heading);

    const clear = targets.every(
      (target) => polygonGap(points, target.points) >= WATER_TARGET_CLEARANCE
    );
    if (clear) return points;
  }

  throw new Error(
    `water at ${water.at} of the hole cannot be placed clear of the green: ` +
    `it is ${water.halfLength * 2}m long and there is not ${MAX_RETREAT}m of room to back it into`
  );
}

function buildHole(spec) {
  const holeId = `hole-${String(spec.number).padStart(2, '0')}`;
  const waypoints = fitToLength(buildPlayingLine(spec), spec.length);
  const centreline = sampleCentreline(waypoints, 5);
  const length = pathLength(waypoints);

  const tee = waypoints[0];
  const green = waypoints[waypoints.length - 1];
  // On a dogleg the corner is what you play to off the tee.
  const drivingLine = waypoints.length > 2 ? waypoints[1] : null;

  // --- mown surfaces -------------------------------------------------------
  // The fairway starts past the tee and stops short of the green, so the first
  // cut and fringe do the joining.
  const fairwayStart = Math.min(60, length * 0.2);
  const fairwayEnd = length - (spec.green.radiusZ + 14);

  const fairwaySpine = [];
  for (let d = fairwayStart; d <= fairwayEnd; d += 10) {
    const point = pointAtDistance(centreline, d);
    // Pinch slightly through the driving zone, widen towards the green.
    const progress = (d - fairwayStart) / Math.max(1, fairwayEnd - fairwayStart);
    // Wider through the middle, where tee shots land, rather than pinched there.
    const pinch = 1 + 0.14 * Math.sin(progress * Math.PI);
    fairwaySpine.push({ x: round2(point.x), z: round2(point.z), width: round2(spec.fairwayWidth * pinch) });
  }

  const fairway = {
    id: `${holeId}-fairway`,
    type: 'FAIRWAY',
    name: `${spec.name} Fairway`,
    points: ribbon(fairwaySpine)
  };

  const firstCut = {
    id: `${holeId}-first-cut`,
    type: 'FIRST_CUT',
    name: `${spec.name} First Cut`,
    points: ribbon(fairwaySpine, 9)
  };

  const greenSurface = {
    id: `${holeId}-green`,
    type: 'GREEN',
    name: `${spec.name} Green`,
    points: ellipse(green.x, green.z, spec.green.radiusX, spec.green.radiusZ)
  };

  const fringe = {
    id: `${holeId}-fringe`,
    type: 'FRINGE',
    name: `${spec.name} Fringe`,
    points: ellipse(green.x, green.z, spec.green.radiusX + 2.5, spec.green.radiusZ + 2.5)
  };

  // The back tee, needed here so a hazard can be walked clear of it. The other
  // two tees are cut once the hazards are down, so they can dodge them.
  const teeSurface = {
    id: `${holeId}-tee`,
    type: 'TEE',
    name: `${spec.name} Back Tee`,
    points: box(tee.x, tee.z, 14, 9)
  };

  // --- rough corridor ------------------------------------------------------
  // Built as a ribbon around the whole playing line, wide enough to contain the
  // mown surfaces by construction rather than by hand-fitting.
  const corridorSpine = [];
  for (let d = -END_MARGIN; d <= length + END_MARGIN; d += 10) {
    const point = pointAtDistance(centreline, clamp(d, 0, length));
    const overshoot = d < 0 ? d : d > length ? d - length : 0;
    corridorSpine.push({
      x: round2(point.x + Math.cos(point.heading) * overshoot),
      z: round2(point.z + Math.sin(point.heading) * overshoot),
      width: spec.fairwayWidth + 78
    });
  }

  const corridor = {
    id: `${holeId}-corridor`,
    type: 'ROUGH',
    name: `${spec.name} Rough`,
    points: ribbon(corridorSpine)
  };

  // --- hazards -------------------------------------------------------------
  const hazards = [];

  for (const [index, water] of (spec.water ?? []).entries()) {
    hazards.push({
      id: `${holeId}-water-${index + 1}`,
      type: 'WATER',
      name: index === 0 ? `${spec.name} Water` : `${spec.name} Water ${index + 1}`,
      points: waterClearOfTargets(water, centreline, length, [greenSurface, fringe, teeSurface])
    });
  }

  for (const [index, bunker] of (spec.bunkers ?? []).entries()) {
    const point = pointAtDistance(centreline, length * bunker.at);
    const centre = offsetFromLine(point, bunker.side);
    hazards.push({
      id: `${holeId}-bunker-${index + 1}`,
      type: 'BUNKER',
      name: `${spec.name} Bunker ${index + 1}`,
      points: ellipse(centre.x, centre.z, bunker.radius * 1.35, bunker.radius, 12, point.heading)
    });
  }

  if (spec.path) {
    const point = pointAtDistance(centreline, length * spec.path.at);
    const pathSpine = [];
    for (let s = -spec.path.span / 2; s <= spec.path.span / 2; s += 10) {
      const along = pointAtDistance(centreline, clamp(length * spec.path.at + s, 0, length));
      const shifted = offsetFromLine(along, spec.path.side);
      pathSpine.push({ x: shifted.x, z: shifted.z, width: 3 });
    }
    hazards.push({
      id: `${holeId}-path`,
      type: 'PATH',
      name: `${spec.name} Cart Path`,
      points: ribbon(pathSpine.length >= 2 ? pathSpine : [
        { x: point.x, z: point.z, width: 3 },
        { x: point.x + 1, z: point.z + 10, width: 3 }
      ])
    });
  }

  // --- tees ----------------------------------------------------------------
  // Three tees up the same line: the back one where the hole has always been
  // played from, and two cut further up it, clear of the hazards and off the
  // mown fairway.
  const teePlan = buildTeeBoxes({
    holeId,
    name: spec.name,
    centreline,
    length,
    avoid: hazards.map((hazard) => hazard.points),
    preferClear: [fairway.points, firstCut.points],
    padWidth: 14,
    padDepth: 9
  });
  const teeSurfaces = teePlan.surfaces;

  // --- pins ----------------------------------------------------------------
  // Five cuttable pin positions, so the same green asks a different question
  // from one round to the next.
  const pins = buildPinPositions({
    holeId,
    green,
    radiusX: spec.green.radiusX,
    radiusZ: spec.green.radiusZ,
    greenPolygon: greenSurface.points
  });

  // --- trees ---------------------------------------------------------------
  const trees = buildTrees(spec, centreline, length, green);

  const mownSurfaces = [firstCut, fairway, ...teeSurfaces, fringe, greenSurface];

  // Widest first, so a narrower surface wins the lie lookup where they overlap.
  const surfaces = [corridor, firstCut, fairway, ...teeSurfaces, fringe, greenSurface, ...hazards];

  // Size the terrain to what the hole actually occupies and shift the hole onto
  // it. Fixed margins guessed ahead of time were wrong as soon as a backdrop tree
  // sat further behind the green than expected, and geometry off the edge of the
  // heightfield is silently dropped at render time.
  const placed = recentre({ surfaces, trees, tee, green, drivingLine, teeBoxes: teePlan.boxes, pins });

  assertPlayable({
    holeId,
    trees: placed.trees,
    fairways: [placed.byId(fairway.id).points],
    corridor: placed.byId(corridor.id).points,
    mownSurfaces: mownSurfaces.map((surface) => placed.byId(surface.id)),
    tee: placed.tee,
    green: placed.green,
    water: placed.surfaces.filter((surface) => surface.type === 'WATER'),
    drivingLine: placed.drivingLine,
    // Where a struck tee shot comes down: a driver carries 230m and runs on.
    drivingZone: spec.par === 3 ? null : { from: 170, to: 300, halfWidth: 22 }
  });

  return {
    holeId,
    widthSamples: placed.widthSamples,
    heightSamples: placed.heightSamples,
    tee: placed.tee,
    green: placed.green,
    length,
    hole: {
      courseId: 'sophie-hills',
      courseName: 'Sophie Hills (Fictional)',
      holeId,
      holeNumber: spec.number,
      par: spec.par,
      publishedLengthMetres: Math.round(length),
      status: 'fictional-gameplay-course',
      tee: { x: placed.tee.x, y: 0, z: placed.tee.z },
      greenCentre: { x: placed.green.x, y: 0, z: placed.green.z },
      ...(placed.drivingLine
        ? { drivingLine: { x: placed.drivingLine.x, y: 0, z: placed.drivingLine.z } }
        : {}),
      teeBoxes: placed.teeBoxes,
      pinPositions: placed.pins,
      surfaces: placed.surfaces,
      trees: placed.trees,
      features: [],
      notes: [
        'Sophie Hills is a fictional gameplay course.',
        'Its layout must never be presented as Warragul Country Club or any other real course.',
        ...(spec.notes ?? []),
        'Regenerate with: node tools/course-builder/build-sophie-hills-holes.mjs'
      ]
    }
  };
}

/**
 * Shift a hole so its geometry sits inside a terrain sized to fit it, with a
 * margin of playable ground all round.
 */
function recentre({ surfaces, trees, tee, green, drivingLine, teeBoxes = [], pins = [] }) {
  const xs = [];
  const zs = [];
  for (const surface of surfaces) {
    for (const point of surface.points) {
      xs.push(point.x);
      zs.push(point.z);
    }
  }
  for (const tree of trees) {
    xs.push(tree.x);
    zs.push(tree.z);
  }

  const shiftX = EDGE_MARGIN - Math.min(...xs);
  const shiftZ = EDGE_MARGIN - Math.min(...zs);

  const spanX = Math.max(...xs) - Math.min(...xs) + EDGE_MARGIN * 2;
  const spanZ = Math.max(...zs) - Math.min(...zs) + EDGE_MARGIN * 2;

  const move = (point) => ({ ...point, x: round2(point.x + shiftX), z: round2(point.z + shiftZ) });
  const movedSurfaces = surfaces.map((surface) => ({ ...surface, points: surface.points.map(move) }));

  return {
    surfaces: movedSurfaces,
    trees: trees.map(move),
    tee: move(tee),
    green: move(green),
    drivingLine: drivingLine ? move(drivingLine) : null,
    teeBoxes: teeBoxes.map(move),
    pins: pins.map(move),
    widthSamples: Math.ceil(spanX / GRID_SPACING) + 1,
    heightSamples: Math.ceil(spanZ / GRID_SPACING) + 1,
    byId: (id) => movedSurfaces.find((surface) => surface.id === id)
  };
}

function buildTrees(spec, centreline, length, green) {
  const trees = [];
  const setback = spec.fairwayWidth / 2 + 16;
  const types = ['GUM_LARGE', 'PINE', 'GUM_MEDIUM', 'CLUSTER'];

  for (let d = -25, i = 0; d <= length + 35; d += 16, i++) {
    const point = pointAtDistance(centreline, clamp(d, 0, length));
    const overshoot = d < 0 ? d : d > length ? d - length : 0;
    const base = {
      x: point.x + Math.cos(point.heading) * overshoot,
      z: point.z + Math.sin(point.heading) * overshoot,
      heading: point.heading
    };

    // Wobble the lines so they read as planting rather than fence posts.
    const leftJitter = 4 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 14;
    const rightJitter = 4 + (Math.cos(i * 1.3) * 0.5 + 0.5) * 14;

    const left = offsetFromLine(base, -(setback + leftJitter));
    const right = offsetFromLine(base, setback + rightJitter);

    trees.push({ ...left, type: types[i % types.length], scale: round2(0.9 + (i % 4) * 0.08) });
    trees.push({ ...right, type: types[(i + 2) % types.length], scale: round2(0.9 + (i % 3) * 0.1) });

    if (i % 3 === 0) {
      const outerLeft = offsetFromLine(base, -(setback + leftJitter + 17));
      const outerRight = offsetFromLine(base, setback + rightJitter + 17);
      trees.push({ ...outerLeft, type: 'CLUSTER', scale: 1.15 });
      trees.push({ ...outerRight, type: 'CLUSTER', scale: 1.15 });
    }
  }

  // Backdrop strictly behind the green, never across the approach.
  const greenPoint = pointAtDistance(centreline, length);
  for (let j = 0; j < 12; j++) {
    const theta = (j / 11) * Math.PI;
    const distance = 34 + (j % 3) * 9;
    const across = Math.cos(theta) * distance;
    const behind = Math.sin(theta) * distance + 16;
    trees.push({
      x: round2(green.x + Math.cos(greenPoint.heading + Math.PI / 2) * across + Math.cos(greenPoint.heading) * behind),
      z: round2(green.z + Math.sin(greenPoint.heading + Math.PI / 2) * across + Math.sin(greenPoint.heading) * behind),
      type: j % 2 === 0 ? 'GUM_LARGE' : 'CLUSTER',
      scale: round2(1.05 + (j % 3) * 0.12)
    });
  }

  return trees;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function makeElevation(spec, built) {
  const { tee, green, length } = built;

  return (x, z) => {
    // Progress measured along the tee-to-green axis, which is close enough to the
    // playing line for shaping ground.
    const dx = green.x - tee.x;
    const dz = green.z - tee.z;
    const axisLength = Math.hypot(dx, dz) || 1;
    const along = clamp(((x - tee.x) * dx + (z - tee.z) * dz) / (axisLength * axisLength), 0, 1);

    const climb = spec.climb * (0.75 * along + 0.25 * along * along);
    const across = (dz * (x - tee.x) - dx * (z - tee.z)) / axisLength;
    const crossFall = clamp(across / 140, -1, 1) * 1.6;

    const undulation =
      Math.sin(z * 0.028 + spec.number) * 0.5 +
      Math.sin(z * 0.015 + x * 0.012) * 0.4 +
      Math.cos(x * 0.024 + spec.number * 0.7) * 0.35;

    let height = climb + crossFall + undulation;

    height = flatten(height, x, z, tee.x, tee.z, 10, 18, () => ambient(tee.x, tee.z));
    height = flatten(height, x, z, green.x, green.z, spec.green.radiusX, spec.green.radiusX + 10, (dzLocal) =>
      // Greens fall gently from back to front so downhill putts run.
      ambient(green.x, green.z) + (dzLocal / spec.green.radiusX) * 0.45
    );

    return height;

    function ambient(px, pz) {
      const a = clamp(((px - tee.x) * dx + (pz - tee.z) * dz) / (axisLength * axisLength), 0, 1);
      const ac = (dz * (px - tee.x) - dx * (pz - tee.z)) / axisLength;
      return (
        spec.climb * (0.75 * a + 0.25 * a * a) +
        clamp(ac / 140, -1, 1) * 1.6 +
        Math.sin(pz * 0.028 + spec.number) * 0.5 +
        Math.sin(pz * 0.015 + px * 0.012) * 0.4 +
        Math.cos(px * 0.024 + spec.number * 0.7) * 0.35
      );
    }

    function flatten(current, px, pz, cx, cz, inner, outer, shape) {
      const distance = Math.hypot(px - cx, pz - cz);
      if (distance > outer) return current;

      const padHeight = shape(pz - cz);
      if (distance <= inner) return padHeight;

      const t = (distance - inner) / (outer - inner);
      const smooth = t * t * (3 - 2 * t);
      return padHeight * (1 - smooth) + current * smooth;
    }
  };
}

// ---------------------------------------------------------------------------

function main() {
  let totalPar = 0;
  let totalLength = 0;

  for (const spec of HOLES) {
    const built = buildHole(spec);
    const outDir = resolve(COURSE_DIR, built.holeId);

    // Base elevations step down the course so holes do not all sit at one height.
    const baseElevation = 60 - spec.number * 1.5;

    const range = writeTerrain({
      outDir,
      holeId: built.holeId,
      holeNumber: spec.number,
      gridSpacing: GRID_SPACING,
      widthSamples: built.widthSamples,
      heightSamples: built.heightSamples,
      baseElevation,
      elevationAt: makeElevation(spec, built)
    });

    writeHole(outDir, built.hole);

    totalPar += spec.par;
    totalLength += Math.round(built.length);

    console.log(
      `${built.holeId} ${spec.name.padEnd(16)} par ${spec.par}  ${String(Math.round(built.length)).padStart(3)}m  ` +
      `terrain ${built.widthSamples}x${built.heightSamples}  ` +
      `relief ${(range.max - range.min).toFixed(1)}m  ` +
      `${built.hole.surfaces.length} surfaces  ${built.hole.trees.length} trees`
    );
  }

  console.log(`\nholes 2-18: par ${totalPar}, ${totalLength}m (hole 1 adds par 4, 337m)`);
}

main();
