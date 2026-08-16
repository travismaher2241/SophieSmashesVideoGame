import { Vector3 } from 'three';
import { TerrainData } from './TerrainData';

export interface TerrainQueryResult {
  height: number;
  isOutOfBounds: boolean;
}

export class TerrainQuery {
  private terrainData: TerrainData;

  constructor(terrainData: TerrainData) {
    this.terrainData = terrainData;
  }

  /**
   * Update active terrain data
   */
  public setTerrainData(terrainData: TerrainData): void {
    this.terrainData = terrainData;
  }

  /**
   * Query local world Y in metres at world position (x, z).
   * World Y is the DEM offset above baseElevationMetres so it matches the mesh.
   * Uses bilinear interpolation across the 4 surrounding grid sample points.
   *
   * @param x Continuous world X position in metres [0..vertexExtentX]
   * @param z Continuous world Z position in metres [0..vertexExtentZ]
   * @param clampToBounds If true, clamps (x,z) to terrain bounds instead of marking out-of-bounds
   */
  public getTerrainHeight(x: number, z: number, clampToBounds: boolean = false): number {
    const res = this.queryTerrainHeight(x, z, clampToBounds);
    return res.height;
  }

  /**
   * Detailed terrain height query returning height and out-of-bounds flag.
   */
  public queryTerrainHeight(x: number, z: number, clampToBounds: boolean = false): TerrainQueryResult {
    const spacing = this.terrainData.gridSpacing;
    const maxX = this.terrainData.vertexExtentX;
    const maxZ = this.terrainData.vertexExtentZ;

    let targetX = x;
    let targetZ = z;
    let isOutOfBounds = false;

    if (x < 0 || x > maxX || z < 0 || z > maxZ) {
      isOutOfBounds = true;
      if (clampToBounds) {
        targetX = Math.max(0, Math.min(maxX, x));
        targetZ = Math.max(0, Math.min(maxZ, z));
      } else {
        return { height: Number.NaN, isOutOfBounds: true };
      }
    }

    // Grid continuous float indices
    const gx = targetX / spacing;
    const gz = targetZ / spacing;

    const col0 = Math.min(Math.floor(gx), this.terrainData.widthSamples - 1);
    const row0 = Math.min(Math.floor(gz), this.terrainData.heightSamples - 1);

    const col1 = Math.min(col0 + 1, this.terrainData.widthSamples - 1);
    const row1 = Math.min(row0 + 1, this.terrainData.heightSamples - 1);

    const tx = gx - col0;
    const tz = gz - row0;

    const h00 = this.terrainData.getElevationOffsetAtGrid(col0, row0);
    const h10 = this.terrainData.getElevationOffsetAtGrid(col1, row0);
    const h01 = this.terrainData.getElevationOffsetAtGrid(col0, row1);
    const h11 = this.terrainData.getElevationOffsetAtGrid(col1, row1);

    // Bilinear interpolation
    const interpolatedHeight =
      (1 - tx) * (1 - tz) * h00 +
      tx * (1 - tz) * h10 +
      (1 - tx) * tz * h01 +
      tx * tz * h11;

    return {
      height: interpolatedHeight,
      isOutOfBounds
    };
  }

  /**
   * Calculate unit surface normal vector at world position (x, z) using partial derivatives.
   * Useful for slope calculations, ball bounce, and ball roll physics.
   */
  public getTerrainNormal(x: number, z: number, targetVector?: Vector3): Vector3 {
    const normal = targetVector || new Vector3();
    const spacing = this.terrainData.gridSpacing;
    const maxX = this.terrainData.vertexExtentX;
    const maxZ = this.terrainData.vertexExtentZ;

    const targetX = Math.max(0, Math.min(maxX, x));
    const targetZ = Math.max(0, Math.min(maxZ, z));

    const gx = targetX / spacing;
    const gz = targetZ / spacing;

    const col0 = Math.min(Math.floor(gx), this.terrainData.widthSamples - 1);
    const row0 = Math.min(Math.floor(gz), this.terrainData.heightSamples - 1);

    const col1 = Math.min(col0 + 1, this.terrainData.widthSamples - 1);
    const row1 = Math.min(row0 + 1, this.terrainData.heightSamples - 1);

    const tx = gx - col0;
    const tz = gz - row0;

    const h00 = this.terrainData.getElevationOffsetAtGrid(col0, row0);
    const h10 = this.terrainData.getElevationOffsetAtGrid(col1, row0);
    const h01 = this.terrainData.getElevationOffsetAtGrid(col0, row1);
    const h11 = this.terrainData.getElevationOffsetAtGrid(col1, row1);

    // Partial derivatives with respect to X and Z
    const dhdx = ((1 - tz) * (h10 - h00) + tz * (h11 - h01)) / spacing;
    const dhdz = ((1 - tx) * (h01 - h00) + tx * (h11 - h10)) / spacing;

    // Surface normal: (-dh/dx, 1, -dh/dz) normalized
    normal.set(-dhdx, 1.0, -dhdz).normalize();

    return normal;
  }
}
