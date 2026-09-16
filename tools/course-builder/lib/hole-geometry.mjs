/**
 * Shared geometry and terrain helpers for Sophie Hills hole generators.
 *
 * Every hole generator writes the same three files — hole.json, terrain.bin and
 * terrain_meta.json — and has to satisfy the same invariants: mown surfaces
 * inside the rough, no trees standing in the fairway, an open approach to the
 * green. Those rules live here so a new hole cannot quietly skip them.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function round2(v) {
  return Math.round(v * 100) / 100;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a polygon by offsetting a centreline left and right by its width. */
export function ribbon(spine, widthDelta = 0) {
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

/** Closed ellipse, used for greens, fringes and the rounder hazards. */
export function ellipse(cx, cz, radiusX, radiusZ, segments = 20, rotation = 0) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const ex = Math.cos(angle) * radiusX;
    const ez = Math.sin(angle) * radiusZ;
    points.push({
      x: round2(cx + ex * Math.cos(rotation) - ez * Math.sin(rotation)),
      z: round2(cz + ex * Math.sin(rotation) + ez * Math.cos(rotation))
    });
  }
  return points;
}

/** Axis-aligned rectangle, used for tee boxes. */
export function box(cx, cz, width, depth) {
  const halfW = width / 2;
  const halfD = depth / 2;
  return [
    { x: round2(cx - halfW), z: round2(cz - halfD) },
    { x: round2(cx + halfW), z: round2(cz - halfD) },
    { x: round2(cx + halfW), z: round2(cz + halfD) },
    { x: round2(cx - halfW), z: round2(cz + halfD) }
  ];
}

/** Ray-cast point-in-polygon test, matching the game's own containment rule. */
export function pointInPolygon(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { x: xi, z: zi } = polygon[i];
    const { x: xj, z: zj } = polygon[j];
    const straddles = zi > point.z !== zj > point.z;
    if (straddles && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to a polygon's boundary. */
export function distanceToPolygonEdge(polygon, point) {
  let nearest = Infinity;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j].x;
    const az = polygon[j].z;
    const dx = polygon[i].x - ax;
    const dz = polygon[i].z - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0
      ? 0
      : clamp(((point.x - ax) * dx + (point.z - az) * dz) / lengthSq, 0, 1);
    const distance = Math.hypot(point.x - (ax + t * dx), point.z - (az + t * dz));
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

/**
 * A centreline sampled at regular intervals along a list of waypoints.
 *
 * Returns points carrying the distance travelled so far, so callers can place
 * anything by "metres from the tee" rather than by working out coordinates.
 */
/** Do these two segments cross? */
function segmentsCross(a1, a2, b1, b2) {
  const d = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);

  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * Do these two polygons share any ground?
 *
 * Vertices inside the other shape, either way round, plus crossing edges. That
 * covers every way two closed shapes can meet, including one swallowing the
 * other whole, which vertex tests alone would miss in one direction.
 */
export function polygonsOverlap(a, b) {
  if (a.some((point) => pointInPolygon(b, point))) return true;
  if (b.some((point) => pointInPolygon(a, point))) return true;

  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }

  return false;
}

/**
 * The gap between two polygons, or 0 where they touch or overlap.
 *
 * Measured from vertices to the other outline both ways round, which is close
 * enough for the smooth shapes a hole is drawn from.
 */
export function polygonGap(a, b) {
  if (polygonsOverlap(a, b)) return 0;

  let gap = Infinity;
  for (const point of a) gap = Math.min(gap, distanceToPolygonEdge(b, point));
  for (const point of b) gap = Math.min(gap, distanceToPolygonEdge(a, point));

  return gap;
}

export function sampleCentreline(waypoints, step = 5) {
  const samples = [];
  let travelled = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const segmentLength = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.round(segmentLength / step));

    for (let s = i === 1 ? 0 : 1; s <= count; s++) {
      const t = s / count;
      samples.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        distance: travelled + segmentLength * t
      });
    }
    travelled += segmentLength;
  }

  return samples;
}

/** Total length along a list of waypoints — the hole's playing line. */
export function pathLength(waypoints) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
  }
  return total;
}

/** Position and heading a given distance along the playing line. */
export function pointAtDistance(samples, distance) {
  if (distance <= samples[0].distance) return withHeading(samples, 0);
  const last = samples.length - 1;
  if (distance >= samples[last].distance) return withHeading(samples, last);

  for (let i = 1; i < samples.length; i++) {
    if (distance <= samples[i].distance) {
      const a = samples[i - 1];
      const b = samples[i];
      const span = b.distance - a.distance || 1;
      const t = (distance - a.distance) / span;
      const heading = Math.atan2(b.z - a.z, b.x - a.x);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading };
    }
  }
  return withHeading(samples, last);
}

function withHeading(samples, index) {
  const a = samples[Math.max(0, index - 1)];
  const b = samples[Math.min(samples.length - 1, index + 1)];
  return {
    x: samples[index].x,
    z: samples[index].z,
    heading: Math.atan2(b.z - a.z, b.x - a.x)
  };
}

/**
 * Offset a point sideways from the playing line.
 *
 * Positive `side` is right of the line looking down the hole from the tee,
 * negative is left, which is how the hole specs describe where hazards and trees
 * sit. Rotating the heading the other way mirrors every hazard on the course,
 * which is not something the generated geometry complains about — it just puts
 * the water on the wrong side of the hole from what the design says.
 */
export function offsetFromLine(point, sideMetres) {
  return {
    x: round2(point.x + Math.cos(point.heading - Math.PI / 2) * sideMetres),
    z: round2(point.z + Math.sin(point.heading - Math.PI / 2) * sideMetres)
  };
}

/**
 * Write a heightfield and its metadata for one hole.
 *
 * `elevationAt(x, z)` returns metres above `baseElevation`.
 */
export function writeTerrain({
  outDir,
  holeId,
  holeNumber,
  gridSpacing,
  widthSamples,
  heightSamples,
  baseElevation,
  elevationAt
}) {
  const values = new Float32Array(widthSamples * heightSamples);
  let min = Infinity;
  let max = -Infinity;

  for (let row = 0; row < heightSamples; row++) {
    const z = row * gridSpacing;
    for (let col = 0; col < widthSamples; col++) {
      const height = elevationAt(col * gridSpacing, z);
      values[row * widthSamples + col] = height;
      if (height < min) min = height;
      if (height > max) max = height;
    }
  }

  // Written through a DataView-equivalent so the encoding matches
  // TerrainLoader's explicit little-endian reader on any host byte order.
  const buffer = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(values[i], i * 4);
  }

  const worldXExtent = (widthSamples - 1) * gridSpacing;
  const worldZExtent = (heightSamples - 1) * gridSpacing;

  const meta = {
    courseId: 'sophie-hills',
    courseName: 'Sophie Hills (Fictional)',
    holeId,
    holeNumber,
    status: 'fictional-gameplay-terrain',
    source: `Synthetic heightfield authored for Sophie Hills ${holeId}`,
    sourceCRS: 'EPSG:7855',
    // Fictional bounds. They satisfy the terrain schema and keep the debug
    // readouts self-consistent; they do not locate a real place.
    sourceBoundsMGA55: {
      minEasting: 404000 + holeNumber * 1000,
      minNorthing: 5776000 + holeNumber * 1000,
      maxEasting: 404000 + holeNumber * 1000 + worldXExtent,
      maxNorthing: 5776000 + holeNumber * 1000 + worldZExtent
    },
    gridSpacingMetres: gridSpacing,
    widthSamples,
    heightSamples,
    axisMapping: {
      columns: 'worldX',
      rows: 'worldZ',
      worldXExtentMetres: worldXExtent,
      worldZExtentMetres: worldZExtent,
      isNorthingProven: false,
      note: `Fictional coordinates for Sophie Hills ${holeId}. This terrain belongs to this hole alone.`
    },
    baseElevationMetres: baseElevation,
    minElevationMetres: baseElevation + min,
    maxElevationMetres: baseElevation + max,
    binary: {
      file: 'terrain.bin',
      type: 'Float32',
      endianness: 'little',
      order: 'row-major',
      valueMeaning: 'metres above baseElevationMetres',
      expectedValues: widthSamples * heightSamples,
      expectedBytes: widthSamples * heightSamples * 4
    },
    verticalScaleDefault: 1,
    warning: `Fictional synthetic terrain authored for Sophie Hills ${holeId}. It does not represent any real course.`
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'terrain.bin'), buffer);
  writeFileSync(resolve(outDir, 'terrain_meta.json'), JSON.stringify(meta, null, 2) + '\n');

  return { min, max };
}

/** Write a hole layout, pretty-printed to stay reviewable in a diff. */
export function writeHole(outDir, hole) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'hole.json'), JSON.stringify(hole, null, 2) + '\n');
}

/**
 * Throw unless the hole is playable.
 *
 * These are the faults that have actually shipped here before: trees standing on
 * the fairway, trees walling off the green, and mown surfaces poking outside the
 * rough onto unclassified ground. Generators call this before writing.
 */
/**
 * Surfaces a well-struck shot is meant to finish on.
 *
 * A fairway is missing from this deliberately: a pond crossing the fairway is a
 * carry, which is a hazard doing its job. A pond over the green is a bug.
 */
const TARGET_SURFACES = new Set(['GREEN', 'FRINGE', 'TEE']);

/** How much daylight a hazard must leave around those surfaces. */
const WATER_TARGET_CLEARANCE = 2;

export function assertPlayable({
  holeId,
  trees,
  fairways,
  corridor,
  mownSurfaces,
  tee,
  green,
  water = [],
  drivingLine = null,
  drivingZone = null
}) {
  const problems = [];

  // Water where a tee shot lands is a trap, not a hazard: the player is aimed
  // there by default and has no way round it. Bunkers there are fine — that is
  // what a fairway bunker is for.
  if (drivingZone) {
    const aim = drivingLine ?? green;
    const ax = aim.x - tee.x;
    const az = aim.z - tee.z;
    const aimLength = Math.hypot(ax, az) || 1;

    for (const hazard of water) {
      for (const point of hazard.points) {
        const along = ((point.x - tee.x) * ax + (point.z - tee.z) * az) / aimLength;
        const across = Math.abs(az * (point.x - tee.x) - ax * (point.z - tee.z)) / aimLength;
        if (across < drivingZone.halfWidth && along > drivingZone.from && along < drivingZone.to) {
          problems.push(
            `water "${hazard.id}" sits in the tee-shot landing zone ` +
            `(${Math.round(along)}m out, ${Math.round(across)}m off the line)`
          );
          break;
        }
      }
    }
  }

  for (const tree of trees) {
    for (const fairway of fairways) {
      if (pointInPolygon(fairway, tree) || distanceToPolygonEdge(fairway, tree) < 6) {
        problems.push(`tree at (${tree.x}, ${tree.z}) stands on or beside the fairway`);
        break;
      }
    }
  }

  const dx = green.x - tee.x;
  const dz = green.z - tee.z;
  const lineLength = Math.hypot(dx, dz);

  for (const tree of trees) {
    const along = ((tree.x - tee.x) * dx + (tree.z - tee.z) * dz) / lineLength;
    const across = Math.abs(dz * (tree.x - tee.x) - dx * (tree.z - tee.z)) / lineLength;
    // Short of the green and near the line means standing between player and pin.
    if (across < 16 && along > lineLength - 70 && along < lineLength - 8) {
      problems.push(`tree at (${tree.x}, ${tree.z}) blocks the approach to the green`);
    }
  }

  for (const surface of mownSurfaces) {
    for (const point of surface.points) {
      if (!pointInPolygon(corridor, point)) {
        problems.push(`${surface.id} point (${point.x}, ${point.z}) escapes the rough corridor`);
        break;
      }
    }
  }

  // Water over a target is not a hazard, it is a lie. Whichever surface wins the
  // lookup, one of them is wrong: a ball pitching on the putting surface was
  // being fished out of a creek and penalised for it, because the creek was
  // drawn across the front fifth of the green.
  for (const hazard of water) {
    for (const surface of mownSurfaces) {
      if (!TARGET_SURFACES.has(surface.type)) continue;

      const gap = polygonGap(hazard.points, surface.points);
      if (gap < WATER_TARGET_CLEARANCE) {
        problems.push(
          `water "${hazard.id}" is ${gap === 0 ? 'on top of' : `only ${gap.toFixed(1)}m clear of`} ` +
          `${surface.id}, which a ball can legitimately finish on`
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`${holeId} is not playable:\n  - ${problems.slice(0, 12).join('\n  - ')}`);
  }
}
