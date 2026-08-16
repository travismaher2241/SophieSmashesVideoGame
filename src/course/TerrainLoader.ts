import { TerrainData, TerrainMeta } from './TerrainData';

export class TerrainLoader {
  /**
   * Asynchronously load terrain_meta.json and terrain.bin from course directory path.
   * Example path: '/courses/warragul/hole-06'
   */
  public static async load(courseHolePath: string): Promise<TerrainData> {
    const metaUrl = `${courseHolePath}/terrain_meta.json`;
    const binUrl = `${courseHolePath}/terrain.bin`;

    // 1. Fetch metadata
    let metaResponse: Response;
    try {
      metaResponse = await fetch(metaUrl);
    } catch (err) {
      throw new Error(`Network failure fetching terrain metadata from ${metaUrl}: ${err}`);
    }

    if (!metaResponse.ok) {
      throw new Error(`Failed to load terrain metadata from ${metaUrl} (Status: ${metaResponse.status} ${metaResponse.statusText})`);
    }

    const meta: TerrainMeta = await metaResponse.json();

    // 2. Validate metadata fields
    if (!Number.isInteger(meta.widthSamples) || meta.widthSamples < 2 ||
        !Number.isInteger(meta.heightSamples) || meta.heightSamples < 2 ||
        !Number.isFinite(meta.gridSpacingMetres) || meta.gridSpacingMetres <= 0 ||
        !Number.isFinite(meta.baseElevationMetres)) {
      throw new Error(`Invalid terrain_meta.json: missing required dimensions (widthSamples, heightSamples, gridSpacingMetres)`);
    }

    const expectedSamples = meta.widthSamples * meta.heightSamples;
    const expectedBytes = expectedSamples * 4;

    // 3. Fetch binary heightfield
    let binResponse: Response;
    try {
      binResponse = await fetch(binUrl);
    } catch (err) {
      throw new Error(`Network failure fetching terrain binary data from ${binUrl}: ${err}`);
    }

    if (!binResponse.ok) {
      throw new Error(`Failed to load terrain binary data from ${binUrl} (Status: ${binResponse.status} ${binResponse.statusText})`);
    }

    const buffer = await binResponse.arrayBuffer();

    // 4. Validate binary size strictly
    if (buffer.byteLength !== expectedBytes) {
      throw new Error(
        `Terrain binary size mismatch in ${binUrl}!\n` +
        `Expected ${expectedBytes} bytes (${meta.widthSamples}×${meta.heightSamples} Float32 = ${expectedSamples} samples),\n` +
        `but received ${buffer.byteLength} bytes.`
      );
    }

    if (meta.binary?.type !== 'Float32' || meta.binary.endianness !== 'little' || meta.binary.order !== 'row-major') {
      throw new Error(
        `Unsupported terrain encoding in ${metaUrl}; expected little-endian, row-major Float32 data.`
      );
    }

    if (meta.binary.expectedValues !== expectedSamples || meta.binary.expectedBytes !== expectedBytes) {
      throw new Error(
        `Terrain metadata size declaration is inconsistent with its sample dimensions in ${metaUrl}.`
      );
    }

    // Parse explicitly as little-endian Float32 rather than relying on host byte order.
    const view = new DataView(buffer);
    const elevations = new Float32Array(expectedSamples);
    for (let index = 0; index < expectedSamples; index++) {
      const value = view.getFloat32(index * 4, true);
      if (!Number.isFinite(value)) {
        throw new Error(`Terrain binary contains a non-finite value at sample ${index}.`);
      }
      elevations[index] = value;
    }

    return new TerrainData(meta, elevations);
  }
}
