import { describe, expect, it } from 'vitest';
import { PuttingPhysics, GREEN_SPEEDS } from '../src/physics/PuttingPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { Vector3 } from 'three';

function createCustomTerrain(elevationFn: (x: number, z: number) => number): TerrainQuery {
  const meta = {
    courseId: 'putting-test',
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

  const elevations = new Float32Array(200 * 200);
  for (let z = 0; z < 200; z++) {
    for (let x = 0; x < 200; x++) {
      elevations[z * 200 + x] = elevationFn(x, z);
    }
  }

  const terrainData = new TerrainData(meta, elevations, 199, 199);
  return new TerrainQuery(terrainData);
}

function simulatePutt(
  terrainQuery: TerrainQuery,
  startX: number,
  startZ: number,
  cupX: number,
  cupZ: number,
  intendedDistance: number,
  aimAngleRad: number = 0
) {
  const putting = new PuttingPhysics(terrainQuery);
  putting.setPosition(startX, startZ);
  putting.launchPutt(intendedDistance, aimAngleRad);

  const cupPosition = new Vector3(cupX, terrainQuery.getTerrainHeight(cupX, cupZ, true), cupZ);
  const dt = 1 / 60;
  let time = 0;

  while (putting.state === 'ROLLING' && time < 15.0) {
    putting.update(dt, cupPosition);
    time += dt;
  }

  const finalDistToCup = Math.hypot(putting.position.x - cupX, putting.position.z - cupZ);

  return {
    state: putting.state,
    wasLipOut: putting.wasLipOut,
    finalPos: putting.position.clone(),
    distTraveled: putting.rollDistanceTraveled,
    finalDistToCup,
    time
  };
}

describe('Dedicated Putting Physics System (§29 Specification & Calibration)', () => {
  it('1. Ball on flat green always eventually stops at rest', () => {
    const flat = createCustomTerrain(() => 10.0);
    const result = simulatePutt(flat, 50, 50, 80, 50, 5.0, 0);

    expect(result.state).toBe('REST');
    expect(result.time).toBeLessThan(10.0);
  });

  it('2. Selected pace translates linearly and accurately to flat roll distance (1m, 2m, 3m, 5m, 10m, 10.1m, 11.8m, 13m, 15m)', () => {
    const flat = createCustomTerrain(() => 10.0);
    const paces = [1.0, 2.0, 3.0, 5.0, 10.0, 10.1, 11.8, 13.0, 15.0];

    for (const pace of paces) {
      // Place cup far away to measure uninterrupted natural resting distance
      const res = simulatePutt(flat, 50, 50, 120, 50, pace, 0);
      expect(res.state).toBe('REST');
      expect(res.distTraveled).toBeGreaterThan(pace * 0.97);
      expect(res.distTraveled).toBeLessThan(pace * 1.03);
    }
  });

  it('3. User Acceptance Regression: 11.8m putt with 10.1m pace finishes ~1.7m short of cup', () => {
    const flat = createCustomTerrain(() => 10.0);
    const startX = 50.0;
    const cupX = 61.8; // Exactly 11.8m to cup

    // Test 10.1m pace on 11.8m putt:
    const res10_1 = simulatePutt(flat, startX, 50, cupX, 50, 10.1, 0);
    expect(res10_1.state).toBe('REST');
    expect(res10_1.finalPos.x).toBeLessThan(cupX); // Did NOT pass hole or roll off
    expect(res10_1.finalDistToCup).toBeGreaterThan(1.60);
    expect(res10_1.finalDistToCup).toBeLessThan(1.80);
    expect(res10_1.distTraveled).toBeCloseTo(10.1, 1);

    // Test 11.8m pace on 11.8m putt:
    const res11_8 = simulatePutt(flat, startX, 50, cupX, 50, 11.8, 0);
    expect(['HOLED', 'REST']).toContain(res11_8.state);
    if (res11_8.state === 'REST') {
      expect(res11_8.finalDistToCup).toBeLessThan(0.20);
    }

    // Test 13.0m pace on 11.8m line that misses cup by 0.15m:
    const res13_0 = simulatePutt(flat, startX, 50, cupX, 50.15, 13.0, 0);
    expect(res13_0.state).toBe('REST');
    expect(res13_0.finalPos.x).toBeGreaterThan(cupX);
    // Rolled ~1.2m past the cup line
    const pastHoleDist = res13_0.finalPos.x - cupX;
    expect(pastHoleDist).toBeGreaterThan(1.05);
    expect(pastHoleDist).toBeLessThan(1.35);
  });

  it('4. Downhill putt travels farther with natural, controlled scaling', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Downhill slope: dropping 0.025m per metre (1.43 degree slope)
    const downhill = createCustomTerrain((x) => 10.0 - (x - 50) * 0.025);

    const flatResult = simulatePutt(flat, 50, 50, 120, 50, 6.0, 0);
    const downhillResult = simulatePutt(downhill, 50, 50, 120, 50, 6.0, 0);

    expect(downhillResult.distTraveled).toBeGreaterThan(flatResult.distTraveled * 1.05);
    expect(downhillResult.distTraveled).toBeLessThan(flatResult.distTraveled * 1.35);
    expect(downhillResult.state).toBe('REST');
  });

  it('5. Uphill putt travels shorter than on flat terrain', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Uphill slope: rising 0.025m per metre
    const uphill = createCustomTerrain((x) => 10.0 + (x - 50) * 0.025);

    const flatResult = simulatePutt(flat, 50, 50, 120, 50, 6.0, 0);
    const uphillResult = simulatePutt(uphill, 50, 50, 120, 50, 6.0, 0);

    expect(uphillResult.distTraveled).toBeLessThan(flatResult.distTraveled * 0.95);
    expect(uphillResult.distTraveled).toBeGreaterThan(flatResult.distTraveled * 0.70);
    expect(uphillResult.state).toBe('REST');
  });

  it('6. Side slope causes lateral physical break curvature', () => {
    // Slope sloping downward to +Z (normal.z > 0)
    const sideSlope = createCustomTerrain((x, z) => 10.0 - (z - 50) * 0.035);

    // Aim straight along +X (angle = 0)
    const result = simulatePutt(sideSlope, 50, 50, 120, 50, 6.0, 0);

    // Ball should have broken to +Z
    const lateralDeflection = result.finalPos.z - 50;
    expect(lateralDeflection).toBeGreaterThan(0.08);
  });

  it('7. Ball outside 108mm cup capture radius does not hole', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Putt aimed 0.35m off to the side of cup at 5m
    const result = simulatePutt(flat, 50, 50, 55.0, 50.35, 5.0, 0);

    expect(result.state).toBe('REST');
    expect(result.state).not.toBe('HOLED');
  });

  it('8. Fast edge putt lips out and deflects rather than magnetically dropping', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Aimed slightly off-centre (0.04m near 0.054m rim) with aggressive fast speed (8m pace for 4m putt)
    const result = simulatePutt(flat, 50, 50, 54.0, 50.042, 8.0, 0);

    expect(result.state).toBe('REST');
    expect(result.wasLipOut).toBe(true);
    expect(result.finalPos.x).toBeGreaterThan(54.0);
  });

  it('9. Centred sensible-speed putt drops into the cup and records HOLED', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Aimed directly at cup (distance 4.0m, pace 4.2m)
    const result = simulatePutt(flat, 50, 50, 54.0, 50.0, 4.2, 0);

    expect(result.state).toBe('HOLED');
    expect(result.finalPos.x).toBeCloseTo(54.0, 1);
    expect(result.finalPos.z).toBeCloseTo(50.0, 1);
  });
});
