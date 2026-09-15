import { Vector3 } from 'three';
import { TerrainData } from './TerrainData';

export interface TerrainQueryResult {
  height: number;
  isOutOfBounds: boolean;
}

export interface TerrainNormalResult {
  normal: Vector3;
  isOutOfBounds: boolean;
}

export class TerrainQuery {
  private terrainData: TerrainData;

  constructor(terrainData: TerrainData) {
    this.terrainData = terrainData;
  }

  public setTerrainData(terrainData: TerrainData): void {
    this.terrainData = terrainData;
  }

  /**
   * Playable extent of the loaded heightfield in metres. Callers that place
   * objects on the terrain need this to cull anything off the edge — hard-coded
   * bounds break as soon as a hole ships its own differently-sized terrain.
   */
  public getWorldExtent(): { x: number; z: number } {
    return { x: this.terrainData.vertexExtentX, z: this.terrainData.vertexExtentZ };
  }

  /**
   * Query local world Y in metres at world position (x, z).
   * World Y is the DEM offset above baseElevationMetres matching the mesh.
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
   * Calculate unit surface normal vector at world position (x, z).
   */
  public getTerrainNormal(x: number, z: number, targetVector?: Vector3, clampToBounds: boolean = true): Vector3 {
    const res = this.queryTerrainNormal(x, z, targetVector, clampToBounds);
    return res.normal;
  }

  /**
   * Detailed surface normal query returning normal vector and out-of-bounds flag.
   */
  public queryTerrainNormal(x: number, z: number, targetVector?: Vector3, clampToBounds: boolean = false): TerrainNormalResult {
    const normal = targetVector || new Vector3();
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
        normal.set(0, 1, 0);
        return { normal, isOutOfBounds: true };
      }
    }

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

    const dhdx = ((1 - tz) * (h10 - h00) + tz * (h11 - h01)) / spacing;
    const dhdz = ((1 - tx) * (h01 - h00) + tx * (h11 - h10)) / spacing;

    normal.set(-dhdx, 1.0, -dhdz).normalize();

    return { normal, isOutOfBounds };
  }
}
