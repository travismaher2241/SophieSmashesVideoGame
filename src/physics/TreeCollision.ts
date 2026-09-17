import { TreeObstacle } from '../course/TreeShapes';

export type TreeHitPart = 'CANOPY' | 'TRUNK';

export interface TreeHit {
  /** Where along the step the ball met the tree, 0 to 1. */
  t: number;
  part: TreeHitPart;
  tree: TreeObstacle;
  /**
   * How squarely the ball went at the tree: 0 straight through the middle, 1 a
   * tangent off the very edge.
   *
   * This is what decides the odds afterwards. A ball through the heart of a gum
   * tree is going almost nowhere; one clipping the outside is as likely as not
   * to carry on through with most of its line intact.
   */
  impactParameter: number;
  /** The impact point. */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit vector from the trunk axis out to the impact point. */
  normalX: number;
  normalZ: number;
}

/**
 * Where a step of the ball's flight first meets a tree, if it does.
 *
 * The ball is swept along the step rather than tested at its endpoints: at
 * driver speed it covers four metres in a frame, which is most of the way
 * through a gum tree. Testing positions would let it teleport past trunks, and
 * would make whether a tree exists depend on the frame rate.
 */
export function findTreeHit(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  trees: readonly TreeObstacle[],
  ignore: TreeObstacle | null = null
): TreeHit | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;

  let best: TreeHit | null = null;

  for (const tree of trees) {
    if (tree === ignore) continue;

    // Cheap reject: the step's bounding box against the canopy's.
    const reach = tree.canopyRadius;
    if (Math.min(fromX, toX) > tree.x + reach || Math.max(fromX, toX) < tree.x - reach) continue;
    if (Math.min(fromZ, toZ) > tree.z + reach || Math.max(fromZ, toZ) < tree.z - reach) continue;
    if (Math.min(fromY, toY) > tree.topY || Math.max(fromY, toY) < tree.baseY) continue;

    const canopy = entryTime(fromX, fromZ, dx, dz, tree.x, tree.z, tree.canopyRadius);
    if (canopy !== null) {
      const y = fromY + dy * canopy;
      if (y >= tree.canopyBottomY && y <= tree.topY && (!best || canopy < best.t)) {
        best = makeHit(
          canopy, 'CANOPY', tree, fromX + dx * canopy, y, fromZ + dz * canopy,
          impactParameterFor(fromX, fromZ, dx, dz, tree.x, tree.z, tree.canopyRadius)
        );
      }
    }

    if (tree.trunkRadius > 0) {
      const trunk = entryTime(fromX, fromZ, dx, dz, tree.x, tree.z, tree.trunkRadius);
      if (trunk !== null) {
        const y = fromY + dy * trunk;
        if (y >= tree.baseY && y <= tree.canopyBottomY && (!best || trunk < best.t)) {
          best = makeHit(
            trunk, 'TRUNK', tree, fromX + dx * trunk, y, fromZ + dz * trunk,
            impactParameterFor(fromX, fromZ, dx, dz, tree.x, tree.z, tree.trunkRadius)
          );
        }
      }
    }
  }

  return best;
}

function makeHit(
  t: number,
  part: TreeHitPart,
  tree: TreeObstacle,
  x: number,
  y: number,
  z: number,
  impactParameter: number
): TreeHit {
  const outX = x - tree.x;
  const outZ = z - tree.z;
  const length = Math.hypot(outX, outZ);

  return {
    t,
    part,
    tree,
    impactParameter,
    x,
    y,
    z,
    normalX: length > 1e-6 ? outX / length : 1,
    normalZ: length > 1e-6 ? outZ / length : 0
  };
}

/**
 * How square the ball's line was to the trunk, as a fraction of the radius.
 *
 * The perpendicular distance from the tree's axis to the line the ball is
 * travelling along — 0 dead centre, 1 a tangent. Measured off the line rather
 * than off the impact point, because every impact point sits on the rim: where
 * the ball touched says nothing about how deep into the tree it was going.
 */
function impactParameterFor(
  fromX: number,
  fromZ: number,
  dx: number,
  dz: number,
  centreX: number,
  centreZ: number,
  radius: number
): number {
  const length = Math.hypot(dx, dz);
  if (length < 1e-9 || radius <= 0) return 0;

  const perpendicular = Math.abs((centreX - fromX) * dz - (centreZ - fromZ) * dx) / length;
  return Math.min(1, perpendicular / radius);
}

/**
 * When the step first crosses into a circle of the given radius, or null.
 *
 * A step that starts inside the circle never counts. A ball that has come to
 * rest against a trunk, or been dropped under a canopy, has to be playable: if
 * being inside were a collision it would be struck and immediately stopped,
 * every time, for ever.
 */
function entryTime(
  fromX: number,
  fromZ: number,
  dx: number,
  dz: number,
  centreX: number,
  centreZ: number,
  radius: number
): number | null {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;

  const offsetX = fromX - centreX;
  const offsetZ = fromZ - centreZ;
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius;
  if (c <= 0) return null;

  const b = 2 * (offsetX * dx + offsetZ * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * What the tree did with the ball.
 *
 * A ball into a tree does not do one thing. It can drop where it stands, get
 * knocked sideways into somewhere better or worse, come straight back at the
 * player off a limb, or rattle through and carry on with a fraction of its line.
 * Which of those happens is not really knowable from the outside — it depends on
 * whether the ball found a leaf, a twig or a limb — so it is drawn, with the
 * odds set by how squarely the ball went at the tree.
 */
export type TreeOutcome = 'THROUGH' | 'DROP' | 'KICK' | 'BACK';

export interface TreeDeflection {
  outcome: TreeOutcome;
  /** Horizontal direction the ball leaves on, as a unit vector. */
  directionX: number;
  directionZ: number;
  /** Fraction of the incoming horizontal speed that survives. */
  speedKept: number;
  /** Fraction of the ball's downward speed that survives. */
  fallKept: number;
}

/** Ranges each outcome draws its speed and turn from. */
const OUTCOMES: Record<TreeOutcome, {
  speed: [number, number];
  /** Radians away from the base direction, as a magnitude. */
  turn: [number, number];
  fallKept: number;
}> = {
  // Rattled through the outside and carried on, well short of where it was going.
  THROUGH: { speed: [0.30, 0.55], turn: [0, 0.44], fallKept: 0.5 },
  // Found the middle and fell out of the bottom.
  DROP: { speed: [0.04, 0.14], turn: [0, 1.2], fallKept: 0.1 },
  // Off a limb and away sideways — which may be the fairway or may be worse.
  KICK: { speed: [0.18, 0.40], turn: [0.79, 2.1], fallKept: 0.25 },
  // Straight back off something solid.
  BACK: { speed: [0.18, 0.42], turn: [2.36, 3.67], fallKept: 0.3 }
};

function between([low, high]: [number, number], random: () => number): number {
  return low + (high - low) * random();
}

function turnBy(x: number, z: number, radians: number): { x: number; z: number } {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

/**
 * The odds of each outcome, given how squarely the ball went at the tree.
 *
 * Square through the middle and it mostly dies there; clipping the edge and it
 * mostly carries on. A sideways kick is always on the cards — that is a branch,
 * and branches are everywhere in a canopy.
 */
export function outcomeWeights(part: TreeHitPart, impactParameter: number): Record<TreeOutcome, number> {
  const glancing = Math.min(1, Math.max(0, impactParameter));
  const square = 1 - glancing;

  if (part === 'TRUNK') {
    // Wood gives almost nothing back except direction. Nothing carries on
    // through a trunk; the question is only how cleanly it comes off.
    return { THROUGH: 0, DROP: 0.22, KICK: 0.20 + 0.25 * glancing, BACK: 0.55 * square + 0.2 };
  }

  return {
    THROUGH: 0.10 + 0.55 * glancing * glancing,
    DROP: 0.15 + 0.55 * square,
    KICK: 0.30,
    BACK: 0.08 + 0.17 * square
  };
}

function pickOutcome(weights: Record<TreeOutcome, number>, random: () => number): TreeOutcome {
  const entries = Object.entries(weights) as [TreeOutcome, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return 'DROP';

  let roll = random() * total;
  for (const [outcome, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return outcome;
  }

  return entries[entries.length - 1][0];
}

/**
 * Draw what happens to a ball that has just met a tree.
 *
 * `random` is injected so a test can pin the draw down; play passes Math.random.
 */
export function deflectOffTree(
  hit: TreeHit,
  incomingX: number,
  incomingZ: number,
  random: () => number
): TreeDeflection {
  const speed = Math.hypot(incomingX, incomingZ);
  const alongX = speed > 1e-6 ? incomingX / speed : 1;
  const alongZ = speed > 1e-6 ? incomingZ / speed : 0;

  const outcome = pickOutcome(outcomeWeights(hit.part, hit.impactParameter), random);
  const spec = OUTCOMES[outcome];

  // A trunk turns the ball the way its face points; a canopy works off the line
  // the ball arrived on, because what it hits in there could be at any angle.
  let baseX = alongX;
  let baseZ = alongZ;
  if (hit.part === 'TRUNK' && outcome !== 'DROP') {
    const into = alongX * hit.normalX + alongZ * hit.normalZ;
    baseX = alongX - 2 * into * hit.normalX;
    baseZ = alongZ - 2 * into * hit.normalZ;
  }

  // Which way a sideways kick goes is a coin toss: the branch does not care
  // which side of the ball it caught.
  const side = random() < 0.5 ? -1 : 1;
  const turn = between(spec.turn, random) * side;
  // A trunk has already been turned by its own face, so it only needs a wobble.
  const applied = hit.part === 'TRUNK' && outcome === 'BACK' ? turn * 0.18 : turn;
  const direction = turnBy(baseX, baseZ, applied);

  return {
    outcome,
    directionX: direction.x,
    directionZ: direction.z,
    speedKept: between(spec.speed, random),
    fallKept: spec.fallKept
  };
}
