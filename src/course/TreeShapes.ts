/**
 * How big a tree is, and what shape it presents to a golf ball.
 *
 * The trees are billboards, so their size lives in one table used by both the
 * renderer that draws them and the physics that has to stop a ball. Keeping two
 * copies would let a tree be drawn one size and played another, which is the
 * worst of both: a ball that dies in clear air, or sails through a trunk.
 *
 * In play a tree is two stacked cylinders — a thin trunk with a much wider
 * canopy above it. That is the shape a billboard actually represents, and it is
 * the difference between a ball threading under the branches and one that
 * catches them.
 */
export type TreeType = 'GUM_LARGE' | 'GUM_MEDIUM' | 'PINE' | 'CLUSTER' | 'BUSH';

export interface TreeInstance {
  x: number;
  z: number;
  type: TreeType;
  scale?: number;
}

export interface TreeDimensions {
  /** Width of the billboard, in metres. */
  widthMetres: number;
  /** Height of the billboard, in metres. */
  heightMetres: number;
  /** Height at which the canopy starts, as a fraction of the whole. */
  canopyBottomFraction: number;
  /** Trunk radius in metres. Zero for a bush, which is canopy to the ground. */
  trunkRadiusMetres: number;
}

export const TREE_DIMENSIONS: Record<TreeType, TreeDimensions> = {
  GUM_LARGE: { widthMetres: 9.0, heightMetres: 11.5, canopyBottomFraction: 0.45, trunkRadiusMetres: 0.34 },
  GUM_MEDIUM: { widthMetres: 6.5, heightMetres: 8.5, canopyBottomFraction: 0.45, trunkRadiusMetres: 0.26 },
  PINE: { widthMetres: 5.2, heightMetres: 9.2, canopyBottomFraction: 0.22, trunkRadiusMetres: 0.22 },
  CLUSTER: { widthMetres: 11.0, heightMetres: 7.5, canopyBottomFraction: 0.12, trunkRadiusMetres: 0.5 },
  BUSH: { widthMetres: 3.6, heightMetres: 2.6, canopyBottomFraction: 0.0, trunkRadiusMetres: 0.0 }
};

/**
 * How much of the billboard's half-width the canopy is worth in play.
 *
 * A drawn canopy is ragged at its edges — leaves and gaps, not a wall — so the
 * outermost pixels are not something a ball reliably hits. Playing the full
 * half-width made trees feel wider than they look, which is the complaint every
 * golf game with tree collision eventually gets.
 */
const CANOPY_RADIUS_FRACTION = 0.42;

/** A tree as the ball meets it: a trunk with a canopy above it. */
export interface TreeObstacle {
  x: number;
  z: number;
  /** Ground level at the trunk. */
  baseY: number;
  /** Where the canopy starts and stops. */
  canopyBottomY: number;
  topY: number;
  canopyRadius: number;
  trunkRadius: number;
}

/** Turn a placed tree into the shape the ball collides with. */
export function treeObstacle(instance: TreeInstance, groundY: number): TreeObstacle {
  const dimensions = TREE_DIMENSIONS[instance.type];
  const scale = instance.scale ?? 1;
  const height = dimensions.heightMetres * scale;

  return {
    x: instance.x,
    z: instance.z,
    baseY: groundY,
    canopyBottomY: groundY + height * dimensions.canopyBottomFraction,
    topY: groundY + height,
    canopyRadius: (dimensions.widthMetres * scale) / 2 * CANOPY_RADIUS_FRACTION,
    trunkRadius: dimensions.trunkRadiusMetres * scale
  };
}
