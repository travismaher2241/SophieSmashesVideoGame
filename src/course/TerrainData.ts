export interface TerrainMeta {
  courseId: string;
  courseName: string;
  holeId: string;
  holeNumber: number;
  status: string;
  source: string;
  sourceCRS: string;
  sourceBoundsMGA55?: {
    minEasting: number;
    minNorthing: number;
    maxEasting: number;
    maxNorthing: number;
  };
  gridSpacingMetres: number;
  widthSamples: number;
  heightSamples: number;
  axisMapping?: {
    columns: string;
    rows: string;
    worldXExtentMetres: number;
    worldZExtentMetres: number;
    note?: string;
  };
  baseElevationMetres: number;
  minElevationMetres: number;
  maxElevationMetres: number;
  binary: {
    file: string;
    type: string;
    endianness: string;
    order: string;
    valueMeaning: string;
    expectedValues: number;
    expectedBytes: number;
  };
  verticalScaleDefault: number;
  warning?: string;
}

export class TerrainData {
  public readonly meta: TerrainMeta;
  public readonly elevations: Float32Array; // metres above baseElevationMetres

  public readonly widthSamples: number;
  public readonly heightSamples: number;
  public readonly gridSpacing: number;
  public readonly baseElevation: number;

  /** Physical vertex-to-vertex extent in world metres (samples - 1) * spacing */
  public readonly vertexExtentX: number;
  public readonly vertexExtentZ: number;

  /** Raster cell extent (samples * spacing) */
  public readonly cellExtentX: number;
  public readonly cellExtentZ: number;

  constructor(meta: TerrainMeta, elevations: Float32Array) {
    this.meta = meta;
    this.elevations = elevations;

    this.widthSamples = meta.widthSamples;
    this.heightSamples = meta.heightSamples;
    this.gridSpacing = meta.gridSpacingMetres;
    this.baseElevation = meta.baseElevationMetres;

    // Extent between sample centres: (samples - 1) * spacing
    this.vertexExtentX = (this.widthSamples - 1) * this.gridSpacing;
    this.vertexExtentZ = (this.heightSamples - 1) * this.gridSpacing;

    // Raster cell extent: samples * spacing
    this.cellExtentX = this.widthSamples * this.gridSpacing;
    this.cellExtentZ = this.heightSamples * this.gridSpacing;
  }

  /**
   * Get raw elevation offset (metres above baseElevation) at integer grid coordinates (col, row).
   * Col = world X index [0..widthSamples-1]
   * Row = world Z index [0..heightSamples-1]
   */
  public getElevationOffsetAtGrid(col: number, row: number): number {
    if (col < 0 || col >= this.widthSamples || row < 0 || row >= this.heightSamples) {
      throw new RangeError(`Terrain grid coordinate out of bounds: column ${col}, row ${row}`);
    }
    return this.elevations[row * this.widthSamples + col];
  }

  /**
   * Get absolute elevation in real metres (baseElevation + elevationOffset) at grid point (col, row).
   */
  public getAbsoluteElevationAtGrid(col: number, row: number): number {
    return this.baseElevation + this.getElevationOffsetAtGrid(col, row);
  }
}
