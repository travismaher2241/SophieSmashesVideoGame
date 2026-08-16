import { TerrainData } from './TerrainData';

export interface GeoCoordinateResult {
  col: number;
  row: number;
  localX: number;
  localZ: number;
  absoluteElevation: number;
  eastingMGA55: number;
  northingOptionA: number; // Row 0 = maxNorthing (5777580, North)
  northingOptionB: number; // Row 0 = minNorthing (5777260, South)
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

    const minEasting = meta.sourceBoundsMGA55?.minEasting ?? 405040;
    const minNorthing = meta.sourceBoundsMGA55?.minNorthing ?? 5777260;
    const maxNorthing = meta.sourceBoundsMGA55?.maxNorthing ?? 5777580;

    // Easting is proven (columns -> World X -> Easting)
    const eastingMGA55 = minEasting + localX;

    // Northing options (Row 0 orientation unproven in raw binary header)
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
      isNorthingProven: false,
      provenanceNote: 'Row-to-Northing direction is UNPROVEN from binary header metadata. Displaying both Option A (Row 0=North) and Option B (Row 0=South).'
    };
  }
}
