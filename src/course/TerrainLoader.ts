import { TerrainData, TerrainMeta } from './TerrainData';

export class TerrainLoader {
  /**
   * Asynchronously load terrain metadata and binary heightfield from course directory path.
   * Example path: '/courses/warragul/hole-06'
   */
  public static async load(courseHolePath: string): Promise<TerrainData> {
    const metaUrl = `${courseHolePath}/terrain_meta.json`;

    // 1. Fetch metadata JSON
    let metaResponse: Response;
    try {
      metaResponse = await fetch(metaUrl);
    } catch (err) {
      throw new Error(`[TerrainLoader] Network failure fetching metadata from ${metaUrl}: ${err}`);
    }

    if (!metaResponse.ok) {
      throw new Error(`[TerrainLoader] Failed to load metadata from ${metaUrl} (Status: ${metaResponse.status} ${metaResponse.statusText})`);
    }

    const meta: TerrainMeta = await metaResponse.json();

    // 2. Validate metadata fields strictly
    this.validateMetadata(meta);

    // 3. Fully metadata-driven binary file path
    const binFileName = meta.binary.file;
    const binUrl = `${courseHolePath}/${binFileName}`;

    let binResponse: Response;
    try {
      binResponse = await fetch(binUrl);
    } catch (err) {
      throw new Error(`[TerrainLoader] Network failure fetching binary data from ${binUrl}: ${err}`);
    }

    if (!binResponse.ok) {
      throw new Error(
        `[TerrainLoader Binary Error]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Failed to load binary file ${binUrl} (Status: ${binResponse.status} ${binResponse.statusText})`
      );
    }

    const buffer = await binResponse.arrayBuffer();

    // 4. Validate binary size strictly with informative error message
    const expectedBytes = meta.binary.expectedBytes;
    if (buffer.byteLength !== expectedBytes) {
      throw new Error(
        `[TerrainLoader Binary Size Mismatch]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `File: ${binFileName}\n` +
        `Expected Value: ${expectedBytes} bytes (${meta.widthSamples}×${meta.heightSamples} Float32 = ${meta.binary.expectedValues} samples)\n` +
        `Actual Value: ${buffer.byteLength} bytes`
      );
    }

    // 5. Decode Float32 values with explicit Little-Endian DataView loop
    const totalSamples = meta.binary.expectedValues;
    const view = new DataView(buffer);
    const elevations = new Float32Array(totalSamples);

    let minOffset = Infinity;
    let maxOffset = -Infinity;

    for (let i = 0; i < totalSamples; i++) {
      const val = view.getFloat32(i * 4, true); // Explicit little-endian!
      if (!Number.isFinite(val)) {
        throw new Error(
          `[TerrainLoader Data Integrity Error]\n` +
          `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
          `Non-finite or NaN elevation sample found at index ${i} in ${binFileName}.`
        );
      }
      elevations[i] = val;
      if (val < minOffset) minOffset = val;
      if (val > maxOffset) maxOffset = val;
    }

    // 6. Compare actual decoded min/max elevation against metadata using tolerance
    const actualMinAbs = meta.baseElevationMetres + minOffset;
    const actualMaxAbs = meta.baseElevationMetres + maxOffset;
    const tolerance = 0.005; // 5mm tolerance for Float32 precision

    if (Math.abs(actualMinAbs - meta.minElevationMetres) > tolerance) {
      throw new Error(
        `[TerrainLoader Elevation Range Mismatch]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Minimum Absolute Elevation Mismatch:\n` +
        `Expected Value: ${meta.minElevationMetres.toFixed(4)} m\n` +
        `Actual Value: ${actualMinAbs.toFixed(4)} m (Difference: ${(actualMinAbs - meta.minElevationMetres).toFixed(6)} m)`
      );
    }

    if (Math.abs(actualMaxAbs - meta.maxElevationMetres) > tolerance) {
      throw new Error(
        `[TerrainLoader Elevation Range Mismatch]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Maximum Absolute Elevation Mismatch:\n` +
        `Expected Value: ${meta.maxElevationMetres.toFixed(4)} m\n` +
        `Actual Value: ${actualMaxAbs.toFixed(4)} m (Difference: ${(actualMaxAbs - meta.maxElevationMetres).toFixed(6)} m)`
      );
    }

    return new TerrainData(meta, elevations);
  }

  /**
   * Comprehensive validation of terrain metadata schema, dimensions, encoding, extents, and bounds.
   */
  public static validateMetadata(meta: TerrainMeta): void {
    const course = meta?.courseId || 'UNKNOWN_COURSE';
    const hole = meta?.holeId || 'UNKNOWN_HOLE';

    if (!meta) {
      throw new Error(`[TerrainLoader Metadata Error] Null or undefined metadata object provided.`);
    }

    if (!meta.courseId || typeof meta.courseId !== 'string') {
      throw new Error(`[TerrainLoader Metadata Error] Course: ${course}, Hole: ${hole}\nExpected non-empty string courseId.`);
    }

    if (!meta.holeId || typeof meta.holeId !== 'string') {
      throw new Error(`[TerrainLoader Metadata Error] Course: ${course}, Hole: ${hole}\nExpected non-empty string holeId.`);
    }

    if (!meta.sourceCRS || typeof meta.sourceCRS !== 'string') {
      throw new Error(`[TerrainLoader Metadata Error] Course: ${course}, Hole: ${hole}\nExpected non-empty string sourceCRS.`);
    }

    // Dimension checks: finite positive integers
    if (!Number.isInteger(meta.widthSamples) || meta.widthSamples <= 0) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected widthSamples to be a positive integer.\n` +
        `Actual Value: ${meta.widthSamples}`
      );
    }

    if (!Number.isInteger(meta.heightSamples) || meta.heightSamples <= 0) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected heightSamples to be a positive integer.\n` +
        `Actual Value: ${meta.heightSamples}`
      );
    }

    if (!Number.isFinite(meta.gridSpacingMetres) || meta.gridSpacingMetres <= 0) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected gridSpacingMetres to be a finite positive number.\n` +
        `Actual Value: ${meta.gridSpacingMetres}`
      );
    }

    if (!Number.isFinite(meta.baseElevationMetres)) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected baseElevationMetres to be a finite number.\n` +
        `Actual Value: ${meta.baseElevationMetres}`
      );
    }

    if (!Number.isFinite(meta.minElevationMetres) || !Number.isFinite(meta.maxElevationMetres) || meta.minElevationMetres > meta.maxElevationMetres) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected minElevationMetres <= maxElevationMetres as finite numbers.\n` +
        `Actual Value: min=${meta.minElevationMetres}, max=${meta.maxElevationMetres}`
      );
    }

    // Binary section validation
    if (!meta.binary) {
      throw new Error(`[TerrainLoader Metadata Error]\nCourse: ${course}, Hole: ${hole}\nMissing binary metadata section.`);
    }

    if (!meta.binary.file || typeof meta.binary.file !== 'string') {
      throw new Error(`[TerrainLoader Metadata Error]\nCourse: ${course}, Hole: ${hole}\nExpected non-empty binary.file.`);
    }

    if (meta.binary.type !== 'Float32') {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected binary.type: "Float32"\n` +
        `Actual Value: "${meta.binary.type}"`
      );
    }

    if (meta.binary.endianness !== 'little') {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected binary.endianness: "little"\n` +
        `Actual Value: "${meta.binary.endianness}"`
      );
    }

    if (meta.binary.order !== 'row-major') {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected binary.order: "row-major"\n` +
        `Actual Value: "${meta.binary.order}"`
      );
    }

    const expectedSamples = meta.widthSamples * meta.heightSamples;
    const expectedBytes = expectedSamples * 4;

    if (meta.binary.expectedValues !== expectedSamples) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected Values Count Mismatch:\n` +
        `Expected Value: ${expectedSamples} (widthSamples ${meta.widthSamples} * heightSamples ${meta.heightSamples})\n` +
        `Actual Value: ${meta.binary.expectedValues}`
      );
    }

    if (meta.binary.expectedBytes !== expectedBytes) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected Byte Count Mismatch:\n` +
        `Expected Value: ${expectedBytes} bytes\n` +
        `Actual Value: ${meta.binary.expectedBytes} bytes`
      );
    }

    // Source Bounds validation
    if (!meta.sourceBoundsMGA55) {
      throw new Error(`[TerrainLoader Metadata Error]\nCourse: ${course}, Hole: ${hole}\nMissing sourceBoundsMGA55 in metadata.`);
    }

    const { minEasting, maxEasting, minNorthing, maxNorthing } = meta.sourceBoundsMGA55;
    if (!Number.isFinite(minEasting) || !Number.isFinite(maxEasting) || minEasting >= maxEasting) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected finite ordered Easting bounds (minEasting < maxEasting).\n` +
        `Actual Value: minEasting=${minEasting}, maxEasting=${maxEasting}`
      );
    }

    if (!Number.isFinite(minNorthing) || !Number.isFinite(maxNorthing) || minNorthing >= maxNorthing) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `Expected finite ordered Northing bounds (minNorthing < maxNorthing).\n` +
        `Actual Value: minNorthing=${minNorthing}, maxNorthing=${maxNorthing}`
      );
    }

    // Axis Mapping and Extent validation
    if (!meta.axisMapping) {
      throw new Error(`[TerrainLoader Metadata Error]\nCourse: ${course}, Hole: ${hole}\nMissing axisMapping in metadata.`);
    }

    const expectedXExtent = (meta.widthSamples - 1) * meta.gridSpacingMetres;
    const expectedZExtent = (meta.heightSamples - 1) * meta.gridSpacingMetres;

    if (Math.abs(meta.axisMapping.worldXExtentMetres - expectedXExtent) > 0.001) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `worldXExtentMetres Mismatch:\n` +
        `Expected Value: ${expectedXExtent} m ((widthSamples - 1) * spacing)\n` +
        `Actual Value: ${meta.axisMapping.worldXExtentMetres} m`
      );
    }

    if (Math.abs(meta.axisMapping.worldZExtentMetres - expectedZExtent) > 0.001) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${course}, Hole: ${hole}\n` +
        `worldZExtentMetres Mismatch:\n` +
        `Expected Value: ${expectedZExtent} m ((heightSamples - 1) * spacing)\n` +
        `Actual Value: ${meta.axisMapping.worldZExtentMetres} m`
      );
    }
  }
}
