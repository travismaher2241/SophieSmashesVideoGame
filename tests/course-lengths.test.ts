import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';
import { GOLF_CLUBS } from '../src/golf/Club';

const DRIVER = GOLF_CLUBS.find((club) => club.name === 'DRIVER')!;

/** A well-struck drive carries its full number and then runs out. */
const TYPICAL_DRIVE = DRIVER.carryMetres * 1.1;

function loadHole(index: number) {
  const path = SOPHIE_HILLS_CONFIG.holes[index].holePath;
  return JSON.parse(readFileSync(resolve(process.cwd(), `public${path}/hole.json`), 'utf8'));
}

const holes = SOPHIE_HILLS_CONFIG.holes.map((_, index) => loadHole(index));

/** Ray-cast point-in-polygon, matching the containment rule SurfaceQuery uses. */
function containsPoint(polygon: { x: number; z: number }[], point: { x: number; z: number }): boolean {
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

/** Where the game aims the opening tee shot, and where a drive down it lands. */
function driveLanding(hole: any, distance: number) {
  const target = hole.drivingLine ?? hole.greenCentre;
  const dx = target.x - hole.tee.x;
  const dz = target.z - hole.tee.z;
  const length = Math.hypot(dx, dz);
  return { x: hole.tee.x + (dx / length) * distance, z: hole.tee.z + (dz / length) * distance };
}

describe('Sophie Hills plays at credible lengths', () => {
  it('keeps the card at par 71 over eighteen holes', () => {
    expect(holes).toHaveLength(18);
    expect(holes.reduce((total, hole) => total + hole.par, 0)).toBe(71);
  });

  it('gives each nine a shape of its own', () => {
    const out = holes.slice(0, 9);
    const back = holes.slice(9);

    expect(out.reduce((total, hole) => total + hole.par, 0)).toBe(35);
    expect(back.reduce((total, hole) => total + hole.par, 0)).toBe(36);
    // Two short holes and at least one par 5 on each nine, so neither half is
    // nine of the same hole.
    for (const [name, nine] of [['out', out], ['in', back]] as const) {
      expect(nine.filter((hole) => hole.par === 3), name).toHaveLength(2);
      expect(nine.filter((hole) => hole.par === 5).length, name).toBeGreaterThanOrEqual(1);
    }
  });

  it('never lets a drive reach a par 4 green', () => {
    // The fault this pins: the nine were laid out inside one shared heightfield,
    // so every hole had to be short enough to fit beside its neighbours. The par
    // 4s ran 194-263m against a 230m driver — every one of them drivable.
    for (const hole of holes.filter((entry) => entry.par === 4)) {
      expect(
        hole.publishedLengthMetres,
        `${hole.holeId} is ${hole.publishedLengthMetres}m, reachable with a drive of ${Math.round(TYPICAL_DRIVE)}m`
      ).toBeGreaterThan(TYPICAL_DRIVE + 50);
    }
  });

  it('leaves a real second shot on every par 4', () => {
    // Somewhere between a wedge and a long iron after a good drive.
    for (const hole of holes.filter((entry) => entry.par === 4)) {
      const approach = hole.publishedLengthMetres - TYPICAL_DRIVE;
      expect(approach).toBeGreaterThan(50);
      expect(approach).toBeLessThan(200);
    }
  });

  it('never lets a par 5 play as a long par 4', () => {
    // The rule is that a par 5 has to ask for a third shot from somewhere, not
    // that every one of them is unreachable — a par 5 you can get at with two
    // good ones is the best hole on most cards. So: beyond a drive and a mid
    // iron for all of them, and at least one genuine three-shotter.
    const driver = GOLF_CLUBS.find((club) => club.id === 'driver')!;
    const threeWood = GOLF_CLUBS.find((club) => club.name === '3 WOOD')!;
    const midIron = GOLF_CLUBS.find((club) => club.id === '7iron')!;
    const parFives = holes.filter((entry) => entry.par === 5);

    expect(parFives.length).toBeGreaterThanOrEqual(2);

    for (const hole of parFives) {
      expect(
        hole.publishedLengthMetres,
        `${hole.holeId} is ${hole.publishedLengthMetres}m: a drive and a 7 iron get there`
      ).toBeGreaterThan(TYPICAL_DRIVE + midIron.carryMetres);
    }

    const outOfReach = parFives.filter(
      (hole) => hole.publishedLengthMetres > TYPICAL_DRIVE + threeWood.carryMetres
    );
    expect(outOfReach.length, 'at least one par 5 needs three shots').toBeGreaterThanOrEqual(1);
  });

  it('keeps par 3s within a single club', () => {
    for (const hole of holes.filter((entry) => entry.par === 3)) {
      expect(hole.publishedLengthMetres).toBeLessThanOrEqual(DRIVER.carryMetres);
      expect(hole.publishedLengthMetres).toBeGreaterThan(110);
    }
  });

  it('lands a drive down the default aim on short grass', () => {
    // The game aims the opening shot for you. On a dogleg that aim used to point
    // at the green, across the corner, so a good drive finished in the trees
    // through no fault of the player.
    for (const hole of holes.filter((entry) => entry.par > 3)) {
      const landing = driveLanding(hole, DRIVER.carryMetres);
      const shortGrass = hole.surfaces.filter(
        (surface: any) => surface.type === 'FAIRWAY' || surface.type === 'FIRST_CUT'
      );

      expect(
        shortGrass.some((surface: any) => containsPoint(surface.points, landing)),
        `${hole.holeId}: a ${DRIVER.carryMetres}m drive on the default line misses the fairway`
      ).toBe(true);
    }
  });

  it('keeps water out of the tee-shot landing zone', () => {
    // Water where the player is aimed by default is a trap rather than a hazard.
    for (const hole of holes.filter((entry) => entry.par > 3)) {
      const target = hole.drivingLine ?? hole.greenCentre;
      const dx = target.x - hole.tee.x;
      const dz = target.z - hole.tee.z;
      const aimLength = Math.hypot(dx, dz);

      for (const water of hole.surfaces.filter((surface: any) => surface.type === 'WATER')) {
        for (const point of water.points) {
          const along = ((point.x - hole.tee.x) * dx + (point.z - hole.tee.z) * dz) / aimLength;
          const across = Math.abs(dz * (point.x - hole.tee.x) - dx * (point.z - hole.tee.z)) / aimLength;
          const inLandingZone = across < 22 && along > 170 && along < 300;

          expect(inLandingZone, `${hole.holeId}: ${water.id} sits where a tee shot lands`).toBe(false);
        }
      }
    }
  });

  it('measures a total in the range a par 71 course should be', () => {
    const total = holes.reduce((sum, hole) => sum + hole.publishedLengthMetres, 0);
    expect(total).toBeGreaterThan(5400);
    expect(total).toBeLessThan(6800);
  });

  it('matches each hole layout to its published length', () => {
    for (const hole of holes) {
      const straightLine = Math.hypot(
        hole.greenCentre.x - hole.tee.x,
        hole.greenCentre.z - hole.tee.z
      );
      // Straight-line can be shorter than the card on a dogleg, never longer.
      expect(straightLine).toBeLessThanOrEqual(hole.publishedLengthMetres + 1);
      expect(straightLine).toBeGreaterThan(hole.publishedLengthMetres * 0.75);
    }
  });
});
