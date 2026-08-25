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

  return {
    state: putting.state,
    wasLipOut: putting.wasLipOut,
    finalPos: putting.position.clone(),
    distTraveled: putting.rollDistanceTraveled,
    time
  };
}

describe('Dedicated Putting Physics System (§29 Specification)', () => {
  it('1. Ball on flat green always eventually stops at rest', () => {
    const flat = createCustomTerrain(() => 10.0);
    const result = simulatePutt(flat, 50, 50, 80, 50, 5.0, 0);

    expect(result.state).toBe('REST');
    expect(result.time).toBeLessThan(10.0);
  });

  it('2. Same input travels consistently calibrated distances on flat green', () => {
    const flat = createCustomTerrain(() => 10.0);

    const r2m = simulatePutt(flat, 50, 50, 80, 50, 2.0, 0);
    const r5m = simulatePutt(flat, 50, 50, 80, 50, 5.0, 0);
    const r9m = simulatePutt(flat, 50, 50, 80, 50, 9.0, 0);
    const r15m = simulatePutt(flat, 50, 50, 80, 50, 15.0, 0);

    // Verify calibrated roll distances within 5%
    expect(r2m.distTraveled).toBeGreaterThan(1.85);
    expect(r2m.distTraveled).toBeLessThan(2.15);

    expect(r5m.distTraveled).toBeGreaterThan(4.75);
    expect(r5m.distTraveled).toBeLessThan(5.25);

    expect(r9m.distTraveled).toBeGreaterThan(8.55);
    expect(r9m.distTraveled).toBeLessThan(9.45);

    expect(r15m.distTraveled).toBeGreaterThan(14.25);
    expect(r15m.distTraveled).toBeLessThan(15.75);
  });

  it('3. Downhill putt travels farther than on flat terrain', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Downhill slope: dropping 0.025m per metre (1.43 degree slope)
    const downhill = createCustomTerrain((x) => 10.0 - (x - 50) * 0.025);

    const flatResult = simulatePutt(flat, 50, 50, 80, 50, 6.0, 0);
    const downhillResult = simulatePutt(downhill, 50, 50, 80, 50, 6.0, 0);

    expect(downhillResult.distTraveled).toBeGreaterThan(flatResult.distTraveled * 1.25);
  });

  it('4. Uphill putt travels shorter than on flat terrain', () => {
    const flat = createCustomTerrain(() => 10.0);
    // Uphill slope: rising 0.025m per metre
    const uphill = createCustomTerrain((x) => 10.0 + (x - 50) * 0.025);

    const flatResult = simulatePutt(flat, 50, 50, 80, 50, 6.0, 0);
    const uphillResult = simulatePutt(uphill, 50, 50, 80, 50, 6.0, 0);

    expect(uphillResult.distTraveled).toBeLessThan(flatResult.distTraveled * 0.85);
  });

  it('5. Side slope causes lateral physical break curvature', () => {
    // Slope sloping downward to +Z (normal.z > 0)
    const sideSlope = createCustomTerrain((x, z) => 10.0 - (z - 50) * 0.035);

    // Aim straight along +X (angle = 0)
    const result = simulatePutt(sideSlope, 50, 50, 80, 50, 6.0, 0);

    // Ball should have broken significantly to +Z
    const lateralDeflection = result.finalPos.z - 50;
    expect(lateralDeflection).toBeGreaterThan(0.40);
  });

  it('6. Stronger/firmer putt breaks less than slower putt over the same route', () => {
    const sideSlope = createCustomTerrain((x, z) => 10.0 - (z - 50) * 0.035);

    // Track lateral deflection at x = 53.0m (3m down the line)
    function trackDeflectionAtX(intendedDistance: number, targetX: number = 53.0) {
      const putting = new PuttingPhysics(sideSlope);
      putting.setPosition(50, 50);
      putting.launchPutt(intendedDistance, 0);
      const cup = new Vector3(80, 10, 50);
      const dt = 1 / 60;
      let latBreakAtTarget = 0;

      while (putting.state === 'ROLLING') {
        putting.update(dt, cup);
        if (putting.position.x >= targetX && latBreakAtTarget === 0) {
          latBreakAtTarget = Math.abs(putting.position.z - 50);
        }
      }
      return latBreakAtTarget;
    }

    const softBreak = trackDeflectionAtX(4.0, 53.0);
    const firmBreak = trackDeflectionAtX(8.0, 53.0);

    // Firm putt travels faster across the 3m distance and suffers significantly less lateral deflection
    expect(softBreak).toBeGreaterThan(firmBreak * 1.3);
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

    // Fast off-centre putt should lip out / deflect and continue past cup
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
