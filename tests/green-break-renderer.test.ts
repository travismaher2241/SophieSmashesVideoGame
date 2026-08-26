import { describe, expect, it } from 'vitest';
import { Points, Vector3 } from 'three';
import { TerrainData } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { GreenBreakRenderer } from '../src/rendering/GreenBreakRenderer';

function createSlopedTerrain(): TerrainQuery {
  const width = 40;
  const height = 40;
  const values = new Float32Array(width * height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) values[z * width + x] = x * 0.03 - z * 0.015;
  }
  const meta = {
    courseId: 'break-test', status: 'test', gridSpacingMetres: 1,
    widthSamples: width, heightSamples: height, baseElevationMetres: 0,
    minElevationMetres: 0, maxElevationMetres: 2,
    axisMapping: { worldXExtentMetres: width - 1, worldZExtentMetres: height - 1 }
  };
  return new TerrainQuery(new TerrainData(meta as any, values));
}

describe('GreenBreakRenderer', () => {
  it('flows in the same downhill direction used by putting physics', () => {
    const terrain = createSlopedTerrain();
    const renderer = new GreenBreakRenderer(terrain);
    renderer.generateGrid(new Vector3(18, 0, 18), new Vector3(22, 0, 22), 2);

    const dot = (renderer as any).dots[0];
    const normal = terrain.getTerrainNormal(dot.origX, dot.origZ);
    const horizontalMagnitude = Math.hypot(normal.x, normal.z);

    expect(dot.dirX).toBeCloseTo(normal.x / horizontalMagnitude, 6);
    expect(dot.dirZ).toBeCloseTo(normal.z / horizontalMagnitude, 6);
    expect(dot.dirX).toBeLessThan(0); // Height rises toward +X, so downhill is -X.
    expect(dot.dirZ).toBeGreaterThan(0); // Height falls toward +Z.
  });

  it('renders a bright bead over a larger dark outline', () => {
    const renderer = new GreenBreakRenderer(createSlopedTerrain());
    renderer.generateGrid(new Vector3(18, 0, 18), new Vector3(22, 0, 22), 2);
    const layers = renderer.getGroup().children as Points[];

    expect(layers).toHaveLength(2);
    expect((layers[0].material as any).size).toBeGreaterThan((layers[1].material as any).size);
    expect((layers[1].material as any).opacity).toBe(1);
  });
});
