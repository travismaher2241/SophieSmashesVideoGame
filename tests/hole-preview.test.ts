import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHoleMapView, distanceMarkers } from '../src/ui/HoleMap';
import { previewLayoutFor } from '../src/ui/HolePreview';
import { HoleFlyby } from '../src/rendering/HoleFlyby';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';
import { HoleConfig } from '../src/course/HoleData';

function loadHole(index: number): HoleConfig {
  const path = SOPHIE_HILLS_CONFIG.holes[index].holePath;
  return JSON.parse(readFileSync(resolve(process.cwd(), `public${path}/hole.json`), 'utf8'));
}

const hole1 = loadHole(0);

describe('the hole map', () => {
  const view = buildHoleMapView({
    surfaces: hole1.surfaces,
    trees: hole1.trees,
    tee: hole1.tee!,
    pin: hole1.greenCentre!,
    width: 300,
    height: 420
  });

  it('runs the hole up the screen whichever way it lies on the terrain', () => {
    // Hole 1 happens to run up +z. The map must not care: the tee is at the
    // bottom because it is the tee, not because of which way the heightfield
    // was cropped.
    const tee = view.project(hole1.tee!);
    const pin = view.project(hole1.greenCentre!);

    expect(pin.y).toBeLessThan(tee.y);
  });

  it('draws the player\'s left on the left of the screen', () => {
    // Playing up +z the player's left hand is the +x side, matching the game's
    // aim convention. A mirrored map is worse than no map: it tells you to
    // bail out towards the trouble.
    const tee = hole1.tee!;
    const green = hole1.greenCentre!;
    const forward = { x: green.x - tee.x, z: green.z - tee.z };
    const length = Math.hypot(forward.x, forward.z);
    const left = { x: forward.z / length, z: -forward.x / length };

    const middle = { x: (tee.x + green.x) / 2, z: (tee.z + green.z) / 2 };
    const outLeft = { x: middle.x + left.x * 30, z: middle.z + left.z * 30 };
    const outRight = { x: middle.x - left.x * 30, z: middle.z - left.z * 30 };

    expect(view.project(outLeft).x).toBeLessThan(view.project(middle).x);
    expect(view.project(outRight).x).toBeGreaterThan(view.project(middle).x);
  });

  it('fits the whole hole inside the canvas', () => {
    for (const surface of hole1.surfaces) {
      for (const point of surface.points) {
        const at = view.project(point);
        expect(at.x, surface.id).toBeGreaterThanOrEqual(-0.01);
        expect(at.x, surface.id).toBeLessThanOrEqual(300.01);
        expect(at.y, surface.id).toBeGreaterThanOrEqual(-0.01);
        expect(at.y, surface.id).toBeLessThanOrEqual(420.01);
      }
    }
  });

  it('keeps one scale for both axes', () => {
    // Scaling the two axes separately would fit the canvas better and draw a
    // hole that is not this hole: a 30m-wide fairway would look 80m wide.
    const tee = hole1.tee!;
    const alongBy50 = view.project({ x: tee.x, z: tee.z + 50 });
    const teeAt = view.project(tee);
    const across = view.project({ x: tee.x + 50, z: tee.z });

    expect(Math.abs(teeAt.y - alongBy50.y)).toBeCloseTo(Math.abs(teeAt.x - across.x), 5);
  });

  it('reports how long and thin the hole is, so a canvas can be fitted to it', () => {
    expect(view.contentAspect).toBeLessThan(0.6);
    expect(view.contentAspect).toBeGreaterThan(0);
  });

  it('survives a hole with no geometry rather than dividing by nothing', () => {
    const empty = buildHoleMapView({
      surfaces: [],
      tee: { x: 5, z: 5 },
      pin: { x: 5, z: 5 },
      width: 100,
      height: 100
    });

    const at = empty.project({ x: 5, z: 5 });
    expect(Number.isFinite(at.x)).toBe(true);
    expect(Number.isFinite(at.y)).toBe(true);
  });
});

describe('distance markers', () => {
  it('counts every hundred metres from the tee', () => {
    const markers = distanceMarkers({ x: 0, z: 0 }, null, { x: 0, z: 337 });
    expect(markers.map((marker) => marker.metres)).toEqual([100, 200, 300]);
    expect(markers[0].at.x).toBeCloseTo(0, 6);
    expect(markers[0].at.z).toBeCloseTo(100, 6);
  });

  it('measures around a dogleg rather than across it', () => {
    // 200 on a hole that bends is 200 to the corner. Measured straight it would
    // be a number pointing through the trees.
    const markers = distanceMarkers({ x: 0, z: 0 }, { x: 0, z: 200 }, { x: 120, z: 260 });
    const at200 = markers.find((marker) => marker.metres === 200)!;

    expect(at200.at.x).toBeCloseTo(0, 5);
    expect(at200.at.z).toBeCloseTo(200, 5);
  });

  it('leaves off a marker that would sit on the green', () => {
    const markers = distanceMarkers({ x: 0, z: 0 }, null, { x: 0, z: 320 });
    expect(markers.map((marker) => marker.metres)).toEqual([100, 200]);
  });
});

describe('the flyby', () => {
  const flat = () => 10;

  it('starts behind the tee and finishes over the pin', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 0, z: 0 }, pin: { x: 0, z: 300 } });

    const start = flyby.frame();
    expect(start.position.z).toBeLessThan(0);

    flyby.update(HoleFlyby.DURATION_SECONDS);
    const end = flyby.frame();
    expect(end.position.x).toBeCloseTo(0, 3);
    expect(end.position.z).toBeCloseTo(300, 3);
  });

  it('looks ahead of itself all the way down the hole', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 0, z: 0 }, pin: { x: 0, z: 300 } });

    for (let step = 0; step < 5; step++) {
      const frame = flyby.frame();
      expect(frame.target.z).toBeGreaterThanOrEqual(frame.position.z);
      flyby.update(1);
    }
  });

  it('comes down as it goes, to show the green rather than the county', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 0, z: 0 }, pin: { x: 0, z: 300 } });

    const startHeight = flyby.frame().position.y;
    flyby.update(HoleFlyby.DURATION_SECONDS);
    const endHeight = flyby.frame().position.y;

    expect(startHeight).toBeGreaterThan(endHeight);
    expect(endHeight).toBeGreaterThan(10);
  });

  it('follows a dogleg round the corner instead of over the trees', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 0, z: 0 }, drivingLine: { x: 0, z: 200 }, pin: { x: 120, z: 260 } });

    // Half way through the move the camera should still be near the near side
    // of the corner, not out over the straight line to the pin.
    flyby.update(HoleFlyby.DURATION_SECONDS / 2);
    const half = flyby.frame();
    expect(half.position.x).toBeLessThan(40);
  });

  it('runs for its duration and then stops', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 0, z: 0 }, pin: { x: 0, z: 300 } });

    expect(flyby.isFinished()).toBe(false);
    expect(flyby.update(HoleFlyby.DURATION_SECONDS - 0.1)).toBe(true);
    expect(flyby.update(0.2)).toBe(false);
    expect(flyby.isFinished()).toBe(true);
    expect(flyby.progress()).toBe(1);
  });

  it('is skippable at any point without leaving the camera somewhere odd', () => {
    const flyby = new HoleFlyby(flat);
    flyby.begin({ tee: { x: 10, z: 10 }, pin: { x: 10, z: 310 } });

    flyby.update(1.3);
    const frame = flyby.frame();
    expect(Number.isFinite(frame.position.x)).toBe(true);
    expect(Number.isFinite(frame.position.y)).toBe(true);
    expect(Number.isFinite(frame.target.y)).toBe(true);
  });
});

describe('how the preview lays itself out', () => {
  const phone = { width: 390, height: 844 };
  const phoneLandscape = { width: 844, height: 390 };
  const desktop = { width: 1280, height: 800 };

  it('keeps the map up beside the flyby where there is room for both', () => {
    expect(previewLayoutFor(desktop, true)).toEqual({ compact: false, mapShown: true });
  });

  it('holds the map back on a phone, so the flyby is the thing on screen', () => {
    // The fault this pins: the card filled a phone end to end, so the camera
    // move it was captioning played entirely behind it. The preview showed a
    // drawing of the hole and hid the hole.
    expect(previewLayoutFor(phone, true)).toEqual({ compact: true, mapShown: false });
  });

  it('treats a landscape phone as narrow too', () => {
    // Wide enough by width, nowhere near tall enough: the card would still be
    // most of the screen.
    expect(previewLayoutFor(phoneLandscape, true)).toEqual({ compact: true, mapShown: false });
  });

  it('shows the map on a phone when the map is what was asked for', () => {
    // Opened from the HUD partway up a hole there is no flyby to cover, and
    // hiding the map behind a button would hide the only thing wanted.
    expect(previewLayoutFor(phone, false)).toEqual({ compact: true, mapShown: true });
  });
});
