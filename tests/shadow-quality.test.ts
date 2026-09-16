import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHADOW_MAP_SIZE, shadowVolumeForCourse } from '../src/rendering/SceneManager';
import { SOPHIE_HILLS_CONFIG, Game } from '../src/game/Game';

/** Playable extent of each hole's own heightfield, in metres. */
function courseExtents() {
  return SOPHIE_HILLS_CONFIG.holes.map((_, index) => {
    const terrainPath = Game.resolveTerrainPath(SOPHIE_HILLS_CONFIG, index);
    const meta = JSON.parse(
      readFileSync(fileURLToPath(new URL(`../public${terrainPath}/terrain_meta.json`, import.meta.url)), 'utf8')
    );
    return {
      hole: index + 1,
      x: (meta.widthSamples - 1) * meta.gridSpacingMetres,
      z: (meta.heightSamples - 1) * meta.gridSpacingMetres
    };
  });
}

describe('sizing the shadow map to the course', () => {
  it('covers every hole it is pointed at', () => {
    for (const { hole, x, z } of courseExtents()) {
      const { extent } = shadowVolumeForCourse(x, z);

      // Measured from the middle of the course, so the volume has to reach the
      // far corner — and then some, because the sun is not overhead.
      expect(extent, `hole ${hole}`).toBeGreaterThan(Math.hypot(x, z) / 2);
    }
  });

  it('gives every hole a bias worth more than one of its own texels', () => {
    // This is the fix. A texel is the distance over which the map has no idea
    // what the ground is doing, so a bias smaller than one lets flat, sunlit
    // turf test as shadowed — the blotches on the greens, which crawled about as
    // the camera moved. Tying the bias to the texel means the long holes, whose
    // map is stretched further, get the larger nudge they need.
    for (const { hole, x, z } of courseExtents()) {
      const { texelMetres, normalBias } = shadowVolumeForCourse(x, z);

      expect(normalBias, `hole ${hole}`).toBeGreaterThan(texelMetres);
      // And not so large that shadows crawl away from what casts them.
      expect(normalBias, `hole ${hole}`).toBeLessThan(texelMetres * 2);
    }
  });

  it('wastes less of the map than covering a kilometre of nothing did', () => {
    // What it used to be stretched over, for comparison: 500m each way.
    const before = (500 * 2) / SHADOW_MAP_SIZE;

    for (const { hole, x, z } of courseExtents()) {
      expect(shadowVolumeForCourse(x, z).texelMetres, `hole ${hole}`).toBeLessThan(before);
    }
  });

  it('never collapses to nothing on a course of no size', () => {
    for (const [x, z] of [[0, 0], [-10, 20], [Number.NaN, 100]]) {
      const { extent } = shadowVolumeForCourse(x, z);

      expect(Number.isFinite(extent)).toBe(true);
      expect(extent).toBeGreaterThanOrEqual(60);
    }
  });
});
