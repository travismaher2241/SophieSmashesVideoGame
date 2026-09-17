import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GOLF_CLUBS } from '../src/golf/Club';
import { SwingResult } from '../src/golf/SwingMeter';
import { BallPhysics } from '../src/physics/BallPhysics';
import { deflectOffTree, findTreeHit, outcomeWeights, TreeHit } from '../src/physics/TreeCollision';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { SurfaceQuery, SurfacePolygon } from '../src/course/SurfaceQuery';
import { treeObstacle, TreeObstacle, TREE_DIMENSIONS, TreeType } from '../src/course/TreeShapes';
import { describeTreeHit } from '../src/game/Game';
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

/**
 * A repeatable source of luck.
 *
 * What a tree does with a ball is drawn, so a test that wants the same shot
 * twice has to bring its own dice. mulberry32, for a short deterministic stream.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dice that force one outcome, then behave normally.
 *
 * The draw asks for the outcome first and the angles and speed after, so only
 * the first number has to be steered.
 */
function scripted(outcome: 'THROUGH' | 'DROP' | 'KICK' | 'BACK'): () => number {
  const first = { THROUGH: 0.01, DROP: 0.5, KICK: 0.75, BACK: 0.99 }[outcome];
  const rest = seeded(7);
  let called = 0;
  return () => (called++ === 0 ? first : rest());
}

/** A flushed shot down +X, with the given trees standing on the hole. */
function playShot(clubId: string, trees: TreeObstacle[], aimRadians = 0, random = seeded(1)) {
  const { terrain, surfaces } = flatCourse();
  const ball = new BallPhysics(terrain, surfaces);
  ball.setTrees(trees);
  ball.setRandomSource(random);
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
    along: ball.position.x - START_X,
    across: ball.position.z - START_Z,
    hit: ball.lastTreeHit,
    outcome: ball.lastTreeOutcome,
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

  it('drops the ball at the tree when the branches take everything', () => {
    // A draw that comes up DROP: the ball falls out of the bottom of the tree.
    const blocked = playShot('driver', [gumAt(215)], 0, scripted('DROP'));

    expect(blocked.outcome).toBe('DROP');
    expect(blocked.distance).toBeGreaterThan(205);
    expect(blocked.distance).toBeLessThan(225);
  });

  it('carries the ball on past the tree when it rattles through', () => {
    const through = playShot('driver', [gumAt(215)], 0, scripted('THROUGH'));

    expect(through.outcome).toBe('THROUGH');
    // Short of where it was going, but past the tree rather than under it.
    expect(through.along).toBeGreaterThan(220);
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
    // into the trunk. Coming straight back past you is what that does in life.
    const trunkStrike = playShot('driver', [gumAt(18)], 0, scripted('BACK'));

    expect(trunkStrike.hit?.part).toBe('TRUNK');
    expect(trunkStrike.outcome).toBe('BACK');
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

describe('what a tree does with a ball', () => {
  /** Where 200 identical drives into the same tree end up. */
  function manyShots(acrossOffset: number, runs = 120) {
    return Array.from({ length: runs }, (_, seed) =>
      playShot('driver', [gumAt(215, acrossOffset)], 0, seeded(seed + 1))
    ).filter((shot) => shot.outcome);
  }

  function tally(shots: ReturnType<typeof manyShots>) {
    const counts: Record<string, number> = { THROUGH: 0, DROP: 0, KICK: 0, BACK: 0 };
    for (const shot of shots) counts[shot.outcome!]++;
    return counts;
  }

  it('does not do the same thing twice', () => {
    // The whole point. A tree that always dropped the ball straight down was
    // the one part of the hole you could plan around.
    const shots = manyShots(0);
    const outcomes = new Set(shots.map((shot) => shot.outcome));

    expect(outcomes.size).toBeGreaterThan(2);
  });

  it('sends the same shot to genuinely different places', () => {
    const shots = manyShots(0);
    const along = shots.map((shot) => shot.along);
    const across = shots.map((shot) => shot.across);

    // Tens of metres apart, not a jitter: back towards the player, on past the
    // tree, or off to one side.
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(30);
    expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(20);
  });

  it('mostly kills a ball that goes through the middle of the tree', () => {
    const counts = tally(manyShots(0));

    expect(counts.DROP).toBeGreaterThan(counts.THROUGH * 3);
  });

  it('mostly lets a ball through that only clips the edge', () => {
    // 1.7m off the axis of a canopy with a 1.9m radius: a glancing blow.
    const counts = tally(manyShots(1.7));

    expect(counts.THROUGH).toBeGreaterThan(counts.DROP);
  });

  it('can put the ball back in play, and can put it further out', () => {
    // A kick is a kick: sometimes it is the break you needed.
    const shots = manyShots(0);
    const leftOfTheLine = shots.filter((shot) => shot.across < -3).length;
    const rightOfTheLine = shots.filter((shot) => shot.across > 3).length;

    expect(leftOfTheLine).toBeGreaterThan(5);
    expect(rightOfTheLine).toBeGreaterThan(5);
  });

  it('only counts one pass through a tree, however it rattles', () => {
    // Left to itself the ball pinballs inside the same canopy — two and a half
    // contacts on average, up to six — and each one draws again, which washes
    // out any relationship between how you hit the tree and what happens next.
    const { terrain, surfaces } = flatCourse();
    const ball = new BallPhysics(terrain, surfaces);
    ball.setTrees([gumAt(215)]);
    ball.setRandomSource(seeded(3));
    ball.setPosition(START_X, START_Z);
    ball.launch(GOLF_CLUBS.find((club) => club.id === 'driver')!, FLUSH, 0);

    const cup = new Vector3(START_X + 400, GROUND, START_Z);
    let contacts = 0;
    let last: unknown = null;
    let elapsed = 0;
    while (ball.state !== 'REST' && elapsed < 40) {
      ball.update(1 / 60, cup);
      elapsed += 1 / 60;
      if (ball.lastTreeHit && ball.lastTreeHit !== last) {
        last = ball.lastTreeHit;
        contacts++;
      }
    }

    expect(contacts).toBeLessThanOrEqual(2);
  });
});

describe('the odds a tree deflection is drawn from', () => {
  const canopyHit = (impactParameter: number): TreeHit => ({
    t: 0.5,
    part: 'CANOPY',
    tree: gumAt(0),
    impactParameter,
    x: 0,
    y: 8,
    z: 0,
    normalX: -1,
    normalZ: 0
  });

  it('never offers a negative chance, and always offers some chance', () => {
    for (const part of ['CANOPY', 'TRUNK'] as const) {
      for (const ip of [0, 0.25, 0.5, 0.75, 1]) {
        const weights = outcomeWeights(part, ip);
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

        expect(Math.min(...Object.values(weights))).toBeGreaterThanOrEqual(0);
        expect(total).toBeGreaterThan(0);
      }
    }
  });

  it('never lets a ball through a trunk', () => {
    // Wood is wood. The question off a trunk is only how it comes back.
    for (const ip of [0, 0.5, 1]) {
      expect(outcomeWeights('TRUNK', ip).THROUGH).toBe(0);
    }
  });

  it('shifts from dying to carrying on as the blow gets more glancing', () => {
    const square = outcomeWeights('CANOPY', 0);
    const glancing = outcomeWeights('CANOPY', 1);

    expect(glancing.THROUGH).toBeGreaterThan(square.THROUGH);
    expect(glancing.DROP).toBeLessThan(square.DROP);
  });

  it('leaves the ball with more pace when it goes through than when it drops', () => {
    const through = deflectOffTree(canopyHit(0.9), 30, 0, scripted('THROUGH'));
    const drop = deflectOffTree(canopyHit(0), 30, 0, scripted('DROP'));

    expect(through.speedKept).toBeGreaterThan(drop.speedKept * 2);
  });

  it('turns a ball that comes back most of the way round', () => {
    const back = deflectOffTree(canopyHit(0), 30, 0, scripted('BACK'));

    // Travelling down +X before; heading back towards -X after.
    expect(back.directionX).toBeLessThan(0);
  });

  it('hands out a unit direction whatever it decides', () => {
    for (const outcome of ['THROUGH', 'DROP', 'KICK', 'BACK'] as const) {
      const deflection = deflectOffTree(canopyHit(0.5), 24, 7, scripted(outcome));
      const length = Math.hypot(deflection.directionX, deflection.directionZ);

      expect(length, outcome).toBeCloseTo(1, 6);
    }
  });
});

describe('telling the player what the tree did', () => {
  it('says something different for each thing a tree can do', () => {
    const messages = (['THROUGH', 'DROP', 'KICK', 'BACK'] as const).map((outcome) =>
      describeTreeHit('CANOPY', outcome)
    );

    expect(new Set(messages).size).toBe(4);
  });

  it('knows a trunk from a branch when the ball comes back', () => {
    expect(describeTreeHit('TRUNK', 'BACK')).toContain('trunk');
    expect(describeTreeHit('CANOPY', 'BACK')).toContain('limb');
  });

  it('still says something when there was no draw to report', () => {
    // A ball that rolled into a trunk has a hit but no outcome.
    expect(describeTreeHit('TRUNK', null).length).toBeGreaterThan(0);
    expect(describeTreeHit('CANOPY', null).length).toBeGreaterThan(0);
  });
});
