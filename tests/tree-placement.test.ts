import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCorridorTrees, isClearOfPlay, TreeInstance } from '../src/rendering/TreeRenderer';
import { Game, SOPHIE_HILLS_CONFIG } from '../src/game/Game';
import { HoleConfig } from '../src/course/HoleData';

interface Point {
  x: number;
  z: number;
}

function loadHole(index: number): HoleConfig {
  const path = SOPHIE_HILLS_CONFIG.holes[index].holePath;
  return JSON.parse(readFileSync(resolve(process.cwd(), `public${path}/hole.json`), 'utf8'));
}

function terrainExtent(index: number): Point {
  const terrainPath = Game.resolveTerrainPath(SOPHIE_HILLS_CONFIG, index);
  const meta = JSON.parse(
    readFileSync(resolve(process.cwd(), `public${terrainPath}/terrain_meta.json`), 'utf8')
  );
  return {
    x: (meta.widthSamples - 1) * meta.gridSpacingMetres,
    z: (meta.heightSamples - 1) * meta.gridSpacingMetres
  };
}

/** Ray-cast point-in-polygon, matching the containment rule SurfaceQuery uses. */
function containsPoint(polygon: Point[], point: Point): boolean {
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

/** Where a point sits relative to the tee-to-green line. */
function relativeToLine(point: Point, tee: Point, green: Point) {
  const dx = green.x - tee.x;
  const dz = green.z - tee.z;
  const length = Math.hypot(dx, dz);
  return {
    along: ((point.x - tee.x) * dx + (point.z - tee.z) * dz) / length,
    across: Math.abs(dz * (point.x - tee.x) - dx * (point.z - tee.z)) / length,
    length
  };
}

/** The trees a hole actually renders: authored where present, generated otherwise. */
function treesForHole(index: number): TreeInstance[] {
  const hole = loadHole(index);
  const tee = { x: hole.tee!.x, z: hole.tee!.z };
  const green = { x: hole.greenCentre!.x, z: hole.greenCentre!.z };
  const fairways = hole.surfaces
    .filter((surface) => surface.type === 'FAIRWAY')
    .map((surface) => surface.points);

  return (hole.trees as TreeInstance[] | undefined)?.length
    ? (hole.trees as TreeInstance[])
    : generateCorridorTrees(tee, green, terrainExtent(index), fairways);
}

describe('tree placement keeps holes playable', () => {
  // The bug this pins: the backdrop arc behind each green swept a half-circle
  // around it, so its first trees landed ~20m SHORT of the green, walling off the
  // approach on every procedurally-dressed hole in the game.
  for (let index = 0; index < SOPHIE_HILLS_CONFIG.holes.length; index++) {
    const name = SOPHIE_HILLS_CONFIG.holes[index].holeName;

    it(`leaves the approach to the green open on hole ${index + 1} (${name})`, () => {
      const hole = loadHole(index);
      const tee = { x: hole.tee!.x, z: hole.tee!.z };
      const green = { x: hole.greenCentre!.x, z: hole.greenCentre!.z };

      const blocking = treesForHole(index).filter((tree) => {
        const { along, across, length } = relativeToLine(tree, tee, green);
        // Short of the green and near the line: standing between player and pin.
        return across < 16 && along > length - 70 && along < length - 8;
      });

      expect(
        blocking,
        `hole ${index + 1} has ${blocking.length} tree(s) in front of the green`
      ).toEqual([]);
    });

    it(`leaves the fairway open on hole ${index + 1} (${name})`, () => {
      // Checked against the hole's own fairway rather than the straight
      // tee-to-green line: on a doglegged hole that line cuts the corner, so a
      // tree on the inside of the bend is off the fairway but near the line.
      const hole = loadHole(index);
      const fairways = hole.surfaces.filter((entry) => entry.type === 'FAIRWAY');
      expect(fairways.length).toBeGreaterThan(0);

      const inFairway = treesForHole(index).filter((tree) =>
        fairways.some((fairway) => containsPoint(fairway.points, tree))
      );

      expect(
        inFairway,
        `hole ${index + 1} has ${inFairway.length} tree(s) standing in the fairway`
      ).toEqual([]);
    });

  }

  it('still frames each hole with trees rather than clearing them', () => {
    // The fix must not solve the problem by deleting the scenery.
    for (let index = 0; index < SOPHIE_HILLS_CONFIG.holes.length; index++) {
      expect(treesForHole(index).length).toBeGreaterThan(40);
    }
  });
});

describe('isClearOfPlay', () => {
  const tee = { x: 0, z: 0 };
  const green = { x: 0, z: 300 };

  it('rejects a tree standing in front of the green', () => {
    expect(isClearOfPlay({ x: 0, z: 270 }, tee, green)).toBe(false);
    expect(isClearOfPlay({ x: 10, z: 240 }, tee, green)).toBe(false);
  });

  it('rejects a tree standing in the fairway corridor', () => {
    expect(isClearOfPlay({ x: 0, z: 150 }, tee, green)).toBe(false);
    expect(isClearOfPlay({ x: -8, z: 80 }, tee, green)).toBe(false);
  });

  it('accepts trees lining the hole', () => {
    expect(isClearOfPlay({ x: 35, z: 150 }, tee, green)).toBe(true);
    expect(isClearOfPlay({ x: -40, z: 240 }, tee, green)).toBe(true);
  });

  it('accepts a backdrop behind the green', () => {
    expect(isClearOfPlay({ x: 0, z: 330 }, tee, green)).toBe(true);
    expect(isClearOfPlay({ x: 12, z: 345 }, tee, green)).toBe(true);
  });

  it('accepts trees behind the tee', () => {
    expect(isClearOfPlay({ x: 0, z: -100 }, tee, green)).toBe(true);
  });
});
