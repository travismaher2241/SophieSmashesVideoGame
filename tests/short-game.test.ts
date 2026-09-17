import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GOLF_CLUBS } from '../src/golf/Club';
import {
  adjacentShotType,
  applyShotType,
  carryForShot,
  clubForShortShot,
  shortGameAvailable,
  SHORT_GAME_RANGE_METRES,
  ShotType,
  suggestedShotType
} from '../src/golf/ShotType';
import { BallPhysics } from '../src/physics/BallPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery, SurfacePolygon } from '../src/course/SurfaceQuery';

const GROUND = 10;
const START_X = 50;
const START_Z = 200;

function flatFairway() {
  const meta = {
    courseId: 'short-game', holeNumber: 1, par: 4, status: 'test', sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0, widthSamples: 400, heightSamples: 400,
    baseElevation: GROUND, elevationRangeMetres: 0,
    binary: { demFile: 't.bin', bytesPerSample: 2, sampleEncoding: 'UINT16' as const, expectedBytes: 1 }
  };
  const terrain = new TerrainQuery(new TerrainData(meta, new Float32Array(400 * 400).fill(GROUND), 399, 399));
  const fairway: SurfacePolygon = {
    id: 'fairway', type: 'FAIRWAY', name: 'Fairway',
    points: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 400 }, { x: 0, z: 400 }]
  };
  return { terrain, surfaces: new SurfaceQuery([fairway]) };
}

const FLUSH = {
  powerRatio: 1, accuracyError: 0, strikeQuality: 'PURE' as const, feedbackText: 'PURE!',
  isPerfect: true, hookSliceAngleDegrees: 0, curveSpinFactor: 0
};

/** Carry, roll and total for a flushed shot of this type with this club. */
function play(clubId: string, type: ShotType, power = 1) {
  const { terrain, surfaces } = flatFairway();
  const ball = new BallPhysics(terrain, surfaces);
  ball.setPosition(START_X, START_Z);
  ball.launch(applyShotType(GOLF_CLUBS.find((c) => c.id === clubId)!, type), { ...FLUSH, powerRatio: power }, 0);

  const cup = new Vector3(START_X + 300, GROUND, START_Z);
  let elapsed = 0;
  let carry = 0;
  let landed = false;
  let apex = 0;
  while (ball.state !== 'REST' && elapsed < 30) {
    ball.update(1 / 60, cup);
    elapsed += 1 / 60;
    apex = Math.max(apex, ball.position.y - GROUND);
    if (!landed && (ball.state === 'BOUNCING' || ball.state === 'ROLLING')) {
      landed = true;
      carry = ball.position.x - START_X;
    }
  }
  const total = ball.position.x - START_X;
  return { carry, roll: total - carry, total, apex };
}

describe('the short shots', () => {
  it('flies a chip low and a lob high from the same club', () => {
    expect(play('sw', 'CHIP').apex).toBeLessThan(3);
    expect(play('sw', 'LOB').apex).toBeGreaterThan(9);
  });

  it('runs a chip out and stops a lob dead', () => {
    const chip = play('pw', 'CHIP');
    const lob = play('pw', 'LOB');

    // The chip spends a real part of its journey on the ground; the lob does not.
    expect(chip.roll / chip.carry).toBeGreaterThan(0.4);
    expect(lob.roll / lob.carry).toBeLessThan(0.2);
  });

  it('puts a pitch between them: in the air, and stopping', () => {
    const pitch = play('sw', 'PITCH');

    expect(pitch.apex).toBeGreaterThan(play('sw', 'CHIP').apex);
    expect(pitch.apex).toBeLessThan(play('sw', 'LOB').apex);
    expect(pitch.roll / pitch.carry).toBeLessThan(0.3);
  });

  it('makes the club matter: an 8 iron chip runs past a lob wedge chip', () => {
    // Without this the bag was pointless inside forty metres — every club
    // chipped the same distance.
    expect(play('8iron', 'CHIP').total).toBeGreaterThan(play('lw', 'CHIP').total * 1.5);
  });

  it('scales down with the meter, like any other swing', () => {
    for (const type of ['CHIP', 'PITCH', 'LOB'] as const) {
      expect(play('sw', type, 0.5).total, type).toBeLessThan(play('sw', type, 1).total);
    }
  });

  it('leaves a full shot exactly as the club plays it', () => {
    const club = GOLF_CLUBS.find((c) => c.id === '7iron')!;

    expect(applyShotType(club, 'FULL')).toEqual(club);
  });

  it('never rewrites the putter', () => {
    const putter = GOLF_CLUBS.find((c) => c.isPutter)!;

    for (const type of ['CHIP', 'PITCH', 'LOB'] as const) {
      expect(applyShotType(putter, type), type).toEqual(putter);
    }
  });
});

describe('offering the short game', () => {
  it('comes on near the green and stays off down the hole', () => {
    expect(shortGameAvailable(20, false)).toBe(true);
    expect(shortGameAvailable(SHORT_GAME_RANGE_METRES - 1, false)).toBe(true);
    expect(shortGameAvailable(SHORT_GAME_RANGE_METRES + 1, false)).toBe(false);
    expect(shortGameAvailable(180, false)).toBe(false);
  });

  it('stays off on the putting surface, where the putter is the shot', () => {
    expect(shortGameAvailable(10, true)).toBe(false);
  });

  it('suggests running the ball from close in and flying it from further out', () => {
    expect(suggestedShotType(12)).toBe('CHIP');
    expect(suggestedShotType(40)).toBe('PITCH');
    expect(suggestedShotType(120)).toBe('FULL');
  });

  it('clamps at each end rather than wrapping round', () => {
    expect(adjacentShotType('FULL', -1)).toBe('FULL');
    expect(adjacentShotType('LOB', 1)).toBe('LOB');
    expect(adjacentShotType('CHIP', 1)).toBe('PITCH');
  });
});

describe('choosing the club for a short shot', () => {
  it('hands over something that can actually reach the pin', () => {
    // It used to pick for the distance, so a pitch from forty metres came with a
    // lob wedge that carries twenty-four: legal, unplayable, and no way to tell
    // why from the readout.
    for (const distance of [10, 18, 25, 35, 45, 54]) {
      const type = suggestedShotType(distance);
      const club = clubForShortShot(GOLF_CLUBS, type, distance)!;
      const carry = carryForShot(club, type);

      expect(club, `${distance}m`).not.toBeNull();
      // Lands short and runs, or lands at the flag — but always within reach.
      expect(carry, `${distance}m carry`).toBeGreaterThan(distance * 0.4);
      expect(carry, `${distance}m carry`).toBeLessThan(distance * 1.15);
    }
  });

  it('takes more club for the same distance when the shot flies less far', () => {
    // A chip lands short and releases, so it wants a stronger club than a lob
    // covering the same ground.
    const chipClub = clubForShortShot(GOLF_CLUBS, 'CHIP', 30)!;
    const lobClub = clubForShortShot(GOLF_CLUBS, 'LOB', 30)!;

    expect(chipClub.carryMetres).toBeGreaterThan(lobClub.carryMetres);
  });

  it('never offers the putter as a chipping club', () => {
    for (const type of ['CHIP', 'PITCH', 'LOB'] as const) {
      expect(clubForShortShot(GOLF_CLUBS, type, 20)!.isPutter, type).toBe(false);
    }
  });
});

describe('how hard the turf grips', () => {
  it('grips a full shot completely, whatever club it came from', () => {
    // Every full shot arrives above the threshold — a driver at 45m/s down to a
    // lob wedge at 23 — so the distances the game is tuned around are untouched.
    for (const landingSpeed of [23, 30, 45, 60]) {
      expect(BallPhysics.turfBite(landingSpeed), `${landingSpeed}m/s`).toBe(1);
    }
  });

  it('lets a slow arrival skid', () => {
    expect(BallPhysics.turfBite(11)).toBeLessThan(0.3);
    expect(BallPhysics.turfBite(16)).toBeLessThan(0.6);
  });

  it('falls away with the square of the speed, not straight', () => {
    // Energy is what deforms turf, and energy goes with the square. A straight
    // falloff was still easing a 7 iron's landing at 30m/s, which added six
    // metres to its roll.
    expect(BallPhysics.turfBite(11)).toBeCloseTo(BallPhysics.turfBite(22) / 4, 3);
  });

  it('never gives the ground away entirely', () => {
    expect(BallPhysics.turfBite(0)).toBeGreaterThan(0);
    expect(BallPhysics.turfBite(0.01)).toBeGreaterThan(0);
  });
});
