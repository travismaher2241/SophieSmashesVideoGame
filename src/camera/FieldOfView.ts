import { PerspectiveCamera } from 'three';

/**
 * How much of the hole the camera shows, on a screen of any shape.
 *
 * Three.js takes a *vertical* field of view, so holding one fixed means the
 * horizontal field shrinks as the window gets taller and narrower. On a phone
 * held upright that is ruinous: at a 0.47 aspect the game's 52 degrees vertical
 * left 26 degrees across, and the hole arrived as a narrow strip down the middle
 * with the golfer pushed off the side of the frame.
 *
 * So on a screen taller than 4:3 the vertical field opens up to keep something
 * like the width of view a landscape screen gets. A phone ends up with about 37
 * degrees across instead of 26, which is the difference between seeing the
 * corridor and seeing a slot.
 *
 * Landscape is deliberately left exactly as it was. Anything 4:3 or wider gets
 * the 52 degrees the game has always been framed for: the problem being solved
 * here is portrait, and a change that also re-framed every desktop would be a
 * second, unasked-for change riding along with it.
 */

/** Screen shape the 52 degree framing belongs to. Wider than this keeps it. */
const REFERENCE_ASPECT = 4 / 3;

/** The vertical field a landscape screen is framed with. */
export const BASE_VERTICAL_FOV = 52;

/**
 * Ceiling on the vertical field.
 *
 * Without it a tall phone would want about 108 degrees, which bends the hole
 * into a fisheye and shrinks everything in the distance. 72 is as wide as the
 * view goes before that starts to show.
 */
export const MAX_VERTICAL_FOV = 72;

/** The vertical field of view to use on a screen of this shape. */
export function verticalFovForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return BASE_VERTICAL_FOV;
  if (aspect >= REFERENCE_ASPECT) return BASE_VERTICAL_FOV;

  const halfBase = (BASE_VERTICAL_FOV * Math.PI) / 360;
  const vertical = 2 * Math.atan(Math.tan(halfBase) * (REFERENCE_ASPECT / aspect)) * (180 / Math.PI);

  return Math.min(MAX_VERTICAL_FOV, vertical);
}

/** What the player can actually see across, once the vertical has been clamped. */
export function horizontalFovForAspect(aspect: number): number {
  const halfVertical = (verticalFovForAspect(aspect) * Math.PI) / 360;
  return 2 * Math.atan(Math.tan(halfVertical) * aspect) * (180 / Math.PI);
}

/** Point the camera at a screen of this shape. */
export function applyViewportAspect(camera: PerspectiveCamera, aspect: number): void {
  if (!Number.isFinite(aspect) || aspect <= 0) return;

  const fov = verticalFovForAspect(aspect);
  if (camera.aspect === aspect && camera.fov === fov) return;

  camera.aspect = aspect;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
