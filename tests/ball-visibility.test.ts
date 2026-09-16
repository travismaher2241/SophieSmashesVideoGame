import { describe, expect, it } from 'vitest';
import { BallRenderer } from '../src/rendering/BallRenderer';
import { surfaceRenderOffset } from '../src/rendering/SurfaceMeshOverlay';
import { SURFACE_TYPES } from '../src/course/SurfaceQuery';

/** Radius of a regulation ball — where physics rests it above the terrain. */
const BALL_RADIUS = 0.044;

/** Radians per pixel in the game's 720-line internal buffer at its 52 degree FOV. */
const RAD_PER_PIXEL = ((52 * Math.PI) / 180) / 720;

/** Apparent height in pixels of the ball at a distance, after visibility scaling. */
function apparentPixels(distance: number): number {
  const drawnDiameter = 0.088 * BallRenderer.visibilityScale(distance);
  return drawnDiameter / distance / RAD_PER_PIXEL;
}

describe('ball rests on top of the surface it lies on', () => {
  // The bug: surface meshes are drawn 2-12cm above bare terrain to avoid
  // z-fighting, but the ball sits only 4.4cm up, so on a tee, fairway or green it
  // was rendered underneath the grass and could not be seen at all.
  for (const lie of SURFACE_TYPES) {
    it(`draws the ball above the ${lie} surface mesh`, () => {
      const terrainY = 12.5;
      const restingY = terrainY + BALL_RADIUS;
      const surfaceMeshY = terrainY + surfaceRenderOffset(lie);

      expect(BallRenderer.renderHeight(restingY, lie)).toBeGreaterThan(surfaceMeshY);
    });
  }

  it('would have been buried without the lift on mown surfaces', () => {
    // Guards the premise: if surface offsets ever drop below the ball's radius
    // this whole correction becomes unnecessary, and this test should be revisited.
    for (const lie of ['TEE', 'FAIRWAY', 'GREEN'] as const) {
      expect(surfaceRenderOffset(lie)).toBeGreaterThan(BALL_RADIUS);
    }
  });
});

describe('ball stays visible at distance', () => {
  it('draws at true size when the camera is close', () => {
    // Address and putting views sit 3-7m away; the ball is big enough there.
    expect(BallRenderer.visibilityScale(3.2)).toBe(1);
    expect(BallRenderer.visibilityScale(6.4)).toBe(1);
  });

  it('holds a readable size through a full shot', () => {
    // The follow camera trails ~30m behind a struck ball, where true scale put it
    // at barely two pixels.
    for (const distance of [12, 20, 30, 45, 70]) {
      expect(apparentPixels(distance)).toBeGreaterThanOrEqual(6);
    }
  });

  it('never shrinks the ball below true scale', () => {
    for (const distance of [0.5, 1, 2, 5]) {
      expect(BallRenderer.visibilityScale(distance)).toBe(1);
    }
  });

  it('caps the enlargement so a distant ball is not a balloon', () => {
    expect(BallRenderer.visibilityScale(10000)).toBeLessThanOrEqual(9);
  });

  it('handles degenerate distances without producing NaN', () => {
    expect(BallRenderer.visibilityScale(0)).toBe(1);
    expect(BallRenderer.visibilityScale(Number.NaN)).toBe(1);
  });
});
