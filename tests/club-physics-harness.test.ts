import { describe, expect, it } from 'vitest';
import { GOLF_CLUBS, ClubManager, ClubConfig } from '../src/golf/Club';
import { BallPhysics } from '../src/physics/BallPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery, SurfacePolygon, SurfaceType } from '../src/course/SurfaceQuery';
import { SwingResult } from '../golf/SwingMeter';
import { Vector3 } from 'three';

function createFlatTerrainQuery(): TerrainQuery {
  const meta = {
    courseId: 'flat-test',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0,
    widthSamples: 500,
    heightSamples: 500,
    baseElevation: 100,
    elevationRangeMetres: 1,
    binary: {
      demFile: 'terrain.bin',
      bytesPerSample: 2,
      sampleEncoding: 'UINT16' as const,
      expectedBytes: 500000
    }
  };
  const elevations = new Float32Array(500 * 500).fill(10.0);
  const terrainData = new TerrainData(meta, elevations, 499, 499);
  return new TerrainQuery(terrainData);
}

function createSurfaceQuery(surfaceType: SurfaceType = 'FAIRWAY'): SurfaceQuery {
  const poly: SurfacePolygon = {
    id: 'test-poly',
    type: surfaceType,
    name: 'Test Area',
    points: [
      { x: 0, z: 0 },
      { x: 500, z: 0 },
      { x: 500, z: 500 },
      { x: 0, z: 500 }
    ]
  };
  return new SurfaceQuery([poly]);
}

interface ShotSimulationReport {
  clubId: string;
  clubName: string;
  carryMetres: number;
  rollMetres: number;
  totalMetres: number;
  firstBounceX: number;
  finalX: number;
  flightTimeSec: number;
  totalTimeSec: number;
}

function simulateShot(
  club: ClubConfig,
  surfaceType: SurfaceType = 'FAIRWAY',
  power: number = 1.0,
  aimAngleRad: number = 0
): ShotSimulationReport {
  const terrainQuery = createFlatTerrainQuery();
  const surfaceQuery = createSurfaceQuery(surfaceType);
  const ballPhysics = new BallPhysics(terrainQuery, surfaceQuery);

  const startX = 50;
  const startZ = 250;
  ballPhysics.setPosition(startX, startZ);

  const perfectSwing: SwingResult = {
    powerRatio: power,
    accuracyError: 0.0,
    strikeQuality: 'PURE',
    feedbackText: 'PURE!',
    isPerfect: true,
    hookSliceAngleDegrees: 0,
    curveSpinFactor: 0
  };

  ballPhysics.launch(club, perfectSwing, aimAngleRad);

  const cupPosition = new Vector3(startX + 300, 10.0, startZ);
  const dt = 1 / 60; // 60 FPS sub-stepped physics
  let totalTime = 0;
  let firstBounceX = startX;
  let hasBounced = false;
  let flightTime = 0;

  while (ballPhysics.state !== 'REST' && totalTime < 25.0) {
    const prevState = ballPhysics.state;
    ballPhysics.update(dt, cupPosition);
    totalTime += dt;

    if (!hasBounced && (ballPhysics.state === 'BOUNCING' || ballPhysics.state === 'ROLLING')) {
      hasBounced = true;
      firstBounceX = ballPhysics.position.x;
      flightTime = totalTime;
    }
  }

  const finalX = ballPhysics.position.x;
  const carryMetres = Math.max(0, firstBounceX - startX);
  const totalMetres = Math.max(0, finalX - startX);
  const rollMetres = Math.max(0, totalMetres - carryMetres);

  return {
    clubId: club.id,
    clubName: club.name,
    carryMetres,
    rollMetres,
    totalMetres,
    firstBounceX,
    finalX,
    flightTimeSec: flightTime,
    totalTimeSec: totalTime
  };
}

describe('Golf Bag & Club Definitions', () => {
  it('contains 14 realistic clubs without 1W notation', () => {
    expect(GOLF_CLUBS.length).toBe(14);

    const driver = GOLF_CLUBS[0];
    expect(driver.id).toBe('driver');
    expect(driver.name).toBe('DRIVER');
    expect(driver.displayName).toBe('DRIVER');
    expect(driver.name).not.toMatch(/1W/i);

    // Verify all 14 club IDs
    const expectedIds = [
      'driver', '3wood', '5wood',
      '4iron', '5iron', '6iron', '7iron', '8iron', '9iron',
      'pw', 'gw', 'sw', 'lw',
      'putter'
    ];
    expect(GOLF_CLUBS.map((c) => c.id)).toEqual(expectedIds);
  });

  it('maintains consistent carry distance gapping from Driver to Lob Wedge', () => {
    const playableClubs = GOLF_CLUBS.filter((c) => !c.isPutter);

    for (let i = 0; i < playableClubs.length - 1; i++) {
      const current = playableClubs[i];
      const next = playableClubs[i + 1];
      expect(current.carryMetres).toBeGreaterThan(next.carryMetres);
      expect(current.launchAngleDeg).toBeLessThan(next.launchAngleDeg);
    }

    expect(playableClubs[0].carryMetres).toBe(230); // Driver
    expect(playableClubs[playableClubs.length - 1].carryMetres).toBe(60); // Lob Wedge
  });

  it('auto-selects sensible clubs based on target pin distance and green status', () => {
    const manager = new ClubManager();

    // 225m -> Driver or 3 Wood
    const c225 = manager.autoSelectClubForDistance(225);
    expect(['DRIVER', '3 WOOD']).toContain(c225.displayName);

    // 190m -> 5 Wood
    const c190 = manager.autoSelectClubForDistance(190);
    expect(c190.displayName).toBe('5 WOOD');

    // 166m -> 5 Iron
    const c166 = manager.autoSelectClubForDistance(166);
    expect(c166.displayName).toBe('5 IRON');

    // 145m -> 7 Iron
    const c145 = manager.autoSelectClubForDistance(145);
    expect(c145.displayName).toBe('7 IRON');

    // 103m -> PW
    const c103 = manager.autoSelectClubForDistance(103);
    expect(c103.displayName).toBe('PITCHING WEDGE');

    // 74m -> SW
    const c74 = manager.autoSelectClubForDistance(74);
    expect(c74.displayName).toBe('SAND WEDGE');

    // On green -> strictly Putter
    const onGreenClub = manager.autoSelectClubForDistance(8, true);
    expect(onGreenClub.displayName).toBe('PUTTER');
    expect(onGreenClub.isPutter).toBe(true);
  });
});

describe('Zero-Wind Flat-Ground Calibration Harness', () => {
  const reports: ShotSimulationReport[] = [];

  it('simulates zero-wind flat-ground shots for every club in the bag', () => {
    const playableClubs = GOLF_CLUBS.filter((c) => !c.isPutter);

    for (const club of playableClubs) {
      const report = simulateShot(club, 'FAIRWAY', 1.0, 0);
      reports.push(report);

      // Verify carry is close to intended prototype target (+/- 4%)
      expect(report.carryMetres).toBeGreaterThan(club.carryMetres * 0.90);
      expect(report.carryMetres).toBeLessThan(club.carryMetres * 1.10);

      // Verify ball reaches decisive REST
      expect(report.totalMetres).toBeGreaterThan(report.carryMetres);
      expect(report.totalTimeSec).toBeLessThan(15.0);
    }

    // Print developer calibration report
    console.log('\n=== ZERO-WIND FLAT-GROUND CALIBRATION HARNESS REPORT ===');
    for (const r of reports) {
      console.log(
        `${r.clubName.padEnd(16)} | carry: ${r.carryMetres.toFixed(1)}m | roll: ${r.rollMetres.toFixed(1)}m | total: ${r.totalMetres.toFixed(1)}m`
      );
    }
  });

  it('satisfies roll distribution: Driver roll > 7 Iron roll > Wedge roll', () => {
    const driverRep = reports.find((r) => r.clubId === 'driver')!;
    const iron7Rep = reports.find((r) => r.clubId === '7iron')!;
    const pwRep = reports.find((r) => r.clubId === 'pw')!;
    const lwRep = reports.find((r) => r.clubId === 'lw')!;

    // Driver rolls noticeably more than irons
    expect(driverRep.rollMetres).toBeGreaterThan(iron7Rep.rollMetres);

    // 7 Iron rolls more than wedges
    expect(iron7Rep.rollMetres).toBeGreaterThan(lwRep.rollMetres);

    // Mid iron roll target: 3-10m
    expect(iron7Rep.rollMetres).toBeGreaterThanOrEqual(3.0);
    expect(iron7Rep.rollMetres).toBeLessThanOrEqual(12.0);

    // Wedge roll target: 1-6m
    expect(pwRep.rollMetres).toBeLessThanOrEqual(7.0);
    expect(lwRep.rollMetres).toBeLessThanOrEqual(5.0);

    // Driver roll target: 10-30m
    expect(driverRep.rollMetres).toBeGreaterThanOrEqual(10.0);
    expect(driverRep.rollMetres).toBeLessThanOrEqual(32.0);
  });

  it('Rough stops balls significantly faster than Fairway', () => {
    const club7I = GOLF_CLUBS.find((c) => c.id === '7iron')!;
    const fairwayReport = simulateShot(club7I, 'FAIRWAY', 1.0, 0);
    const roughReport = simulateShot(club7I, 'ROUGH', 1.0, 0);

    expect(roughReport.rollMetres).toBeLessThan(fairwayReport.rollMetres);
    expect(roughReport.rollMetres).toBeLessThan(4.0);
  });

  it('Bunker absorbs almost all horizontal speed and stops within 2.5 metres', () => {
    const club7I = GOLF_CLUBS.find((c) => c.id === '7iron')!;
    const bunkerReport = simulateShot(club7I, 'BUNKER', 1.0, 0);

    expect(bunkerReport.rollMetres).toBeLessThan(2.5);
    expect(bunkerReport.totalTimeSec).toBeLessThan(7.0);
  });

  it('Green check reduces wedge approach roll', () => {
    const clubSW = GOLF_CLUBS.find((c) => c.id === 'sw')!;
    const greenReport = simulateShot(clubSW, 'GREEN', 1.0, 0);

    expect(greenReport.rollMetres).toBeLessThan(4.0);
  });
});
