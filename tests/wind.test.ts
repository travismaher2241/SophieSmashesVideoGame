import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CALM, describeWind, randomWind, readWindForAim, Wind, windVector } from '../src/golf/Wind';
import { GOLF_CLUBS } from '../src/golf/Club';
import { SwingResult } from '../src/golf/SwingMeter';
import { BallPhysics } from '../src/physics/BallPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery, SurfacePolygon } from '../src/course/SurfaceQuery';

/** Flat fairway, big enough that nothing runs off the edge of it. */
function flatCourse() {
  const meta = {
    courseId: 'wind-test',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0,
    widthSamples: 800,
    heightSamples: 800,
    baseElevation: 10,
    elevationRangeMetres: 1,
    binary: {
      demFile: 'terrain.bin',
      bytesPerSample: 2,
      sampleEncoding: 'UINT16' as const,
      expectedBytes: 1
    }
  };
  const terrain = new TerrainQuery(
    new TerrainData(meta, new Float32Array(800 * 800).fill(10), 799, 799)
  );

  const fairway: SurfacePolygon = {
    id: 'fairway',
    type: 'FAIRWAY',
    name: 'Fairway',
    points: [{ x: 0, z: 0 }, { x: 800, z: 0 }, { x: 800, z: 800 }, { x: 0, z: 800 }]
  };

  return { terrain, surfaces: new SurfaceQuery([fairway]) };
}

const FLUSH: SwingResult = {
  powerRatio: 1,
  accuracyError: 0,
  strikeQuality: 'PURE',
  feedbackText: 'PURE!',
  isPerfect: true,
  hookSliceAngleDegrees: 0,
  curveSpinFactor: 0
};

const START_X = 50;
const START_Z = 400;

/** A flushed shot aimed down +X, played into the given wind. */
function playShot(clubId: string, wind: Wind) {
  const { terrain, surfaces } = flatCourse();
  const ball = new BallPhysics(terrain, surfaces);
  ball.setWind(wind);
  ball.setPosition(START_X, START_Z);

  const club = GOLF_CLUBS.find((entry) => entry.id === clubId)!;
  ball.launch(club, FLUSH, 0);

  const cup = new Vector3(START_X + 400, 10, START_Z);
  let elapsed = 0;
  let carry = 0;
  let landed = false;

  while (ball.state !== 'REST' && elapsed < 30) {
    ball.update(1 / 60, cup);
    elapsed += 1 / 60;
    if (!landed && (ball.state === 'BOUNCING' || ball.state === 'ROLLING')) {
      landed = true;
      carry = ball.position.x - START_X;
    }
  }

  return { carry, total: ball.position.x - START_X, drift: ball.position.z - START_Z };
}

/** Blowing along +X is a tail wind for a shot aimed down +X. */
const tail = (speed: number): Wind => ({ speedMetresPerSecond: speed, directionRadians: 0 });
const head = (speed: number): Wind => ({ speedMetresPerSecond: speed, directionRadians: Math.PI });
const leftToRight = (speed: number): Wind => ({ speedMetresPerSecond: speed, directionRadians: Math.PI / 2 });

describe('wind in the flight model', () => {
  const calm = playShot('driver', CALM);

  it('carries a drive further downwind than into the wind', () => {
    const into = playShot('driver', head(4));
    const behind = playShot('driver', tail(4));

    expect(into.carry).toBeLessThan(calm.carry);
    expect(behind.carry).toBeGreaterThan(calm.carry);
  });

  it('costs a drive something like a club in a four metre headwind', () => {
    // About 10m on a 238m carry, which is roughly what 9mph into the face does
    // to a real drive. The range is wide enough not to break on a small change
    // to the flight model and tight enough to catch wind going missing again.
    const lost = calm.carry - playShot('driver', head(4)).carry;

    expect(lost).toBeGreaterThan(5);
    expect(lost).toBeLessThan(18);
  });

  it('pushes the ball sideways in a crossing wind, towards the side it blows', () => {
    // +Z is the right-hand side of a shot aimed down +X.
    const pushed = playShot('driver', leftToRight(5));

    expect(pushed.drift).toBeGreaterThan(5);
    expect(playShot('driver', CALM).drift).toBeCloseTo(0, 3);
  });

  it('moves a wedge less than a drive in absolute terms, and more as a share of the shot', () => {
    const wedgeCalm = playShot('pw', CALM);
    const wedgeLost = wedgeCalm.carry - playShot('pw', head(4)).carry;
    const driverLost = calm.carry - playShot('driver', head(4)).carry;

    expect(wedgeLost).toBeLessThan(driverLost);
    expect(wedgeLost / wedgeCalm.carry).toBeGreaterThan(driverLost / calm.carry);
  });

  it('leaves a putt alone: a rolling ball is held by the ground, not pushed by the air', () => {
    const { terrain, surfaces } = flatCourse();
    const ball = new BallPhysics(terrain, surfaces);
    ball.setWind(leftToRight(7));
    ball.setPosition(START_X, START_Z);

    const putter = GOLF_CLUBS.find((entry) => entry.id === 'putter')!;
    ball.launch(putter, { ...FLUSH, powerRatio: 0.4 }, 0);

    const cup = new Vector3(START_X + 400, 10, START_Z);
    let elapsed = 0;
    while (ball.state !== 'REST' && elapsed < 30) {
      ball.update(1 / 60, cup);
      elapsed += 1 / 60;
    }

    expect(ball.position.z - START_Z).toBeCloseTo(0, 3);
  });
});

describe('reading the wind', () => {
  it('points the vector the way the wind blows', () => {
    const blowingAlongX = windVector({ speedMetresPerSecond: 6, directionRadians: 0 });

    expect(blowingAlongX.x).toBeCloseTo(6, 6);
    expect(blowingAlongX.z).toBeCloseTo(0, 6);
  });

  it('calls a wind at your back a tail wind and one in your face a head wind', () => {
    expect(readWindForAim(tail(5), 0).label).toBe('TAIL');
    expect(readWindForAim(head(5), 0).label).toBe('HEAD');

    // Same wind, shot turned around: what was helping is now holding it up.
    expect(readWindForAim(tail(5), Math.PI).label).toBe('HEAD');
  });

  it('calls a crossing wind a cross wind, and leaves the side to the arrow', () => {
    expect(readWindForAim(leftToRight(5), 0).label).toBe('CROSS');
    expect(readWindForAim(leftToRight(5), 0).arrow).toBe('→');

    // Same wind, shot turned around: it crosses the other way.
    expect(readWindForAim(leftToRight(5), Math.PI).label).toBe('CROSS');
    expect(readWindForAim(leftToRight(5), Math.PI).arrow).toBe('←');
  });

  it('says which side a crossing wind pushes the ball towards', () => {
    // Positive crossing is to the player's right, matching the shot shapes.
    expect(readWindForAim(leftToRight(5), 0).crossing).toBeGreaterThan(0);
    expect(readWindForAim(leftToRight(5), Math.PI).crossing).toBeLessThan(0);
  });

  it('draws the arrow with the shot going up the screen', () => {
    expect(readWindForAim(tail(5), 0).arrow).toBe('↑');
    expect(readWindForAim(head(5), 0).arrow).toBe('↓');
    expect(readWindForAim(leftToRight(5), 0).arrow).toBe('→');
  });

  it('says CALM rather than a speed when there is no wind worth playing', () => {
    expect(describeWind(CALM, 0)).toBe('CALM');
    expect(describeWind(tail(4), 0)).toContain('TAIL');
  });

  it('draws a playable wind, never a gale', () => {
    let drawn = 0;
    const random = () => {
      drawn++;
      return (drawn * 0.37) % 1;
    };

    for (let i = 0; i < 200; i++) {
      const wind = randomWind(random);
      expect(wind.speedMetresPerSecond).toBeGreaterThanOrEqual(1);
      expect(wind.speedMetresPerSecond).toBeLessThanOrEqual(7);
      expect(wind.directionRadians).toBeGreaterThanOrEqual(0);
      expect(wind.directionRadians).toBeLessThan(Math.PI * 2);
    }
  });
});
