import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SurfaceQuery, SurfacePolygon } from '../src/course/SurfaceQuery';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';

interface Hole {
  surfaces: SurfacePolygon[];
  greenCentre: { x: number; z: number };
}

function loadHole(index: number): Hole {
  const path = SOPHIE_HILLS_CONFIG.holes[index].holePath;
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../public${path}/hole.json`, import.meta.url)), 'utf8')
  );
}

/** Points on a half-metre grid inside a polygon's bounding box that are in it. */
function samplePolygon(query: SurfaceQuery, polygon: SurfacePolygon) {
  const xs = polygon.points.map((p) => p.x);
  const zs = polygon.points.map((p) => p.z);
  const inside: { x: number; z: number; lie: string }[] = [];

  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.5) {
      const lie = query.getLieAt(x, z).type;
      // Any of the mown types means the point is on this shape or one drawn over
      // it; what matters is that it is not called water.
      if (lie !== 'ROUGH' && lie !== 'GENERAL_AREA' && lie !== 'FIRST_CUT') {
        inside.push({ x, z, lie });
      }
    }
  }

  return inside;
}

describe.each(SOPHIE_HILLS_CONFIG.holes.map((hole, index) => [index + 1, index] as const))(
  'hole %i hazards',
  (number, index) => {
    const hole = loadHole(index);
    const query = new SurfaceQuery(hole.surfaces);

    it('never calls a ball on the green a water hazard', () => {
      // The bug this guards: hole 2's creek was drawn across the front fifth of
      // its green, and water outranks green in the lie lookup — so a shot that
      // pitched on the putting surface was fished out and penalised a stroke.
      const green = hole.surfaces.find((surface) => surface.type === 'GREEN');
      expect(green, `hole ${number} has a green`).toBeDefined();

      const wet = samplePolygon(query, green!).filter((point) => point.lie === 'WATER');

      expect(wet.slice(0, 3)).toEqual([]);
    });

    it('never calls a ball on the fringe or the tee a water hazard', () => {
      for (const type of ['FRINGE', 'TEE'] as const) {
        const surface = hole.surfaces.find((entry) => entry.type === type);
        if (!surface) continue;

        const wet = samplePolygon(query, surface).filter((point) => point.lie === 'WATER');
        expect(wet.slice(0, 3), `hole ${number} ${type}`).toEqual([]);
      }
    });

    it('leaves the pin itself on the putting surface', () => {
      expect(query.getLieAt(hole.greenCentre.x, hole.greenCentre.z).type).toBe('GREEN');
    });
  }
);
