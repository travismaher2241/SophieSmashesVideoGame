import { TreeObstacle } from '../course/TreeShapes';

export type TreeHitPart = 'CANOPY' | 'TRUNK';

export interface TreeHit {
  /** Where along the step the ball met the tree, 0 to 1. */
  t: number;
  part: TreeHitPart;
  tree: TreeObstacle;
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
  trees: readonly TreeObstacle[]
): TreeHit | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;

  let best: TreeHit | null = null;

  for (const tree of trees) {
    // Cheap reject: the step's bounding box against the canopy's.
    const reach = tree.canopyRadius;
    if (Math.min(fromX, toX) > tree.x + reach || Math.max(fromX, toX) < tree.x - reach) continue;
    if (Math.min(fromZ, toZ) > tree.z + reach || Math.max(fromZ, toZ) < tree.z - reach) continue;
    if (Math.min(fromY, toY) > tree.topY || Math.max(fromY, toY) < tree.baseY) continue;

    const canopy = entryTime(fromX, fromZ, dx, dz, tree.x, tree.z, tree.canopyRadius);
    if (canopy !== null) {
      const y = fromY + dy * canopy;
      if (y >= tree.canopyBottomY && y <= tree.topY && (!best || canopy < best.t)) {
        best = makeHit(canopy, 'CANOPY', tree, fromX + dx * canopy, y, fromZ + dz * canopy);
      }
    }

    if (tree.trunkRadius > 0) {
      const trunk = entryTime(fromX, fromZ, dx, dz, tree.x, tree.z, tree.trunkRadius);
      if (trunk !== null) {
        const y = fromY + dy * trunk;
        if (y >= tree.baseY && y <= tree.canopyBottomY && (!best || trunk < best.t)) {
          best = makeHit(trunk, 'TRUNK', tree, fromX + dx * trunk, y, fromZ + dz * trunk);
        }
      }
    }
  }

  return best;
}

function makeHit(t: number, part: TreeHitPart, tree: TreeObstacle, x: number, y: number, z: number): TreeHit {
  const outX = x - tree.x;
  const outZ = z - tree.z;
  const length = Math.hypot(outX, outZ);

  return {
    t,
    part,
    tree,
    x,
    y,
    z,
    normalX: length > 1e-6 ? outX / length : 1,
    normalZ: length > 1e-6 ? outZ / length : 0
  };
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
