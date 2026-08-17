import { TerrainData } from './TerrainData';

export interface GeoCoordinateResult {
  col: number;
  row: number;
  localX: number;
  localZ: number;
  absoluteElevation: number;
  eastingMGA55: number;
  northingOptionA: number; // Row 0 = maxNorthing (North)
  northingOptionB: number; // Row 0 = minNorthing (South)
  isNorthingProven: boolean;
  provenanceNote: string;
}

export class GeoTransform {
  private terrainData: TerrainData;

  constructor(terrainData: TerrainData) {
    this.terrainData = terrainData;
  }

  public setTerrainData(terrainData: TerrainData): void {
    this.terrainData = terrainData;
  }

  /**
   * Convert local world coordinates (x, z) to grid indices and EPSG:7855 Easting/Northing readouts.
   */
  public getGeoCoordinates(localX: number, localZ: number, absElevation: number): GeoCoordinateResult {
    const spacing = this.terrainData.gridSpacing;
    const meta = this.terrainData.meta;

    const col = Math.floor(localX / spacing);
    const row = Math.floor(localZ / spacing);

    if (!meta.sourceBoundsMGA55) {
      throw new Error(`[GeoTransform Error] Course ${meta.courseId} Hole ${meta.holeId} metadata missing sourceBoundsMGA55.`);
    }

    const minEasting = meta.sourceBoundsMGA55.minEasting;
    const minNorthing = meta.sourceBoundsMGA55.minNorthing;
    const maxNorthing = meta.sourceBoundsMGA55.maxNorthing;

    // Easting is proven (columns -> World X -> Easting)
    const eastingMGA55 = minEasting + localX;

    // Northing options (Row 0 orientation unproven from binary alone)
    const northingOptionA = maxNorthing - localZ; // Row 0 = North
    const northingOptionB = minNorthing + localZ; // Row 0 = South

    return {
      col: Math.max(0, Math.min(meta.widthSamples - 1, col)),
      row: Math.max(0, Math.min(meta.heightSamples - 1, row)),
      localX,
      localZ,
      absoluteElevation: absElevation,
      eastingMGA55,
      northingOptionA,
      northingOptionB,
      isNorthingProven: meta.axisMapping?.isNorthingProven ?? false,
      provenanceNote: meta.axisMapping?.note || 'Establishing row 0 as North vs South from raw GeoTIFF source data is BLOCKED as the original GeoTIFF/GIS file is not present in runtime workspace.'
    };
  }
}
