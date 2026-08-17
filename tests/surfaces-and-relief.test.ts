import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3 } from 'three';
import { HoleData, HoleConfig } from '../src/course/HoleData';
import {
  SURFACE_PROPERTIES,
  SURFACE_TYPES,
  SurfacePolygon,
  SurfaceQuery
} from '../src/course/SurfaceQuery';
import { TerrainData, TerrainMeta } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { PlaytestSurfaceGenerator } from '../src/debug/PlaytestSurfaceGenerator';
import { PenaltyRules } from '../src/golf/PenaltyRules';
import { BallPhysics } from '../src/physics/BallPhysics';

/**
 * R02 — course surfaces come from data, not engine code (§15, §17, §18)
 * R03 — out of bounds is real and every lie is recoverable (§14, §17, §18, §94)
 */

/** Square helper polygon centred on (cx, cz). */
function square(id: string, type: SurfacePolygon['type'], cx: number, cz: number, half: number): SurfacePolygon {
  return {
    id,
    type,
    name: id,
    points: [
      { x: cx - half, z: cz - half },
      { x: cx + half, z: cz - half },
      { x: cx + half, z: cz + half },
      { x: cx - half, z: cz + half }
    ]
  };
}

/** Flat synthetic terrain, 100 m x 100 m at 10 m spacing, so bounds are predictable. */
function flatTerrain(): TerrainData {
  const widthSamples = 11;
  const heightSamples = 11;
  const meta = {
    courseId: 'test',
    holeId: 'hole-test',
    widthSamples,
    heightSamples,
    gridSpacingMetres: 10,
    baseElevationMetres: 100,
    binary: { type: 'Float32', endianness: 'little', order: 'row-major' }
  } as unknown as TerrainMeta;

  return new TerrainData(meta, new Float32Array(widthSamples * heightSamples));
}

describe('R02 — Course surfaces are data, not code', () => {
  it('exposes every surface type named in blueprint §17', () => {
    expect(SURFACE_TYPES).toHaveLength(13);
    for (const type of SURFACE_TYPES) {
      expect(SURFACE_PROPERTIES[type]).toBeDefined();
      expect(SURFACE_PROPERTIES[type].type).toBe(type);
    }
    expect(SURFACE_TYPES).toContain('GROUND_UNDER_REPAIR');
    expect(SURFACE_TYPES).toContain('GENERAL_AREA');
  });

  it('reports GENERAL_AREA rather than claiming rough where no polygon is traced', () => {
    const query = new SurfaceQuery([]);
    expect(query.getLieAt(50, 50).type).toBe('GENERAL_AREA');
  });

  it('detects containment and returns the matching lie', () => {
    const query = new SurfaceQuery([square('fw', 'FAIRWAY', 50, 50, 20)]);

    expect(query.getLieAt(50, 50).type).toBe('FAIRWAY');
    expect(query.getLieAt(10, 50).type).toBe('GENERAL_AREA');
  });

  it('resolves overlapping features by ruling before playing surface', () => {
    // A bunker sitting inside the fairway, and OB overlapping both.
    const query = new SurfaceQuery([
      square('fw', 'FAIRWAY', 50, 50, 30),
      square('bunker', 'BUNKER', 50, 50, 10),
      square('ob', 'OUT_OF_BOUNDS', 50, 50, 3)
    ]);

    expect(query.getLieAt(50, 50).type).toBe('OUT_OF_BOUNDS'); // ruling wins
    expect(query.getLieAt(50, 58).type).toBe('BUNKER');        // bunker over fairway
    expect(query.getLieAt(50, 75).type).toBe('FAIRWAY');
  });

  it('flags provisional placeholder geometry so it can never pass as surveyed', () => {
    const generated = PlaytestSurfaceGenerator.generate({ x: 0, z: 0 }, { x: 200, z: 0 });

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((poly) => poly.provisional === true)).toBe(true);

    const query = new SurfaceQuery(generated);
    expect(query.hasProvisionalGeometry()).toBe(true);

    expect(new SurfaceQuery([square('fw', 'FAIRWAY', 0, 0, 5)]).hasProvisionalGeometry()).toBe(false);
  });
});

describe('R02 — Malformed course data is rejected, never silently accepted (§94)', () => {
  const hole = { courseId: 'warragul', holeId: 'hole-06' } as HoleConfig;
  const url = '/courses/warragul/hole-06/hole.json';

  it('accepts well-formed surfaces', () => {
    expect(() => HoleData.validateSurfaces([square('fw', 'FAIRWAY', 0, 0, 5)], hole, url)).not.toThrow();
  });

  it('rejects an unknown surface type and lists what was expected', () => {
    const bad = [{ id: 'x', type: 'LAVA', name: 'x', points: square('a', 'TEE', 0, 0, 1).points }];
    expect(() => HoleData.validateSurfaces(bad as never, hole, url))
      .toThrow(/unknown type "LAVA"/);
  });

  it('rejects a polygon with fewer than three points', () => {
    const bad: SurfacePolygon[] = [{ id: 'x', type: 'FAIRWAY', name: 'x', points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }];
    expect(() => HoleData.validateSurfaces(bad, hole, url)).toThrow(/at least 3 points/);
  });

  it('rejects non-finite coordinates', () => {
    const bad: SurfacePolygon[] = [{
      id: 'x',
      type: 'FAIRWAY',
      name: 'x',
      points: [{ x: 0, z: 0 }, { x: Number.NaN, z: 1 }, { x: 2, z: 2 }]
    }];
    expect(() => HoleData.validateSurfaces(bad, hole, url)).toThrow(/non-finite coordinates/);
  });

  it('rejects duplicate surface ids', () => {
    const bad = [square('dup', 'FAIRWAY', 0, 0, 5), square('dup', 'GREEN', 20, 20, 5)];
    expect(() => HoleData.validateSurfaces(bad, hole, url)).toThrow(/duplicate surface id "dup"/);
  });

  it('names the course and hole in the error', () => {
    const bad: SurfacePolygon[] = [{ id: 'x', type: 'FAIRWAY', name: 'x', points: [] }];
    expect(() => HoleData.validateSurfaces(bad, hole, url)).toThrow(/warragul\/hole-06/);
  });
});

describe('R03 — Out of bounds is real (§14)', () => {
  let terrainQuery: TerrainQuery;
  let ball: BallPhysics;

  beforeEach(() => {
    terrainQuery = new TerrainQuery(flatTerrain());
    ball = new BallPhysics(terrainQuery, new SurfaceQuery([]));
  });

  it('refuses to place the ball outside the terrain rather than clamping it', () => {
    expect(() => ball.setPosition(50, 50)).not.toThrow();
    expect(() => ball.setPosition(500, 50)).toThrow(/outside the loaded terrain extent/);
    expect(() => ball.setPosition(-5, 50)).toThrow(/outside the loaded terrain extent/);
  });

  it('stops the ball at the terrain edge instead of flying onto a phantom plane', () => {
    ball.setPosition(95, 50);
    // Fire hard toward +X, which runs out of terrain at x = 100.
    ball.velocity.set(60, 8, 0);
    ball.state = 'AIRBORNE';

    const cup = new Vector3(50, 0, 50);
    for (let i = 0; i < 200 && !ball.leftTerrain; i++) {
      ball.update(1 / 60, cup);
    }

    expect(ball.leftTerrain).toBe(true);
    expect(ball.state).toBe('REST');
    expect(ball.position.x).toBeLessThanOrEqual(100);
    expect(Number.isFinite(ball.position.y)).toBe(true);
    expect(ball.getCurrentLie().type).toBe('OUT_OF_BOUNDS');
  });

  it('never produces a zero-speed launch, whatever the lie', () => {
    const water = new SurfaceQuery([square('pond', 'WATER', 50, 50, 30)]);
    const wetBall = new BallPhysics(terrainQuery, water);
    wetBall.setPosition(50, 50);
    expect(wetBall.getCurrentLie().type).toBe('WATER');

    wetBall.launch(
      { id: 'i', name: '5 Iron', code: '5I', maxDistanceMetres: 170, loftDegrees: 24, isPutter: false },
      { powerRatio: 1, accuracyRatio: 0, isPerfect: true, hookSliceAngleDegrees: 0 },
      0
    );

    expect(wetBall.velocity.length()).toBeGreaterThan(0);
  });
});

describe('R03 — Every unplayable lie has a way back into play (§17, §18)', () => {
  const terrainQuery = new TerrainQuery(flatTerrain());

  it('leaves a playable lie alone', () => {
    const surfaces = new SurfaceQuery([square('fw', 'FAIRWAY', 50, 50, 30)]);
    const rules = new PenaltyRules(terrainQuery, surfaces);

    expect(rules.evaluate(SURFACE_PROPERTIES.FAIRWAY, { x: 50, z: 50 }, { x: 20, z: 50 }, false)).toBeNull();
  });

  it('applies stroke and distance when the ball leaves the mapped terrain', () => {
    const rules = new PenaltyRules(terrainQuery, new SurfaceQuery([]));
    const ruling = rules.evaluate(SURFACE_PROPERTIES.OUT_OF_BOUNDS, { x: 100, z: 50 }, { x: 30, z: 50 }, true);

    expect(ruling).not.toBeNull();
    expect(ruling!.penaltyStrokes).toBe(1);
    expect(ruling!.dropPosition).toEqual({ x: 30, z: 50 });
    expect(ruling!.headline).toBe('OUT OF BOUNDS');
  });

  it('drops out of water on the line of play for one stroke', () => {
    const surfaces = new SurfaceQuery([square('pond', 'WATER', 70, 50, 10)]);
    const rules = new PenaltyRules(terrainQuery, surfaces);

    const ruling = rules.evaluate(SURFACE_PROPERTIES.WATER, { x: 70, z: 50 }, { x: 20, z: 50 }, false);

    expect(ruling).not.toBeNull();
    expect(ruling!.relief).toBe('LATERAL_DROP');
    expect(ruling!.penaltyStrokes).toBe(1);

    // Drop must be clear of the water, and never nearer the target than the ball was.
    expect(surfaces.getLieAt(ruling!.dropPosition.x, ruling!.dropPosition.z).relief).toBe('NONE');
    expect(ruling!.dropPosition.x).toBeLessThan(70);
  });

  it('gives free relief from ground under repair with no penalty stroke', () => {
    const surfaces = new SurfaceQuery([square('gur', 'GROUND_UNDER_REPAIR', 70, 50, 8)]);
    const rules = new PenaltyRules(terrainQuery, surfaces);

    const ruling = rules.evaluate(SURFACE_PROPERTIES.GROUND_UNDER_REPAIR, { x: 70, z: 50 }, { x: 20, z: 50 }, false);

    expect(ruling).not.toBeNull();
    expect(ruling!.penaltyStrokes).toBe(0);
    expect(surfaces.getLieAt(ruling!.dropPosition.x, ruling!.dropPosition.z).relief).toBe('NONE');
  });

  it('falls back to stroke and distance when the whole line of play is unplayable', () => {
    // Water covering everything between the ball and the previous shot.
    const surfaces = new SurfaceQuery([square('pond', 'WATER', 50, 50, 49)]);
    const rules = new PenaltyRules(terrainQuery, surfaces);

    const ruling = rules.evaluate(SURFACE_PROPERTIES.WATER, { x: 60, z: 50 }, { x: 20, z: 50 }, false);

    expect(ruling).not.toBeNull();
    expect(ruling!.relief).toBe('STROKE_AND_DISTANCE');
    expect(ruling!.dropPosition).toEqual({ x: 20, z: 50 });
  });
});
