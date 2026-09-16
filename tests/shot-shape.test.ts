import { describe, expect, it } from 'vitest';
import {
  adjacentShape,
  applyShotShape,
  describeShotResult,
  shapeProfile,
  SHOT_SHAPES,
  ShotShape
} from '../src/golf/ShotShape';
import { SwingResult } from '../src/golf/SwingMeter';

const PURE: SwingResult = {
  powerRatio: 1,
  accuracyError: 0,
  strikeQuality: 'PURE',
  feedbackText: 'PURE!',
  isPerfect: true,
  hookSliceAngleDegrees: 0,
  curveSpinFactor: 0
};

const EARLY: SwingResult = {
  ...PURE,
  accuracyError: -0.5,
  strikeQuality: 'NOTICEABLE',
  feedbackText: 'EARLY — DRAW',
  isPerfect: false,
  hookSliceAngleDegrees: -9,
  curveSpinFactor: -0.5
};

describe('choosing a shot shape', () => {
  it('starts a draw right of target and curves it back left', () => {
    const draw = applyShotShape(PURE, 'DRAW');

    // Positive launch offset is right of the aim line; negative spin curves left.
    expect(draw.hookSliceAngleDegrees).toBeGreaterThan(0);
    expect(draw.curveSpinFactor).toBeLessThan(0);
  });

  it('starts a fade left of target and curves it back right', () => {
    const fade = applyShotShape(PURE, 'FADE');

    expect(fade.hookSliceAngleDegrees).toBeLessThan(0);
    expect(fade.curveSpinFactor).toBeGreaterThan(0);
  });

  it('mirrors a draw and a fade exactly', () => {
    const draw = applyShotShape(PURE, 'DRAW');
    const fade = applyShotShape(PURE, 'FADE');

    expect(draw.hookSliceAngleDegrees).toBeCloseTo(-fade.hookSliceAngleDegrees, 6);
    expect(draw.curveSpinFactor).toBeCloseTo(-fade.curveSpinFactor, 6);
  });

  it('leaves a straight shot alone', () => {
    const straight = applyShotShape(PURE, 'STRAIGHT');

    expect(straight.hookSliceAngleDegrees).toBe(PURE.hookSliceAngleDegrees);
    expect(straight.curveSpinFactor).toBe(PURE.curveSpinFactor);
  });

  it('adds to the swing rather than replacing it, so timing still matters', () => {
    // A draw hit early is a hook, not a tidy draw. Shaping picks the shot; it
    // does not strike it.
    const drawnEarly = applyShotShape(EARLY, 'DRAW');
    const drawnPure = applyShotShape(PURE, 'DRAW');

    expect(drawnEarly.curveSpinFactor).toBeLessThan(drawnPure.curveSpinFactor);
  });

  it('lets a late strike straighten out an intended draw', () => {
    const late: SwingResult = { ...EARLY, curveSpinFactor: 0.5, hookSliceAngleDegrees: 9 };
    const shaped = applyShotShape(late, 'DRAW');

    // Still drawing, but less than a pure strike would have.
    expect(shaped.curveSpinFactor).toBeGreaterThan(applyShotShape(PURE, 'DRAW').curveSpinFactor);
    expect(shaped.curveSpinFactor).toBeLessThan(0);
  });
});

describe('the shape scales with the club', () => {
  it('gives a shorter club less curve than a driver', () => {
    // Side spin acts over flight time, and a lofted club has plenty of it. Left
    // unscaled, a shaped wedge bent further off line than a shaped drive.
    const driver = Math.abs(applyShotShape(PURE, 'DRAW', 230).curveSpinFactor);
    const wedge = Math.abs(applyShotShape(PURE, 'DRAW', 90).curveSpinFactor);

    expect(wedge).toBeLessThan(driver);
  });

  it('scales monotonically down the bag', () => {
    const carries = [230, 195, 175, 145, 120, 90];
    const curves = carries.map((carry) => Math.abs(applyShotShape(PURE, 'DRAW', carry).curveSpinFactor));

    for (let i = 1; i < curves.length; i++) {
      expect(curves[i]).toBeLessThanOrEqual(curves[i - 1]);
    }
  });

  it('never inverts the curve, however odd the club distance', () => {
    for (const carry of [0, -5, 1, 10, 10000, Number.NaN]) {
      expect(applyShotShape(PURE, 'DRAW', carry).curveSpinFactor).toBeLessThan(0);
      expect(applyShotShape(PURE, 'FADE', carry).curveSpinFactor).toBeGreaterThan(0);
    }
  });
});

describe('cycling between shapes', () => {
  it('moves through draw, straight and fade', () => {
    expect(adjacentShape('STRAIGHT', -1)).toBe('DRAW');
    expect(adjacentShape('STRAIGHT', 1)).toBe('FADE');
    expect(adjacentShape('DRAW', 1)).toBe('STRAIGHT');
    expect(adjacentShape('FADE', -1)).toBe('STRAIGHT');
  });

  it('stops at each end rather than wrapping around', () => {
    // Wrapping would flip a draw straight to a fade on one keypress.
    expect(adjacentShape('DRAW', -1)).toBe('DRAW');
    expect(adjacentShape('FADE', 1)).toBe('FADE');
  });

  it('offers every shape, each with its own profile', () => {
    expect(SHOT_SHAPES).toHaveLength(3);
    const offsets = SHOT_SHAPES.map((shape: ShotShape) => shapeProfile(shape).startOffsetDegrees);
    expect(new Set(offsets).size).toBe(3);
  });
});

describe('describing what the ball did', () => {
  it('reads a pure straight strike as straight', () => {
    expect(describeShotResult(PURE, 'STRAIGHT')).toBe('STRAIGHT');
  });

  it('names the intended shape on a pure strike', () => {
    // Flushing a draw is a draw. Absolute thresholds used to call it a big hook,
    // which told the player they had mishit a shot they had struck perfectly.
    expect(describeShotResult(PURE, 'DRAW')).toBe('DRAW');
    expect(describeShotResult(PURE, 'FADE')).toBe('FADE');
  });

  it('calls out a shaped shot that got away', () => {
    expect(describeShotResult(EARLY, 'DRAW')).toBe('BIG HOOK');
    const late: SwingResult = { ...EARLY, curveSpinFactor: 0.5, hookSliceAngleDegrees: 9 };
    expect(describeShotResult(late, 'FADE')).toBe('BIG SLICE');
  });

  it('reads a mistimed straight shot as a slight shape', () => {
    expect(describeShotResult(EARLY, 'STRAIGHT')).toBe('SLIGHT DRAW');
  });
});
