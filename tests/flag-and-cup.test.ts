import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FlagRenderer } from '../src/rendering/FlagRenderer';
import { surfaceRenderOffset } from '../src/rendering/SurfaceMeshOverlay';
import { apparentSizeScale } from '../src/rendering/ApparentSize';

/** Highest and lowest world Y of every mesh under the flag group. */
function verticalExtent(renderer: FlagRenderer) {
  const group = renderer.getGroup();
  group.updateMatrixWorld(true);

  let lowest = Infinity;
  let highest = -Infinity;

  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const bounds = new Box3().setFromObject(object);
    if (!bounds.isEmpty()) {
      lowest = Math.min(lowest, bounds.min.y);
      highest = Math.max(highest, bounds.max.y);
    }
  });

  return { lowest, highest };
}

describe('the hole is visible on the green', () => {
  it('draws every part of the cup above the putting surface mesh', () => {
    // The bug: the cup was built at 2.5cm above bare terrain while the green is
    // drawn at 12cm, so the hole was rendered underneath the grass and the player
    // could not see it at all. The green is a solid mesh with nothing cut out of
    // it, so the cup has to sit on top of the drawn surface.
    const renderer = new FlagRenderer();
    renderer.setPosition(new Vector3(0, 0, 0));

    const greenSurface = surfaceRenderOffset('GREEN');
    const { lowest } = verticalExtent(renderer);

    expect(lowest).toBeGreaterThanOrEqual(greenSurface);
  });

  it('stands a flagstick of a believable height', () => {
    const renderer = new FlagRenderer();
    renderer.setPosition(new Vector3(0, 0, 0));

    const { highest } = verticalExtent(renderer);
    // Regulation is 2.1m. The old putting pin was 0.65m, which read as a toy.
    expect(highest).toBeGreaterThan(1.9);
    expect(highest).toBeLessThan(2.4);
  });

  it('follows the ground position it is placed at', () => {
    const renderer = new FlagRenderer();
    renderer.setPosition(new Vector3(120, 18.5, 375));

    const { lowest } = verticalExtent(renderer);
    expect(lowest).toBeGreaterThanOrEqual(18.5 + surfaceRenderOffset('GREEN'));
  });
});

describe('apparentSizeScale', () => {
  it('leaves an object at true size when it is already big enough', () => {
    expect(apparentSizeScale(0.088, 1, 7, 9)).toBe(1);
    expect(apparentSizeScale(1.5, 30, 7, 9)).toBe(1);
  });

  it('grows an object that would otherwise fall below the floor', () => {
    expect(apparentSizeScale(0.088, 30, 7, 9)).toBeGreaterThan(2);
    expect(apparentSizeScale(0.108, 8, 26, 4.5)).toBeGreaterThan(2);
  });

  it('never exceeds the cap', () => {
    expect(apparentSizeScale(0.088, 100000, 7, 9)).toBe(9);
  });

  it('never shrinks anything below true size', () => {
    for (const distance of [0.1, 1, 5, 50]) {
      expect(apparentSizeScale(0.088, distance, 7, 9)).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles degenerate input without producing NaN', () => {
    expect(apparentSizeScale(0.088, 0, 7, 9)).toBe(1);
    expect(apparentSizeScale(0.088, Number.NaN, 7, 9)).toBe(1);
    expect(apparentSizeScale(0, 10, 7, 9)).toBe(1);
  });
});
