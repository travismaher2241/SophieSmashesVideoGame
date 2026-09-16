/**
 * Keeping small things visible at distance.
 *
 * Golf is played with objects that are tiny against the scale of a hole: a 43mm
 * ball, a 108mm cup. Drawn at true size they fall below a pixel well before they
 * stop mattering to the player — a struck ball is sub-pixel by the time the
 * follow camera settles, and a cup viewed along the ground foreshortens to a
 * dash. Sprite-era golf games all drew these larger than life for that reason.
 *
 * The rule here is the same in both cases: true size while it is big enough to
 * see, grown beyond that to hold a floor, capped so it never becomes absurd.
 */

/** Radians per pixel in the game's 720-line internal buffer at its 52 degree FOV. */
const RAD_PER_PIXEL = ((52 * Math.PI) / 180) / 720;

/**
 * Scale factor to keep an object at least `minimumPixels` across on screen.
 *
 * Never returns less than 1, so nothing is ever drawn smaller than it really is.
 */
export function apparentSizeScale(
  actualDiameterMetres: number,
  distanceToCamera: number,
  minimumPixels: number,
  maximumScale: number
): number {
  if (!Number.isFinite(distanceToCamera) || distanceToCamera <= 0) return 1;
  if (!Number.isFinite(actualDiameterMetres) || actualDiameterMetres <= 0) return 1;

  const requiredDiameter = distanceToCamera * minimumPixels * RAD_PER_PIXEL;
  const scale = requiredDiameter / actualDiameterMetres;

  return Math.min(maximumScale, Math.max(1, scale));
}
