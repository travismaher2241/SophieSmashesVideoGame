import { TerrainData, TerrainMeta } from './TerrainData';

export class TerrainLoader {
  /**
   * Asynchronously load terrain metadata and binary heightfield from course directory path.
   * Example path: '/courses/warragul/hole-06'
   */
  public static async load(courseHolePath: string): Promise<TerrainData> {
    const metaUrl = `${courseHolePath}/terrain_meta.json`;

    // 1. Fetch metadata
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
    if (!meta.courseId || !meta.holeId || !meta.sourceCRS) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${meta.courseId || 'UNKNOWN'}, Hole: ${meta.holeId || 'UNKNOWN'}\n` +
        `Expected valid courseId, holeId, and sourceCRS, but received incomplete metadata headers.`
      );
    }

    if (!meta.widthSamples || !meta.heightSamples || !meta.gridSpacingMetres) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Expected dimensions (widthSamples, heightSamples, gridSpacingMetres), but received:\n` +
        `widthSamples=${meta.widthSamples}, heightSamples=${meta.heightSamples}, gridSpacingMetres=${meta.gridSpacingMetres}`
      );
    }

    if (!meta.binary || !meta.binary.file || !meta.binary.expectedBytes || !meta.binary.expectedValues) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Expected valid binary metadata block with file name and expected byte count.`
      );
    }

    const expectedSamples = meta.widthSamples * meta.heightSamples;
    const expectedBytes = expectedSamples * 4;

    if (meta.binary.expectedValues !== expectedSamples) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Expected values count mismatch: widthSamples (${meta.widthSamples}) * heightSamples (${meta.heightSamples}) = ${expectedSamples},\n` +
        `but meta.binary.expectedValues specified ${meta.binary.expectedValues}.`
      );
    }

    if (meta.binary.expectedBytes !== expectedBytes) {
      throw new Error(
        `[TerrainLoader Metadata Error]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `Expected byte count mismatch: expected ${expectedBytes} bytes,\n` +
        `but meta.binary.expectedBytes specified ${meta.binary.expectedBytes}.`
      );
    }

    // 3. Fully metadata-driven binary file path
    const binFileName = meta.binary.file; // Fully metadata-driven!
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
    if (buffer.byteLength !== expectedBytes) {
      throw new Error(
        `[TerrainLoader Binary Size Mismatch]\n` +
        `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
        `File: ${binFileName}\n` +
        `Expected Value: ${expectedBytes} bytes (${meta.widthSamples}×${meta.heightSamples} Float32 = ${expectedSamples} samples)\n` +
        `Actual Value: ${buffer.byteLength} bytes`
      );
    }

    // 5. Parse Float32Array (Little Endian row-major)
    const elevations = new Float32Array(buffer);

    // 6. Validate elevation values range against metadata and finite check
    let actualMin = Infinity;
    let actualMax = -Infinity;

    for (let i = 0; i < elevations.length; i++) {
      const val = elevations[i];
      if (!Number.isFinite(val)) {
        throw new Error(
          `[TerrainLoader Data Integrity Error]\n` +
          `Course: ${meta.courseId}, Hole: ${meta.holeId}\n` +
          `Non-finite or NaN elevation sample found at index ${i} in ${binFileName}.`
        );
      }
      const absElev = meta.baseElevationMetres + val;
      if (absElev < actualMin) actualMin = absElev;
      if (absElev > actualMax) actualMax = absElev;
    }

    return new TerrainData(meta, elevations);
  }
}
