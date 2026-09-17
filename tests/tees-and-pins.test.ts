import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';
import { HoleConfig } from '../src/course/HoleData';
import { SurfaceQuery } from '../src/course/SurfaceQuery';
import { DEFAULT_TEE, newRoundSeed, pinForHole, pinOptions, selectedTeeBox, teeOptions } from '../src/game/RoundSetup';
import { loadProgress, newProgress, saveProgress } from '../src/game/Progress';

function loadHole(index: number): HoleConfig {
  const path = SOPHIE_HILLS_CONFIG.holes[index].holePath;
  return JSON.parse(readFileSync(resolve(process.cwd(), `public${path}/hole.json`), 'utf8'));
}

const holes = SOPHIE_HILLS_CONFIG.holes.map((_, index) => loadHole(index));

/** Ray-cast containment, matching SurfaceQuery's own rule. */
function contains(polygon: { x: number; z: number }[], point: { x: number; z: number }): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { x: xi, z: zi } = polygon[i];
    const { x: xj, z: zj } = polygon[j];
    if (zi > point.z !== zj > point.z && point.x < ((xj - xi) * (point.z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdge(polygon: { x: number; z: number }[], point: { x: number; z: number }): number {
  let nearest = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j].x;
    const az = polygon[j].z;
    const dx = polygon[i].x - ax;
    const dz = polygon[i].z - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lengthSq));
    nearest = Math.min(nearest, Math.hypot(point.x - (ax + t * dx), point.z - (az + t * dz)));
  }
  return nearest;
}

function surface(hole: HoleConfig, id: string) {
  const found = hole.surfaces.find((entry) => entry.id === id);
  if (!found) throw new Error(`${hole.holeId} has no surface "${id}"`);
  return found;
}

describe('Sophie Hills tee boxes', () => {
  it('offers three tees on every hole', () => {
    for (const hole of holes) {
      expect(hole.teeBoxes?.map((teeBox) => teeBox.id), hole.holeId).toEqual(['BACK', 'MIDDLE', 'FORWARD']);
    }
  });

  it('measures the card from the back tee', () => {
    // The card length is a promise about a specific tee. Adding tees must not
    // quietly change which one the scorecard is describing.
    for (const hole of holes) {
      const back = hole.teeBoxes!.find((teeBox) => teeBox.id === 'BACK')!;
      expect(back.x, hole.holeId).toBe(hole.tee!.x);
      expect(back.z, hole.holeId).toBe(hole.tee!.z);
      expect(back.lengthMetres, hole.holeId).toBe(hole.publishedLengthMetres);
    }
  });

  it('makes each tee forward of the last one a shorter hole', () => {
    for (const hole of holes) {
      const [back, middle, forward] = hole.teeBoxes!;
      expect(middle.lengthMetres, hole.holeId).toBeLessThan(back.lengthMetres);
      expect(forward.lengthMetres, hole.holeId).toBeLessThan(middle.lengthMetres);
      // Far enough apart to be worth choosing between.
      expect(back.lengthMetres - forward.lengthMetres, hole.holeId).toBeGreaterThanOrEqual(12);
    }
  });

  it('stands every tee on its own mown tee surface', () => {
    for (const hole of holes) {
      for (const teeBox of hole.teeBoxes!) {
        const pad = surface(hole, teeBox.surfaceId);
        expect(pad.type, `${hole.holeId} ${teeBox.id}`).toBe('TEE');
        expect(contains(pad.points, teeBox), `${hole.holeId} ${teeBox.id} is off its own pad`).toBe(true);
      }
    }
  });

  it('gives every tee a tee lie', () => {
    // The question that matters is not which polygons overlap but which one the
    // game reports when the ball is put down there. Water, out of bounds and
    // sand all outrank a tee in that lookup, so a pad walked up the hole into a
    // creek would tee off from the creek. (A cart path does not outrank it,
    // which is just as well: hole 1's traced path sweeps across its back tee.)
    for (const hole of holes) {
      const query = new SurfaceQuery(hole.surfaces);

      for (const teeBox of hole.teeBoxes!) {
        expect(query.getLieAt(teeBox.x, teeBox.z).type, `${hole.holeId} ${teeBox.id} tee`).toBe('TEE');
      }
    }
  });

  it('keeps every tee inside the hole corridor', () => {
    for (const hole of holes) {
      const corridor = hole.surfaces.find((entry) => entry.type === 'ROUGH');
      if (!corridor) continue;

      for (const teeBox of hole.teeBoxes!) {
        expect(contains(corridor.points, teeBox), `${hole.holeId} ${teeBox.id} is outside the hole`).toBe(true);
      }
    }
  });
});

describe('Sophie Hills pin positions', () => {
  it('offers five cuttable pins on every green', () => {
    for (const hole of holes) {
      expect(hole.pinPositions?.length, hole.holeId).toBe(5);
    }
  });

  it('cuts every pin on the putting surface with room around it', () => {
    // A pin on the lip of the green turns a good approach into a ball on the
    // fringe, so each one keeps four metres of putting surface all round.
    for (const hole of holes) {
      const green = hole.surfaces.find((entry) => entry.type === 'GREEN')!;

      for (const pin of hole.pinPositions!) {
        expect(contains(green.points, pin), `${hole.holeId} ${pin.id} is off the green`).toBe(true);
        expect(distanceToEdge(green.points, pin), `${hole.holeId} ${pin.id}`).toBeGreaterThanOrEqual(3.9);
      }
    }
  });

  it('puts the left pin on the player\'s left', () => {
    // The game aims with atan2(dz, dx) and aiming left lowers that angle, so
    // playing up the hole the player's left hand is the +x side. A mirrored
    // label is not a crash, it is a pin sheet that lies.
    for (const hole of holes) {
      const tee = hole.tee!;
      const left = hole.pinPositions!.find((pin) => pin.id === 'LEFT')!;
      const right = hole.pinPositions!.find((pin) => pin.id === 'RIGHT')!;
      const aim = Math.atan2(hole.greenCentre!.z - tee.z, hole.greenCentre!.x - tee.x);

      const sideOf = (pin: { x: number; z: number }) =>
        Math.cos(aim) * (pin.z - hole.greenCentre!.z) - Math.sin(aim) * (pin.x - hole.greenCentre!.x);

      expect(sideOf(left), `${hole.holeId} left pin`).toBeLessThan(0);
      expect(sideOf(right), `${hole.holeId} right pin`).toBeGreaterThan(0);
    }
  });

  it('moves the pin from round to round', () => {
    // Two different rounds should not play the same eighteen pins. This is the
    // whole point of the feature, so it is worth pinning down rather than
    // assuming the hash spreads.
    const hole = holes[0];
    const pinsFor = (seed: number) =>
      holes.map((_, index) => pinForHole(hole, seed, index + 1)!.id).join('');

    expect(pinsFor(1)).not.toBe(pinsFor(2));
    // ...and the same round plays the same pins however often it is asked.
    expect(pinsFor(1)).toBe(pinsFor(1));
  });

  it('uses more than one pin within a single round', () => {
    const used = new Set(holes.map((hole, index) => pinForHole(hole, 12345, index + 1)!.id));
    expect(used.size).toBeGreaterThan(1);
  });

  it('draws a seed in range', () => {
    expect(newRoundSeed(() => 0)).toBe(0);
    expect(newRoundSeed(() => 0.9999999)).toBeLessThan(0x7fffffff);
    expect(Number.isInteger(newRoundSeed())).toBe(true);
  });
});

describe('a hole with no tee or pin data still plays', () => {
  const bare = {
    holeId: 'bare-01',
    publishedLengthMetres: 300,
    tee: { x: 10, y: 0, z: 10 },
    greenCentre: { x: 10, y: 0, z: 310 },
    surfaces: []
  } as unknown as HoleConfig;

  it('falls back to the hole tee and the middle of the green', () => {
    expect(teeOptions(bare)).toHaveLength(1);
    expect(selectedTeeBox(bare, 'FORWARD')).toMatchObject({ id: 'BACK', x: 10, z: 10, lengthMetres: 300 });
    expect(pinOptions(bare)).toEqual([{ id: 'MIDDLE', name: 'MIDDLE', x: 10, z: 310 }]);
    expect(pinForHole(bare, 7, 1)).toMatchObject({ x: 10, z: 310 });
  });

  it('answers nothing for a hole with no geometry at all', () => {
    expect(teeOptions(undefined)).toEqual([]);
    expect(selectedTeeBox(undefined, 'BACK')).toBeNull();
    expect(pinForHole(undefined, 1, 1)).toBeNull();
  });
});

describe('the chosen tee is remembered', () => {
  function fakeStorage(): Storage {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: () => null,
      length: 0
    } as unknown as Storage;
  }

  it('defaults to the back tee and survives a round trip', () => {
    const storage = fakeStorage();
    expect(newProgress().teeChoice).toBe(DEFAULT_TEE);

    saveProgress({ ...newProgress(), teeChoice: 'FORWARD' }, storage);
    expect(loadProgress(storage).teeChoice).toBe('FORWARD');
  });

  it('keeps the hole flyover on until it is turned off, and can turn it back on', () => {
    // A setting that can only be switched off is a trap: SKIP PREVIEWS sits one
    // tap from PLAY HOLE, and there was nowhere to undo it.
    const storage = fakeStorage();
    expect(newProgress().showHolePreviews).toBe(true);

    saveProgress({ ...newProgress(), showHolePreviews: false }, storage);
    expect(loadProgress(storage).showHolePreviews).toBe(false);

    saveProgress({ ...loadProgress(storage), showHolePreviews: true }, storage);
    expect(loadProgress(storage).showHolePreviews).toBe(true);
  });

  it('leaves the flyover on for a save that predates the setting', () => {
    const storage = fakeStorage();
    storage.setItem('sophie-smashes-progress-v1', JSON.stringify({ roundsPlayed: 3 }));
    expect(loadProgress(storage).showHolePreviews).toBe(true);
  });

  it('ignores a tee it does not recognise', () => {
    const storage = fakeStorage();
    storage.setItem('sophie-smashes-progress-v1', JSON.stringify({ teeChoice: 'LADIES' }));
    expect(loadProgress(storage).teeChoice).toBe(DEFAULT_TEE);
  });
});
