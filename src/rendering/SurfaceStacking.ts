import { SurfaceType } from '../course/SurfaceQuery';

/**
 * The order the mown surfaces lie on top of each other.
 *
 * A course is drawn as overlapping sheets: the rough covers the whole hole, the
 * fairway sits on the rough, the fringe sits on the fairway, the green sits
 * inside the fringe. Every one of those pairs shares ground, so each sheet has
 * to be unambiguously above the one it covers — in height and in depth — or the
 * two fight for the depth buffer and the loser shows through in patches.
 *
 * That is exactly what the blotches on the greens were. The green and the fringe
 * were both lifted 0.12m and the green is drawn entirely inside the fringe, so
 * over the whole putting surface two coplanar sheets were competing, and the
 * darker one won wherever the arithmetic happened to round its way. They looked
 * like shadows, they were not: they were still there with the sun switched off.
 */
const SURFACE_STACK: readonly SurfaceType[] = [
  'ROUGH',
  'GENERAL_AREA',
  'DEEP_ROUGH',
  'FIRST_CUT',
  'WATER',
  'FAIRWAY',
  'PATH',
  'GROUND_UNDER_REPAIR',
  'OUT_OF_BOUNDS',
  'BUNKER',
  'FRINGE',
  'TEE',
  'GREEN'
];

/**
 * How far above the terrain a surface is drawn, in metres.
 *
 * Small and strictly increasing: big enough that no two sheets are coplanar,
 * small enough that a green does not stand off the ground it is cut into. The
 * whole ladder is under a sixth of a metre.
 */
export function surfaceRenderOffset(type: SurfaceType): number {
  return 0.02 + surfaceStackLayer(type) * 0.01;
}

/**
 * Where a surface sits in the stack, counting from the ground up.
 *
 * Also used as a depth bias, because height alone stops being enough at
 * distance: two sheets a centimetre apart are the same number to a depth buffer
 * two hundred metres away, and the blotches would come back down the hole where
 * they are hardest to notice and hardest to explain.
 */
export function surfaceStackLayer(type: SurfaceType): number {
  const index = SURFACE_STACK.indexOf(type);
  return index < 0 ? 1 : index;
}

/** The types, lowest sheet first. */
export function surfaceStackOrder(): readonly SurfaceType[] {
  return SURFACE_STACK;
}

/**
 * The depth bias that keeps a sheet off the one below it, as polygon offset.
 *
 * Expressed as pushing the LOWER sheets away rather than pulling the upper ones
 * towards the camera, which matters more than it sounds. The top sheet — the
 * green — keeps a bias of zero, so everything drawn on top of a green at a few
 * millimetres (the cup, its collar and rim, the break grid, the aiming line,
 * the ball) still sits in front of it without knowing any of this exists.
 * Pulling the green forward instead swallowed the cup whole.
 */
export function surfaceDepthBias(type: SurfaceType): { factor: number; units: number } {
  const away = SURFACE_STACK.length - 1 - surfaceStackLayer(type);
  return { factor: away * 0.5, units: away };
}
