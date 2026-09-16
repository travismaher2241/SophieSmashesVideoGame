import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GOLF_CLUBS } from '../src/golf/Club';
import { SwingResult } from '../src/golf/SwingMeter';
import { BallPhysics } from '../src/physics/BallPhysics';
import { findTreeHit } from '../src/physics/TreeCollision';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery, SurfacePolygon } from '../src/course/SurfaceQuery';
import { treeObstacle, TreeObstacle, TREE_DIMENSIONS, TreeType } from '../src/course/TreeShapes';
import { FAIRWAY_SETBACK } from '../src/rendering/TreeRenderer';

const GROUND = 10;

function flatCourse() {
  const meta = {
    courseId: 'tree-test',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0,
    widthSamples: 800,
    heightSamples: 800,
    baseElevation: GROUND,
    elevationRangeMetres: 1,
    binary: { demFile: 't.bin', bytesPerSample: 2, sampleEncoding: 'UINT16' as const, expectedBytes: 1 }
  };
  const terrain = new TerrainQuery(
    new TerrainData(meta, new Float32Array(800 * 800).fill(GROUND), 799, 799)
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

/** A flushed shot down +X, with the given trees standing on the hole. */
function playShot(clubId: string, trees: TreeObstacle[], aimRadians = 0) {
  const { terrain, surfaces } = flatCourse();
  const ball = new BallPhysics(terrain, surfaces);
  ball.setTrees(trees);
  ball.setPosition(START_X, START_Z);
  ball.launch(GOLF_CLUBS.find((club) => club.id === clubId)!, FLUSH, aimRadians);

  const cup = new Vector3(START_X + 400, GROUND, START_Z);
  let elapsed = 0;
  while (ball.state !== 'REST' && elapsed < 40) {
    ball.update(1 / 60, cup);
    elapsed += 1 / 60;
  }

  return {
    distance: Math.hypot(ball.position.x - START_X, ball.position.z - START_Z),
    hit: ball.lastTreeHit,
    ball
  };
}

/** A gum tree standing on the line, the given distance down it. */
const gumAt = (down: number, across = 0): TreeObstacle =>
  treeObstacle({ x: START_X + down, z: START_Z + across, type: 'GUM_LARGE' }, GROUND);

describe('a ball meeting a tree', () => {
  it('flies the hole when nothing is in the way', () => {
    const clear = playShot('driver', []);

    expect(clear.hit).toBeNull();
    expect(clear.distance).toBeGreaterThan(200);
  });

  it('stops a drive that flies into a tree instead of passing through it', () => {
    const clear = playShot('driver', []);
    // A drive is back down around 8m by 215m out, which is branch height on a
    // gum tree: this is the landing-zone tree that a pushed drive finds.
    const blocked = playShot('driver', [gumAt(215)]);

    expect(blocked.hit?.part).toBe('CANOPY');
    expect(blocked.distance).toBeLessThan(clear.distance - 40);
  });

  it('drops the ball at the tree it hit rather than carrying on down the line', () => {
    const blocked = playShot('driver', [gumAt(215)]);

    // Branches take nearly everything, so the ball comes down at the tree.
    expect(blocked.distance).toBeGreaterThan(205);
    expect(blocked.distance).toBeLessThan(225);
  });

  it('flies a drive over a tree it is above', () => {
    // A driver is at its apex around 120m out, well over a gum tree. Standing
    // one there must not stop it: this is the shot that carries the treeline.
    const overTheTop = playShot('driver', [gumAt(120)]);

    expect(overTheTop.hit).toBeNull();
    expect(overTheTop.distance).toBeGreaterThan(250);
  });

  it('ignores a tree standing off the line of the shot', () => {
    const wide = playShot('driver', [gumAt(215, 40)]);

    expect(wide.hit).toBeNull();
    expect(wide.distance).toBeGreaterThan(250);
  });

  it('kicks a ball back off a trunk, even behind where it was struck from', () => {
    // 18m out a drive is still only three metres up — under the branches and
    // into the trunk. That comes back past you, which is what it does in life.
    const trunkStrike = playShot('driver', [gumAt(18)]);

    expect(trunkStrike.hit?.part).toBe('TRUNK');
    expect(trunkStrike.ball.position.x).toBeLessThan(START_X);
  });

  it('leaves a ball resting under a canopy playable', () => {
    // Dropped inside the canopy's footprint, a ball has to be able to be struck
    // out of there. Treating "inside a tree" as a collision would stop the shot
    // the instant it started, for ever.
    const { terrain, surfaces } = flatCourse();
    const ball = new BallPhysics(terrain, surfaces);
    ball.setTrees([treeObstacle({ x: START_X, z: START_Z, type: 'GUM_LARGE' }, GROUND)]);
    ball.setPosition(START_X, START_Z);
    ball.launch(GOLF_CLUBS.find((club) => club.id === '9iron')!, FLUSH, 0);

    const cup = new Vector3(START_X + 400, GROUND, START_Z);
    let elapsed = 0;
    while (ball.state !== 'REST' && elapsed < 40) {
      ball.update(1 / 60, cup);
      elapsed += 1 / 60;
    }

    expect(ball.position.x - START_X).toBeGreaterThan(20);
  });

  it('stops a ball rolling into a trunk', () => {
    const { terrain, surfaces } = flatCourse();
    const ball = new BallPhysics(terrain, surfaces);
    ball.setTrees([gumAt(12)]);
    ball.setPosition(START_X, START_Z);
    ball.launch(GOLF_CLUBS.find((club) => club.id === 'putter')!, { ...FLUSH, powerRatio: 1 }, 0);

    const cup = new Vector3(START_X + 400, GROUND, START_Z);
    let elapsed = 0;
    while (ball.state !== 'REST' && elapsed < 40) {
      ball.update(1 / 60, cup);
      elapsed += 1 / 60;
    }

    expect(ball.lastTreeHit).not.toBeNull();
    expect(ball.position.x - START_X).toBeLessThan(13);
  });
});

describe('sweeping the step against a tree', () => {
  const tree = treeObstacle({ x: 100, z: 100, type: 'GUM_LARGE' }, 0);

  it('catches a tree the ball would pass clean through in one frame', () => {
    // A driver covers about four metres per frame — further than a gum tree is
    // thick. Testing the endpoints instead of the step would miss this.
    const hit = findTreeHit(94, 8, 100, 106, 8, 100, [tree]);

    expect(hit).not.toBeNull();
    expect(hit!.part).toBe('CANOPY');
    // Caught on the way in, not on the far side.
    expect(hit!.x).toBeLessThan(100);
  });

  it('reports which way the ball came in, so it can be thrown back out', () => {
    const hit = findTreeHit(94, 8, 100, 106, 8, 100, [tree])!;

    expect(hit.normalX).toBeCloseTo(-1, 3);
    expect(hit.normalZ).toBeCloseTo(0, 3);
  });

  it('lets a low ball under the canopy and stops it at the trunk', () => {
    const underneath = findTreeHit(94, 1.2, 103, 106, 1.2, 103, [tree]);
    const atTheTrunk = findTreeHit(94, 1.2, 100, 106, 1.2, 100, [tree]);

    expect(underneath).toBeNull();
    expect(atTheTrunk?.part).toBe('TRUNK');
  });

  it('never starts a collision from inside the tree', () => {
    expect(findTreeHit(100, 6, 100, 104, 6, 101, [tree])).toBeNull();
  });
});

describe('trees as obstacles against where they are planted', () => {
  it('keeps every canopy narrower than the gap trees are planted off the fairway', () => {
    // Trees are placed a set distance clear of the mown grass. If a canopy were
    // wider than that gap, a ball in the middle of the fairway could be under
    // branches that are not drawn anywhere near it.
    for (const type of Object.keys(TREE_DIMENSIONS) as TreeType[]) {
      const tree = treeObstacle({ x: 0, z: 0, type }, 0);
      expect(tree.canopyRadius).toBeLessThan(FAIRWAY_SETBACK);
    }
  });

  it('gives every tree a canopy wider than its trunk, and a trunk under it', () => {
    for (const type of Object.keys(TREE_DIMENSIONS) as TreeType[]) {
      const tree = treeObstacle({ x: 0, z: 0, type }, 0);

      expect(tree.canopyRadius).toBeGreaterThanOrEqual(tree.trunkRadius);
      expect(tree.canopyBottomY).toBeLessThan(tree.topY);
      expect(tree.canopyBottomY).toBeGreaterThanOrEqual(tree.baseY);
    }
  });

  it('scales a tree shape with the size it is drawn at', () => {
    const normal = treeObstacle({ x: 0, z: 0, type: 'GUM_LARGE' }, 0);
    const big = treeObstacle({ x: 0, z: 0, type: 'GUM_LARGE', scale: 1.5 }, 0);

    expect(big.canopyRadius).toBeCloseTo(normal.canopyRadius * 1.5, 6);
    expect(big.topY).toBeCloseTo(normal.topY * 1.5, 6);
  });
});
