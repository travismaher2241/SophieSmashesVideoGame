import { describe, expect, it } from 'vitest';
import { Vector3, Mesh, CircleGeometry, Object3D } from 'three';
import {
  BASE_VERTICAL_FOV,
  horizontalFovForAspect,
  MAX_VERTICAL_FOV,
  verticalFovForAspect
} from '../src/camera/FieldOfView';
import { FlagRenderer } from '../src/rendering/FlagRenderer';
import { CUP_CAPTURE_RADIUS_METRES, PuttingPhysics } from '../src/physics/PuttingPhysics';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';

/** Aspect ratios of the screens the game is actually played on. */
const PHONE_PORTRAIT = 412 / 870;
const PHONE_NARROW = 360 / 780;
const LAPTOP = 1440 / 810;
const FOUR_THREE = 4 / 3;
const WINDOWED = 900 / 700;

describe('fitting the view to the screen', () => {
  it('leaves landscape screens exactly as they were framed', () => {
    // The portrait problem is the one being fixed; re-framing every desktop
    // alongside it would be a second change nobody asked for.
    expect(verticalFovForAspect(LAPTOP)).toBe(BASE_VERTICAL_FOV);
    expect(verticalFovForAspect(FOUR_THREE)).toBe(BASE_VERTICAL_FOV);
    expect(verticalFovForAspect(21 / 9)).toBe(BASE_VERTICAL_FOV);
  });

  it('barely touches a windowed desktop that is a little taller than 4:3', () => {
    expect(verticalFovForAspect(WINDOWED)).toBeGreaterThan(BASE_VERTICAL_FOV);
    expect(verticalFovForAspect(WINDOWED)).toBeLessThan(BASE_VERTICAL_FOV + 4);
  });

  it('opens the view up on a phone held upright', () => {
    // The old fixed 52 degrees vertical left 26 across on a phone — the hole
    // arrived as a strip down the middle with the golfer off the side of it.
    const before = 2 * Math.atan(Math.tan((52 * Math.PI) / 360) * PHONE_PORTRAIT) * (180 / Math.PI);
    expect(before).toBeLessThan(27);

    expect(horizontalFovForAspect(PHONE_PORTRAIT)).toBeGreaterThan(35);
    expect(horizontalFovForAspect(PHONE_NARROW)).toBeGreaterThan(35);
  });

  it('stops short of a fisheye however tall the screen gets', () => {
    for (const aspect of [PHONE_PORTRAIT, PHONE_NARROW, 0.3, 0.1]) {
      expect(verticalFovForAspect(aspect)).toBeLessThanOrEqual(MAX_VERTICAL_FOV);
    }
  });

  it('never returns something unusable for a nonsense aspect', () => {
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fov = verticalFovForAspect(aspect);
      expect(Number.isFinite(fov)).toBe(true);
      expect(fov).toBeGreaterThan(0);
    }
  });

  it('widens smoothly as the screen gets taller, never narrowing', () => {
    const aspects = [2.0, 1.6, FOUR_THREE, 1.1, 0.9, 0.7, 0.5];
    for (let i = 1; i < aspects.length; i++) {
      expect(verticalFovForAspect(aspects[i])).toBeGreaterThanOrEqual(
        verticalFovForAspect(aspects[i - 1])
      );
    }
  });
});

/** Every circle drawn in the flag group, with its radius and world scale. */
function drawnCircles(root: Object3D) {
  const found: { radius: number; scale: number }[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry as CircleGeometry;
    if (geometry.type !== 'CircleGeometry') return;
    object.updateWorldMatrix(true, false);
    found.push({
      radius: geometry.parameters.radius,
      scale: object.matrixWorld.getMaxScaleOnAxis()
    });
  });
  return found;
}

describe('the hole that is drawn and the hole that is played', () => {
  it('draws the mouth of the cup at the radius the ball is actually caught at', () => {
    const flag = new FlagRenderer();

    // The smallest filled circle in the group is the mouth; the collar is the
    // wider one under it.
    const radii = drawnCircles(flag.getGroup()).map((circle) => circle.radius);
    expect(Math.min(...radii)).toBeCloseTo(CUP_CAPTURE_RADIUS_METRES, 6);
  });

  it('never blows the mouth up with distance, however far away the pin is', () => {
    // Enlarging it is what caused the complaint: from a putting camera the black
    // disc was nearly twice the width of the real target, so a ball could roll
    // across the drawn hole and stay out. The markings around it may grow; the
    // hole may not.
    const flag = new FlagRenderer();
    flag.setPosition(new Vector3(0, 0, 0));

    for (const distance of [2, 8, 30, 120]) {
      flag.update(new Vector3(0, distance * 0.3, distance));

      const mouth = drawnCircles(flag.getGroup()).reduce((smallest, circle) =>
        circle.radius < smallest.radius ? circle : smallest
      );

      expect(mouth.radius * mouth.scale).toBeCloseTo(CUP_CAPTURE_RADIUS_METRES, 6);
    }
  });

  it('still grows the markings around it, so the pin is findable from the fairway', () => {
    const flag = new FlagRenderer();
    flag.setPosition(new Vector3(0, 0, 0));

    flag.update(new Vector3(0, 1, 3));
    const close = drawnCircles(flag.getGroup()).reduce((a, b) => (a.radius > b.radius ? a : b));

    flag.update(new Vector3(0, 30, 100));
    const far = drawnCircles(flag.getGroup()).reduce((a, b) => (a.radius > b.radius ? a : b));

    expect(far.radius * far.scale).toBeGreaterThan(close.radius * close.scale);
  });
});

describe('rolling a ball over the drawn hole', () => {
  /** A dead flat green, so nothing but the aim decides where the ball goes. */
  function flatGreen() {
    const meta = {
      courseId: 'cup-test',
      holeNumber: 1,
      par: 4,
      status: 'test',
      sourceCRS: 'EPSG:7855',
      gridSpacingMetres: 1.0,
      widthSamples: 200,
      heightSamples: 200,
      baseElevation: 10,
      elevationRangeMetres: 0,
      binary: { demFile: 't.bin', bytesPerSample: 2, sampleEncoding: 'UINT16' as const, expectedBytes: 1 }
    };
    return new TerrainQuery(new TerrainData(meta, new Float32Array(200 * 200).fill(10), 199, 199));
  }

  /** Roll a putt from 3m out, offset sideways by the given distance. */
  function rollPast(offsetMetres: number) {
    const putting = new PuttingPhysics(flatGreen());
    const cup = new Vector3(100, 10, 100);

    putting.setPosition(cup.x - 3, cup.z + offsetMetres);
    putting.launchPutt(3.6, 0);

    let steps = 0;
    while (putting.state === 'ROLLING' && steps < 2000) {
      putting.update(1 / 60, cup);
      steps++;
    }

    return putting.state;
  }

  it('holes a putt rolled over the middle of it', () => {
    expect(rollPast(0)).toBe('HOLED');
  });

  it('holes one whose centre crosses inside the drawn black', () => {
    expect(rollPast(CUP_CAPTURE_RADIUS_METRES * 0.8)).toBe('HOLED');
  });

  it('leaves out one that misses the drawn black', () => {
    // Just outside, which on screen is a ball whose centre stays on the green.
    // Before, the black was drawn wider than this, so a miss looked like a putt
    // rolling straight across the hole and refusing to drop.
    expect(rollPast(CUP_CAPTURE_RADIUS_METRES * 1.5)).toBe('REST');
  });
});
