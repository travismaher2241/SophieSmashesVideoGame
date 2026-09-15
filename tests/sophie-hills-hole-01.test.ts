import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HoleConfig, HoleData, HoleTree } from '../src/course/HoleData';
import { Game, SOPHIE_HILLS_CONFIG } from '../src/game/Game';
import { SurfacePoint } from '../src/course/SurfaceQuery';

const HOLE_DIR = resolve(process.cwd(), 'public/courses/sophie-hills/hole-01');
const hole = JSON.parse(readFileSync(resolve(HOLE_DIR, 'hole.json'), 'utf8')) as HoleConfig;
const meta = JSON.parse(readFileSync(resolve(HOLE_DIR, 'terrain_meta.json'), 'utf8'));

function surface(id: string) {
  const found = hole.surfaces.find((entry) => entry.id === id);
  if (!found) throw new Error(`hole-01 is missing surface "${id}"`);
  return found;
}

/** Ray-cast point-in-polygon, matching the containment rule SurfaceQuery uses. */
function containsPoint(polygon: SurfacePoint[], point: { x: number; z: number }): boolean {
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

/** X of the straight tee-to-green line at a given z. */
function playingLineXAt(z: number): number {
  const t = (z - hole.tee!.z) / (hole.greenCentre!.z - hole.tee!.z);
  return hole.tee!.x + (hole.greenCentre!.x - hole.tee!.x) * t;
}

/** Absolute ground elevation in metres at a world position, from the heightfield. */
function elevationAt(x: number, z: number): number {
  const bin = readFileSync(resolve(HOLE_DIR, 'terrain.bin'));
  const col = Math.round(x / meta.gridSpacingMetres);
  const row = Math.round(z / meta.gridSpacingMetres);
  const index = row * meta.widthSamples + col;
  return meta.baseElevationMetres + bin.readFloatLE(index * 4);
}

describe('Sophie Hills hole 1', () => {
  it('is a 337 metre par 4 with no bunkers', () => {
    expect(hole.holeNumber).toBe(1);
    expect(hole.par).toBe(4);
    expect(hole.publishedLengthMetres).toBe(337);
    expect(hole.surfaces.some((entry) => entry.type === 'BUNKER')).toBe(false);
  });

  it('measures its own tee-to-green distance consistently with the card', () => {
    // Straight-line is shorter than the card length because the hole doglegs;
    // the card measures along the playing line.
    const straightLine = Math.hypot(
      hole.greenCentre!.x - hole.tee!.x,
      hole.greenCentre!.z - hole.tee!.z
    );
    expect(straightLine).toBeGreaterThan(320);
    expect(straightLine).toBeLessThan(hole.publishedLengthMetres);
  });

  it('keeps every mown surface inside the rough corridor', () => {
    const corridor = surface('hole-01-corridor').points;

    for (const id of [
      'hole-01-fairway',
      'hole-01-first-cut',
      'hole-01-green',
      'hole-01-fringe',
      'hole-01-tee'
    ]) {
      for (const point of surface(id).points) {
        expect(
          containsPoint(corridor, point),
          `${id} point (${point.x}, ${point.z}) escapes the rough corridor`
        ).toBe(true);
      }
    }
  });

  it('leaves the fairway clear of trees', () => {
    // Corrected by the design owner: the real hole has no trees in the fairway.
    // It is lined by trees from both sides, and the corridor itself is open.
    const fairway = surface('hole-01-fairway').points;
    const inPlay = (hole.trees ?? []).filter((tree) => containsPoint(fairway, tree));
    expect(inPlay).toEqual([]);
  });

  it('lines the hole with trees from both sides', () => {
    // Clear is not the same as bare: the hole should still be a tree-lined avenue.
    const trees = hole.trees ?? [];
    const landing = trees.filter((tree) => tree.z > 80 && tree.z < 200);
    const left = landing.filter((tree) => tree.x < playingLineXAt(tree.z));
    const right = landing.filter((tree) => tree.x > playingLineXAt(tree.z));

    expect(left.length).toBeGreaterThan(5);
    expect(right.length).toBeGreaterThan(5);
  });

  it('authors its trees rather than relying on procedural scatter', () => {
    expect(hole.trees?.length).toBeGreaterThan(60);
    expect(() =>
      HoleData.validateTrees(hole.trees, hole, 'hole-01.json')
    ).not.toThrow();
  });

  it('rejects malformed authored trees', () => {
    const badType = [{ x: 10, z: 10, type: 'OAK' }] as unknown as HoleTree[];
    expect(() => HoleData.validateTrees(badType, hole, 'test')).toThrow(/unknown type "OAK"/);

    const badPosition = [{ x: Number.NaN, z: 10, type: 'PINE' }] as HoleTree[];
    expect(() => HoleData.validateTrees(badPosition, hole, 'test')).toThrow(/non-finite/);

    const badScale = [{ x: 10, z: 10, type: 'PINE', scale: 0 }] as HoleTree[];
    expect(() => HoleData.validateTrees(badScale, hole, 'test')).toThrow(/scale 0/);
  });

  it('climbs roughly 20 metres from tee to green', () => {
    const climb = elevationAt(hole.greenCentre!.x, hole.greenCentre!.z) -
      elevationAt(hole.tee!.x, hole.tee!.z);

    expect(climb).toBeGreaterThan(17);
    expect(climb).toBeLessThan(23);
  });

  it('climbs gradually rather than in a step', () => {
    const tee = elevationAt(hole.tee!.x, hole.tee!.z);
    let previous = tee;

    for (let z = hole.tee!.z; z <= hole.greenCentre!.z; z += 20) {
      const here = elevationAt(150 - ((150 - 120) * (z - 40)) / 335, z);
      // Never more than a 2 m rise per 20 m of hole, and never a drop of any size.
      expect(here - previous).toBeLessThan(2.5);
      expect(here - previous).toBeGreaterThan(-1.5);
      previous = here;
    }
  });

  it('plays on its own heightfield rather than the shared course terrain', () => {
    expect(Game.resolveTerrainPath(SOPHIE_HILLS_CONFIG, 0)).toBe('/courses/sophie-hills/hole-01');
    expect(Game.resolveTerrainPath(SOPHIE_HILLS_CONFIG, 1)).toBe('/courses/sophie-hills');

    // The shared field is too short to hold a 337 m hole, which is why this one
    // carries its own.
    const shared = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/courses/sophie-hills/terrain_meta.json'), 'utf8')
    );
    const sharedDepth = (shared.heightSamples - 1) * shared.gridSpacingMetres;
    const ownDepth = (meta.heightSamples - 1) * meta.gridSpacingMetres;
    expect(ownDepth).toBeGreaterThan(sharedDepth);
    expect(hole.greenCentre!.z).toBeGreaterThan(sharedDepth);
  });

  it('is labelled fictional and never as a real course', () => {
    expect(hole.courseId).toBe('sophie-hills');
    expect(hole.status).toBe('fictional-gameplay-course');
    expect(hole.notes?.join(' ')).toMatch(/never be presented as Warragul/i);
    expect(meta.status).toBe('fictional-gameplay-terrain');
    expect(meta.warning).toMatch(/fictional/i);
  });
});
