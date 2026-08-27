import { describe, expect, it } from 'vitest';
import { SwingMeter } from '../src/golf/SwingMeter';
import { BallPhysics } from '../src/physics/BallPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery } from '../src/course/SurfaceQuery';
import { ClubManager } from '../src/golf/Club';

function createMockTerrainQuery(): TerrainQuery {
  const meta = {
    courseId: 'test-course',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0,
    widthSamples: 200,
    heightSamples: 200,
    baseElevation: 100,
    elevationRangeMetres: 10,
    binary: {
      demFile: 'terrain.bin',
      bytesPerSample: 2,
      sampleEncoding: 'UINT16' as const,
      expectedBytes: 80000
    }
  };
  const elevations = new Float32Array(200 * 200).fill(10.0);
  const terrainData = new TerrainData(meta, elevations, 199, 199);
  return new TerrainQuery(terrainData);
}

describe('Three-Click Swing System', () => {
  it('Test 1: After Click 1, state is POWER_RUNNING and ball has NOT launched', () => {
    const meter = new SwingMeter();
    const terrainQuery = createMockTerrainQuery();
    const ballPhysics = new BallPhysics(terrainQuery, new SurfaceQuery());
    ballPhysics.setPosition(50, 50);

    expect(meter.getState()).toBe('READY');
    expect(ballPhysics.state).toBe('REST');

    // Click 1
    const state = meter.trigger();

    expect(state).toBe('POWER_RUNNING');
    expect(meter.getState()).toBe('POWER_RUNNING');
    expect(meter.getInputCount()).toBe(1);
    expect(ballPhysics.state).toBe('REST');
    expect(ballPhysics.velocity.length()).toBe(0);
    expect(meter.getResult()).toBeNull();
  });

  it('Test 2: After Click 2, power value is locked, state is ACCURACY_RUNNING and ball has NOT launched', () => {
    const meter = new SwingMeter();
    const terrainQuery = createMockTerrainQuery();
    const ballPhysics = new BallPhysics(terrainQuery, new SurfaceQuery());
    ballPhysics.setPosition(50, 50);

    // Click 1: start
    meter.trigger();
    expect(meter.getState()).toBe('POWER_RUNNING');

    // Simulate power rising
    meter.update(0.5); // 0.5s at 1.1 speed = 0.55
    const currentPower = meter.getPowerValue();
    expect(currentPower).toBeGreaterThan(0.4);
    expect(currentPower).toBeLessThan(0.7);

    // Click 2: lock power
    const state = meter.trigger();

    expect(state).toBe('ACCURACY_RUNNING');
    expect(meter.getState()).toBe('ACCURACY_RUNNING');
    expect(meter.getInputCount()).toBe(2);
    expect(meter.getPowerValue()).toBeCloseTo(currentPower, 5);

    // Further time update should change accuracy marker, but NOT power
    meter.update(0.2);
    expect(meter.getPowerValue()).toBeCloseTo(currentPower, 5);
    expect(meter.getAccuracyMarker()).toBeLessThan(1.0);

    // Ball still at rest
    expect(ballPhysics.state).toBe('REST');
    expect(meter.getResult()).toBeNull();
  });

  it('Test 3: After Click 3, accuracy value is locked, state is IMPACT, and ball launches exactly once', () => {
    const meter = new SwingMeter();
    const terrainQuery = createMockTerrainQuery();
    const ballPhysics = new BallPhysics(terrainQuery, new SurfaceQuery());
    const clubs = new ClubManager();
    const driver = clubs.getCurrentClub();
    ballPhysics.setPosition(50, 50);

    // Click 1
    meter.trigger();
    meter.update(0.8);

    // Click 2
    meter.trigger();
    expect(meter.getState()).toBe('ACCURACY_RUNNING');

    // Travel to sweet spot
    meter.update(0.6666);

    // Click 3
    const state = meter.trigger();
    expect(state).toBe('IMPACT');
    expect(meter.getInputCount()).toBe(3);

    const result = meter.getResult();
    expect(result).not.toBeNull();
    expect(result!.powerRatio).toBeGreaterThan(0.5);

    // Launch ball physics
    ballPhysics.launch(driver, result!, 0);
    meter.complete();

    expect(meter.getState()).toBe('COMPLETE');
    expect(ballPhysics.state).toBe('AIRBORNE');
    expect(ballPhysics.velocity.length()).toBeGreaterThan(10);
  });

  it('Test 4: Different Click 3 timings produce different accuracy errors', () => {
    // Early click test
    const meterEarly = new SwingMeter();
    meterEarly.trigger(); // Click 1
    meterEarly.update(0.5);
    meterEarly.trigger(); // Click 2 (power locked)
    meterEarly.update(0.2); // Only short return (early!)
    meterEarly.trigger(); // Click 3
    const resEarly = meterEarly.getResult()!;

    // Late click test
    const meterLate = new SwingMeter();
    meterLate.trigger(); // Click 1
    meterLate.update(0.5);
    meterLate.trigger(); // Click 2
    meterLate.update(1.1); // Long return past center (late!)
    meterLate.trigger(); // Click 3
    const resLate = meterLate.getResult()!;

    // Perfect click test
    const meterPerf = new SwingMeter();
    meterPerf.trigger();
    meterPerf.update(0.5);
    meterPerf.trigger();
    meterPerf.update(1.0 / 1.5); // Exactly 1.0 -> 0.0 at 1.5 speed = 0.6667s
    meterPerf.trigger();
    const resPerf = meterPerf.getResult()!;

    expect(resEarly.accuracyError).not.toEqual(resLate.accuracyError);
    expect(resEarly.accuracyError).not.toEqual(resPerf.accuracyError);
    expect(resEarly.accuracyError).toBeLessThan(-0.1);
    expect(resLate.accuracyError).toBeGreaterThan(0.1);
  });

  it('Test 5: Perfect Click 3 produces approximately zero directional error and PURE! feedback', () => {
    const meter = new SwingMeter();
    meter.trigger(); // 1
    meter.update(0.5);
    meter.trigger(); // 2
    // Move marker exactly from 1.0 to 0.0 (dt = 1.0 / 1.5 = 0.666667s)
    meter.update(1.0 / 1.5);
    meter.trigger(); // 3

    const result = meter.getResult()!;
    expect(result.accuracyError).toBeCloseTo(0.0, 2);
    expect(Math.abs(result.accuracyError)).toBeLessThan(0.05);
    expect(result.isPerfect).toBe(true);
    expect(result.strikeQuality).toBe('PURE');
    expect(result.feedbackText).toBe('PURE!');
    expect(Math.abs(result.hookSliceAngleDegrees)).toBeLessThan(1.0);
  });

  it('Test 6: Early and late Click 3 values produce opposite shot deviations', () => {
    const terrainQuery = createMockTerrainQuery();
    const clubs = new ClubManager();
    const driver = clubs.getCurrentClub();

    // Early Click (< 0): Hook / Pull Left
    const meterEarly = new SwingMeter();
    meterEarly.trigger(); // 1
    meterEarly.trigger(); // 2
    meterEarly.update(0.2); // Early
    meterEarly.trigger(); // 3
    const resEarly = meterEarly.getResult()!;

    // Late Click (> 0): Slice / Push Right
    const meterLate = new SwingMeter();
    meterLate.trigger(); // 1
    meterLate.trigger(); // 2
    meterLate.update(1.1); // Late
    meterLate.trigger(); // 3
    const resLate = meterLate.getResult()!;

    expect(resEarly.accuracyError).toBeLessThan(0);
    expect(resLate.accuracyError).toBeGreaterThan(0);

    expect(resEarly.hookSliceAngleDegrees).toBeLessThan(0); // Negative = Left
    expect(resLate.hookSliceAngleDegrees).toBeGreaterThan(0); // Positive = Right

    // Launch both with aiming straight along X axis (aimAngle = 0)
    const ballEarly = new BallPhysics(terrainQuery, new SurfaceQuery());
    ballEarly.setPosition(50, 50);
    ballEarly.launch(driver, resEarly, 0);

    const ballLate = new BallPhysics(terrainQuery, new SurfaceQuery());
    ballLate.setPosition(50, 50);
    ballLate.launch(driver, resLate, 0);

    // Initial lateral Z velocity should have opposite signs
    expect(ballEarly.velocity.z).toBeLessThan(0); // Left in standard frame
    expect(ballLate.velocity.z).toBeGreaterThan(0); // Right in standard frame
  });

  it('Test 7: One touch/click input cannot advance more than one swing state', () => {
    const meter = new SwingMeter();

    expect(meter.getState()).toBe('READY');
    expect(meter.getInputCount()).toBe(0);

    // First trigger call
    const s1 = meter.trigger();
    expect(s1).toBe('POWER_RUNNING');
    expect(meter.getState()).toBe('POWER_RUNNING');
    expect(meter.getInputCount()).toBe(1);

    // Calling trigger again produces exactly one next state
    const s2 = meter.trigger();
    expect(s2).toBe('ACCURACY_RUNNING');
    expect(meter.getState()).toBe('ACCURACY_RUNNING');
    expect(meter.getInputCount()).toBe(2);

    // Calling trigger again produces exactly one next state
    const s3 = meter.trigger();
    expect(s3).toBe('IMPACT');
    expect(meter.getState()).toBe('IMPACT');
    expect(meter.getInputCount()).toBe(3);

    // Further calls do not loop or advance beyond IMPACT / COMPLETE
    const s4 = meter.trigger();
    expect(s4).toBe('IMPACT');
    expect(meter.getInputCount()).toBe(3);
  });

  it('Test 8: Reaching 100% holds power and still requires separate Click 2 and Click 3 inputs', () => {
    const meter = new SwingMeter();

    meter.trigger(); // Click 1: start power
    meter.update(2); // Run well past the time needed to reach 100%

    expect(meter.getPowerValue()).toBe(1);
    expect(meter.getState()).toBe('POWER_RUNNING');
    expect(meter.getInputCount()).toBe(1);
    expect(meter.getResult()).toBeNull();

    meter.trigger(); // Click 2: explicitly lock 100% power
    expect(meter.getState()).toBe('ACCURACY_RUNNING');
    expect(meter.getInputCount()).toBe(2);
    expect(meter.getPowerValue()).toBe(1);
    expect(meter.getResult()).toBeNull();

    meter.update(1 / 1.5); // Let accuracy return to the centre
    meter.trigger(); // Click 3: explicitly lock accuracy

    expect(meter.getState()).toBe('IMPACT');
    expect(meter.getInputCount()).toBe(3);
    expect(meter.getResult()?.powerRatio).toBe(1);
    expect(meter.getResult()?.strikeQuality).toBe('PURE');
  });
});
