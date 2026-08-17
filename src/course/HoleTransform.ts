import { TerrainMeta } from './TerrainData';

export type VerificationLevel =
  | 'verified-from-source-data'
  | 'estimated-from-official-map'
  | 'estimated-from-reference-image'
  | 'provisional'
  | 'unverified';

export interface SourceGISPosition {
  easting: number;
  northing: number;
  elevation: number;
  crs: string; // e.g. "EPSG:7855"
}

export interface LocalGamePosition {
  x: number;
  y: number; // elevation offset above base elevation
  z: number;
}

export interface CourseFeaturePosition {
  name: string;
  sourcePosition: SourceGISPosition;
  localPosition: LocalGamePosition;
  verification: VerificationLevel;
  notes?: string;
}

/**
 * Mathematically exact bidirectional coordinate transform between:
 * - Source GIS (EPSG:7855 Easting, Northing, Elevation)
 * - Local Game World (Three.js X, Y, Z in metres)
 *
 * Distinguishes:
 * 1. Raster outer bounds (e.g. 405040..405820, 5777260..5777580)
 * 2. Vertex sample-centre coordinates (span: 778m x 318m across 390x160 samples at 2m spacing)
 */
export class HoleTransform {
  public readonly minEasting: number;
  public readonly maxEasting: number;
  public readonly minNorthing: number;
  public readonly maxNorthing: number;
  public readonly gridSpacing: number;
  public readonly widthSamples: number;
  public readonly heightSamples: number;
  public readonly baseElevation: number;
  public readonly crs: string;

  /** Physical vertex-to-vertex span in metres: (samples - 1) * spacing */
  public readonly vertexSpanX: number;
  public readonly vertexSpanZ: number;

  constructor(meta: TerrainMeta) {
    if (!meta.sourceBoundsMGA55) {
      throw new Error(`[HoleTransform Error] Missing sourceBoundsMGA55 in course metadata.`);
    }

    this.minEasting = meta.sourceBoundsMGA55.minEasting;
    this.maxEasting = meta.sourceBoundsMGA55.maxEasting;
    this.minNorthing = meta.sourceBoundsMGA55.minNorthing;
    this.maxNorthing = meta.sourceBoundsMGA55.maxNorthing;
    this.gridSpacing = meta.gridSpacingMetres;
    this.widthSamples = meta.widthSamples;
    this.heightSamples = meta.heightSamples;
    this.baseElevation = meta.baseElevationMetres;
    this.crs = meta.sourceCRS;

    this.vertexSpanX = (this.widthSamples - 1) * this.gridSpacing; // 778m
    this.vertexSpanZ = (this.heightSamples - 1) * this.gridSpacing; // 318m
  }

  /**
   * Convert Source GIS Coordinate (EPSG:7855 Easting, Northing, Absolute Elevation) to Local Game Coordinates (X, Y, Z).
   */
  public sourceToLocal(easting: number, northing: number, absoluteElevation: number): LocalGamePosition {
    const localX = easting - this.minEasting;
    const localZ = this.maxNorthing - northing;
    const localY = absoluteElevation - this.baseElevation;

    return { x: localX, y: localY, z: localZ };
  }

  /**
   * Convert Local Game Position (X, Y, Z) to Source GIS Position (EPSG:7855 Easting, Northing, Absolute Elevation).
   */
  public localToSource(x: number, y: number, z: number): SourceGISPosition {
    const easting = this.minEasting + x;
    const northing = this.maxNorthing - z;
    const elevation = this.baseElevation + y;

    return {
      easting,
      northing,
      elevation,
      crs: this.crs
    };
  }

  /**
   * Calculate exact sample-centre GIS coordinates for grid index (col, row).
   */
  public getSampleCentreGIS(col: number, row: number, elevationOffset: number = 0): SourceGISPosition {
    const localX = col * this.gridSpacing;
    const localZ = row * this.gridSpacing;
    return this.localToSource(localX, elevationOffset, localZ);
  }

  /**
   * Calculate true horizontal plan distance in metres between two GIS or Local positions.
   */
  public calculateHorizontalDistance(posA: { x: number; z: number }, posB: { x: number; z: number }): number {
    return Math.hypot(posB.x - posA.x, posB.z - posA.z);
  }
}
