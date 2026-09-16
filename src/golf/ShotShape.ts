import { SwingResult } from './SwingMeter';

/**
 * The shape the player is trying to hit.
 *
 * A draw starts right of the target and turns back left; a fade starts left and
 * turns right. Both finish on the aim line when struck well, which is the point
 * of shaping a shot: you can work the ball around something and still hold your
 * line, or lean on the curve to hold a green from the safe side.
 */
export type ShotShape = 'DRAW' | 'STRAIGHT' | 'FADE';

/** Selectable order, left to right, as the player cycles through them. */
export const SHOT_SHAPES: readonly ShotShape[] = ['DRAW', 'STRAIGHT', 'FADE'];

export interface ShapeProfile {
  label: string;
  /** Degrees the ball starts off the aim line. Positive is right of target. */
  startOffsetDegrees: number;
  /** Side-spin factor applied in flight. Negative curves left, positive right. */
  curveSpin: number;
}

/**
 * How far the ball curves, and how far right (or left) it must start in order to
 * come back to the aim line.
 *
 * These two are a matched pair and were measured against the flight model, not
 * guessed. Side spin bends the ball far less than a launch-angle offset pushes
 * it — about 15m of curve per unit of spin against 15m per three degrees of
 * offset — so they have to be sized together. Pick them independently and a
 * "draw" either finishes 20m left of target or never visibly leaves the line.
 *
 * Because the start offset and the curve cancel at the target, the widest point
 * of the flight is only about a quarter of either one. They are set large enough
 * that a shaped drive visibly bends by roughly 9m at its widest and still
 * finishes on the aim line.
 */
const CURVE_SPIN = 2.4;
const START_OFFSET_DEGREES = 7.9;

/** The driver's carry, which the shaping curve is scaled against. */
const REFERENCE_CARRY_METRES = 230;

const PROFILES: Record<ShotShape, ShapeProfile> = {
  DRAW: { label: 'DRAW', startOffsetDegrees: START_OFFSET_DEGREES, curveSpin: -CURVE_SPIN },
  STRAIGHT: { label: 'STRAIGHT', startOffsetDegrees: 0, curveSpin: 0 },
  FADE: { label: 'FADE', startOffsetDegrees: -START_OFFSET_DEGREES, curveSpin: CURVE_SPIN }
};

export function shapeProfile(shape: ShotShape): ShapeProfile {
  return PROFILES[shape];
}

/** The next shape when cycling, clamped at each end rather than wrapping. */
export function adjacentShape(shape: ShotShape, direction: -1 | 1): ShotShape {
  const index = SHOT_SHAPES.indexOf(shape);
  const next = Math.max(0, Math.min(SHOT_SHAPES.length - 1, index + direction));
  return SHOT_SHAPES[next];
}

/**
 * Fold the intended shape into the swing the player actually made.
 *
 * The two add rather than replace each other, so timing still matters: a draw
 * hit early turns into a hook, and a draw hit late straightens out or even
 * fades. Shaping the ball chooses the shot; it does not remove the need to
 * strike it.
 */
export function applyShotShape(
  swing: SwingResult,
  shape: ShotShape,
  clubCarryMetres: number = REFERENCE_CARRY_METRES
): SwingResult {
  const profile = shapeProfile(shape);

  return {
    ...swing,
    hookSliceAngleDegrees: swing.hookSliceAngleDegrees + profile.startOffsetDegrees,
    curveSpinFactor: swing.curveSpinFactor + profile.curveSpin * curveScaleForClub(clubCarryMetres)
  };
}

/**
 * How much of the shaping spin a club gets.
 *
 * The start offset is an angle, so it scales with distance by itself. The curve
 * does not scale quite the same way even with a speed-proportional Magnus force,
 * because a lofted club still hangs in the air longer per metre of ground.
 *
 * Rather than guess at a law, this is a straight-line fit through what the flight
 * model actually does. Measured with a full shaping spin and the start offset
 * above, the curve overshot what was needed to get back to the aim line by these
 * factors: driver 1.31, 4 iron 1.55, 7 iron 1.71, 9 iron 1.78, gap wedge 1.77.
 * The fit takes those out, leaving every club finishing within a couple of metres
 * of the line.
 */
function curveScaleForClub(clubCarryMetres: number): number {
  if (!Number.isFinite(clubCarryMetres) || clubCarryMetres <= 0) return 1;

  const fitted = 0.56 + (clubCarryMetres - 90) * 0.00141;
  return Math.max(0.5, Math.min(0.8, fitted));
}

/**
 * What the shot is actually doing, given the shape asked for and how it was
 * struck — which is not always what was intended.
 */
export function describeShotResult(swing: SwingResult, shape: ShotShape): string {
  const curve = swing.curveSpinFactor + shapeProfile(shape).curveSpin;

  // Judged against a well-struck shaped shot rather than against fixed numbers.
  // A pure strike on an intended draw IS a draw — reading it as a big hook, which
  // absolute thresholds did, tells the player they mishit a shot they flushed.
  const ratio = Math.abs(curve) / CURVE_SPIN;
  const drawing = curve < 0;

  if (ratio < 0.15) return 'STRAIGHT';
  if (ratio < 0.6) return drawing ? 'SLIGHT DRAW' : 'SLIGHT FADE';
  if (ratio <= 1.15) return drawing ? 'DRAW' : 'FADE';
  return drawing ? 'BIG HOOK' : 'BIG SLICE';
}
