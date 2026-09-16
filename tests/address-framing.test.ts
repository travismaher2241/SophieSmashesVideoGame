import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraController } from '../src/camera/CameraController';
import { applyViewportAspect } from '../src/camera/FieldOfView';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';

/**
 * How big the golfer comes out on screen, at the address view, on a screen of a
 * given shape.
 *
 * A wider lens shrinks everything in the frame, and the portrait view needs a
 * much wider lens than a desktop to get the width of the corridor on screen. Pull
 * the camera back as well and the two compound: the first pass at a portrait
 * camera left her at 14% of the screen against 35% on a desktop — a doll at the
 * bottom of the frame, which is exactly what it looked like.
 */
function figureHeightFraction(width: number, height: number): number {
  const ball = new Vector3(100, 10, 100);

  const controller = new CameraController(fakeElement(), ...flatTerrain());
  applyViewportAspect(controller.camera, width / height);
  controller.updateGolfAddressView(ball, 0, false);
  // Nothing has rendered, so the camera's world matrix is still stale.
  controller.camera.updateMatrixWorld(true);

  const feet = ball.clone().project(controller.camera);
  const head = ball.clone().setY(ball.y + 1.85).project(controller.camera);

  // Normalised device coords run -1..1 over the screen, so the gap between them
  // is already the fraction of the window the figure fills.
  return Math.abs(head.y - feet.y) / 2;
}

function flatTerrain(): [TerrainData, TerrainQuery] {
  const meta = {
    courseId: 'framing-test',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 1.0,
    widthSamples: 300,
    heightSamples: 300,
    baseElevation: 10,
    elevationRangeMetres: 0,
    binary: { demFile: 't.bin', bytesPerSample: 2, sampleEncoding: 'UINT16' as const, expectedBytes: 1 }
  };
  const data = new TerrainData(meta, new Float32Array(300 * 300).fill(10), 299, 299);
  return [data, new TerrainQuery(data)];
}

function fakeElement() {
  return { addEventListener: () => {} } as unknown as HTMLElement;
}

describe('framing the golfer at address', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: () => {}
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('draws her about a third of the screen tall on a desktop', () => {
    const desktop = figureHeightFraction(1280, 720);

    expect(desktop).toBeGreaterThan(0.28);
    expect(desktop).toBeLessThan(0.45);
  });

  it('keeps her a comparable size on a phone held upright', () => {
    const desktop = figureHeightFraction(1280, 720);
    const phone = figureHeightFraction(412, 870);

    // Some shrinking is the price of the wider lens a portrait screen needs.
    // Half the desktop size is not; that is where she stopped reading as a
    // person swinging a club.
    expect(phone).toBeGreaterThan(desktop * 0.6);
  });

  it('never shrinks her below a readable share of a phone screen', () => {
    for (const [width, height] of [[412, 870], [360, 780], [390, 844]]) {
      const fraction = figureHeightFraction(width, height);

      expect(fraction).toBeGreaterThan(0.18);
      // And she must not fill the frame either, or there is no hole to look at.
      expect(fraction).toBeLessThan(0.40);
    }
  });

  it('keeps her clear of the edge of a narrow frame', () => {
    const ball = new Vector3(100, 10, 100);
    const controller = new CameraController(fakeElement(), ...flatTerrain());
    applyViewportAspect(controller.camera, 412 / 870);
    controller.updateGolfAddressView(ball, 0, false);
    controller.camera.updateMatrixWorld(true);

    // She stands to the left of the ball, so the camera must not be offset the
    // other way far enough to push her out of frame — which is how she came to
    // be a sliver down the left-hand side.
    const golfer = ball.clone().setX(ball.x).setZ(ball.z - 0.7).project(controller.camera);

    expect(golfer.x).toBeGreaterThan(-0.75);
    expect(golfer.x).toBeLessThan(0.75);
  });
});
