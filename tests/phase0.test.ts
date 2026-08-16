import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TerrainData, TerrainMeta } from '../src/course/TerrainData';
import { TerrainLoader } from '../src/course/TerrainLoader';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainMeshBuilder } from '../src/rendering/TerrainMeshBuilder';

describe('Phase 0 — Real DEM Terrain Verification & Loader Suite', () => {
  const courseDir = path.resolve(__dirname, '../public/courses/warragul/hole-06');
  const metaPath = path.join(courseDir, 'terrain_meta.json');
  const binPath = path.join(courseDir, 'terrain.bin');

  let validMeta: TerrainMeta;
  let validBinBuffer: Buffer;

  beforeEach(() => {
    validMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    validBinBuffer = fs.readFileSync(binPath);
  });

  // Helper to mock global fetch for TerrainLoader
  function mockFetch(metaObj: any, arrayBuffer: ArrayBuffer) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('.json')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(metaObj)
        });
      } else if (url.endsWith('.bin')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: () => Promise.resolve(arrayBuffer)
        });
      }
      return Promise.reject(new Error(`404 Not Found: ${url}`));
    }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('1. TerrainLoader End-to-End Loading & Explicit Little-Endian Decoding', () => {
    it('successfully loads valid course DEM using metadata-driven TerrainLoader', async () => {
      mockFetch(validMeta, validBinBuffer.buffer.slice(validBinBuffer.byteOffset, validBinBuffer.byteOffset + validBinBuffer.byteLength));

      const terrainData = await TerrainLoader.load('/courses/warragul/hole-06');

      expect(terrainData).toBeInstanceOf(TerrainData);
      expect(terrainData.widthSamples).toBe(390);
      expect(terrainData.heightSamples).toBe(160);
      expect(terrainData.gridSpacing).toBe(2.0);
      expect(terrainData.vertexExtentX).toBe(778.0);
      expect(terrainData.vertexExtentZ).toBe(318.0);
      expect(terrainData.elevations.length).toBe(62400);

      // Verify explicit Little-Endian decoding match
      const view = new DataView(validBinBuffer.buffer, validBinBuffer.byteOffset, validBinBuffer.byteLength);
      for (let i = 0; i < 100; i++) {
        expect(terrainData.elevations[i]).toBe(view.getFloat32(i * 4, true));
      }
    });

    it('rejects binary file if type is not Float32', async () => {
      const badMeta = { ...validMeta, binary: { ...validMeta.binary, type: 'Int16' } };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected binary\.type: "Float32"[\s\S]*Actual Value: "Int16"/
      );
    });

    it('rejects binary file if endianness is not little', async () => {
      const badMeta = { ...validMeta, binary: { ...validMeta.binary, endianness: 'big' } };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected binary\.endianness: "little"[\s\S]*Actual Value: "big"/
      );
    });

    it('rejects binary file if order is not row-major', async () => {
      const badMeta = { ...validMeta, binary: { ...validMeta.binary, order: 'column-major' } };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected binary\.order: "row-major"[\s\S]*Actual Value: "column-major"/
      );
    });

    it('rejects malformed dimensions (non-integer widthSamples)', async () => {
      const badMeta = { ...validMeta, widthSamples: 390.5 };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected widthSamples to be a positive integer/
      );
    });

    it('rejects negative or zero gridSpacingMetres', async () => {
      const badMeta = { ...validMeta, gridSpacingMetres: -2.0 };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected gridSpacingMetres to be a finite positive number/
      );
    });

    it('rejects binary with incorrect byte size', async () => {
      const truncatedBuffer = validBinBuffer.buffer.slice(0, 1000);
      mockFetch(validMeta, truncatedBuffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Binary Size Mismatch[\s\S]*Expected Value: 249600 bytes[\s\S]*Actual Value: 1000 bytes/
      );
    });

    it('rejects binary containing NaN or non-finite float samples', async () => {
      const corruptBuf = new ArrayBuffer(249600);
      const floatView = new Float32Array(corruptBuf);
      floatView[50] = NaN; // Corrupt sample

      mockFetch(validMeta, corruptBuf);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Non-finite or NaN elevation sample found at index 50/
      );
    });

    it('rejects metadata if actual minimum elevation does not match minElevationMetres', async () => {
      const badMeta = { ...validMeta, minElevationMetres: 130.0 }; // Real min is ~114.88m
      mockFetch(badMeta, validBinBuffer.buffer.slice(validBinBuffer.byteOffset, validBinBuffer.byteOffset + validBinBuffer.byteLength));

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Minimum Absolute Elevation Mismatch[\s\S]*Expected Value: 130\.0000 m[\s\S]*Actual Value: 114\.8775 m/
      );
    });

    it('rejects metadata if actual maximum elevation does not match maxElevationMetres', async () => {
      const badMeta = { ...validMeta, maxElevationMetres: 140.0 }; // Real max is ~152.16m
      mockFetch(badMeta, validBinBuffer.buffer.slice(validBinBuffer.byteOffset, validBinBuffer.byteOffset + validBinBuffer.byteLength));

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Maximum Absolute Elevation Mismatch[\s\S]*Expected Value: 140\.0000 m[\s\S]*Actual Value: 152\.1575 m/
      );
    });

    it('rejects metadata with missing or disordered sourceBoundsMGA55', async () => {
      const badMeta = {
        ...validMeta,
        sourceBoundsMGA55: { minEasting: 405820, maxEasting: 405040, minNorthing: 5777260, maxNorthing: 5777580 }
      };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /Expected finite ordered Easting bounds \(minEasting < maxEasting\)/
      );
    });

    it('rejects metadata with mismatched axis extent (not (samples - 1) * spacing)', async () => {
      const badMeta = {
        ...validMeta,
        axisMapping: {
          ...validMeta.axisMapping,
          worldXExtentMetres: 780.0 // Mismatched (should be 778.0m for 390 samples at 2m)
        }
      };
      mockFetch(badMeta, validBinBuffer.buffer);

      await expect(TerrainLoader.load('/courses/warragul/hole-06')).rejects.toThrow(
        /worldXExtentMetres Mismatch[\s\S]*Expected Value: 778 m/
      );
    });
  });

  describe('2. Terrain Query & Bilinear Interpolation', () => {
    let terrainData: TerrainData;
    let query: TerrainQuery;

    beforeEach(() => {
      const floatArray = new Float32Array(
        validBinBuffer.buffer,
        validBinBuffer.byteOffset,
        validBinBuffer.byteLength / 4
      );
      terrainData = new TerrainData(validMeta, floatArray);
      query = new TerrainQuery(terrainData);
    });

    it('verifies exact height at integer grid corners', () => {
      // Top-Left (0, 0)
      const h00 = terrainData.getElevationOffsetAtGrid(0, 0);
      expect(query.getTerrainHeight(0, 0)).toBe(h00);

      // Bottom-Right (389, 159) at (778m, 318m)
      const hBR = terrainData.getElevationOffsetAtGrid(389, 159);
      expect(query.getTerrainHeight(778, 318)).toBe(hBR);
    });

    it('verifies bilinear interpolation calculations between samples', () => {
      const h00 = terrainData.getElevationOffsetAtGrid(10, 20);
      const h10 = terrainData.getElevationOffsetAtGrid(11, 20);
      const h01 = terrainData.getElevationOffsetAtGrid(10, 21);
      const h11 = terrainData.getElevationOffsetAtGrid(11, 21);

      // Query midpoint at (10.5 * 2m, 20.5 * 2m) = (21m, 41m)
      const expectedMidpoint = 0.25 * (h00 + h10 + h01 + h11);
      const res = query.queryTerrainHeight(21.0, 41.0);

      expect(res.height).toBeCloseTo(expectedMidpoint, 5);
      expect(res.isOutOfBounds).toBe(false);
    });

    it('verifies explicit out-of-bounds reporting when clampToBounds is false', () => {
      // Out of bounds negative X
      const resNegX = query.queryTerrainHeight(-1.0, 50.0, false);
      expect(resNegX.isOutOfBounds).toBe(true);
      expect(Number.isNaN(resNegX.height)).toBe(true);

      // Out of bounds exceeded X (> 778m)
      const resPosX = query.queryTerrainHeight(779.0, 50.0, false);
      expect(resPosX.isOutOfBounds).toBe(true);
      expect(Number.isNaN(resPosX.height)).toBe(true);

      // Normal query out of bounds
      const resNorm = query.queryTerrainNormal(-5.0, 50.0, undefined, false);
      expect(resNorm.isOutOfBounds).toBe(true);
    });

    it('verifies clamping behavior when clampToBounds is true', () => {
      const h00 = terrainData.getElevationOffsetAtGrid(0, 0);
      const resClamped = query.queryTerrainHeight(-10.0, -10.0, true);
      expect(resClamped.height).toBe(h00);
      expect(resClamped.isOutOfBounds).toBe(true);
    });
  });

  describe('3. Detailed 3D Mesh Geometry & Vertex Coordinates Verification', () => {
    let terrainData: TerrainData;

    beforeEach(() => {
      const floatArray = new Float32Array(
        validBinBuffer.buffer,
        validBinBuffer.byteOffset,
        validBinBuffer.byteLength / 4
      );
      terrainData = new TerrainData(validMeta, floatArray);
    });

    it('verifies mesh vertex count, triangle count, and physical vertex positions', () => {
      const meshBuilder = new TerrainMeshBuilder(terrainData);
      const mesh = meshBuilder.getMesh();
      const geo = mesh.geometry;

      const posAttr = geo.getAttribute('position');
      const indexAttr = geo.getIndex();

      expect(posAttr.count).toBe(62400); // 390 * 160 vertices
      expect(indexAttr).not.toBeNull();

      // (390-1) * (160-1) * 2 = 389 * 159 * 2 = 123,702 triangles
      const triangleCount = indexAttr!.count / 3;
      expect(triangleCount).toBe(123702);

      // Verify corner 0 (Col 0, Row 0): Position (0, elev(0,0), 0)
      expect(posAttr.getX(0)).toBe(0);
      expect(posAttr.getY(0)).toBeCloseTo(terrainData.getElevationOffsetAtGrid(0, 0), 4);
      expect(posAttr.getZ(0)).toBe(0);

      // Verify Top-Right corner (Col 389, Row 0): Position (778, elev(389,0), 0)
      const trIdx = 389;
      expect(posAttr.getX(trIdx)).toBe(778);
      expect(posAttr.getY(trIdx)).toBeCloseTo(terrainData.getElevationOffsetAtGrid(389, 0), 4);
      expect(posAttr.getZ(trIdx)).toBe(0);

      // Verify Bottom-Left corner (Col 0, Row 159): Position (0, elev(0,159), 318)
      const blIdx = 159 * 390;
      expect(posAttr.getX(blIdx)).toBe(0);
      expect(posAttr.getY(blIdx)).toBeCloseTo(terrainData.getElevationOffsetAtGrid(0, 159), 4);
      expect(posAttr.getZ(blIdx)).toBe(318);

      // Verify Bottom-Right corner (Col 389, Row 159): Position (778, elev(389,159), 318)
      const brIdx = 159 * 390 + 389;
      expect(posAttr.getX(brIdx)).toBe(778);
      expect(posAttr.getY(brIdx)).toBeCloseTo(terrainData.getElevationOffsetAtGrid(389, 159), 4);
      expect(posAttr.getZ(brIdx)).toBe(318);
    });

    it('verifies 1:1 true scale and vertical scale exaggeration', () => {
      const meshBuilder = new TerrainMeshBuilder(terrainData);
      expect(meshBuilder.getVerticalScale()).toBe(1.0);

      // Scale to 2.0x
      meshBuilder.setVerticalScale(2.0);
      expect(meshBuilder.getVerticalScale()).toBe(2.0);

      const mesh = meshBuilder.getMesh();
      const posAttr = mesh.geometry.getAttribute('position');

      // Elevation should be doubled at index 0
      const expectedY2x = terrainData.getElevationOffsetAtGrid(0, 0) * 2.0;
      expect(posAttr.getY(0)).toBeCloseTo(expectedY2x, 4);

      // Reset back to 1.0x
      meshBuilder.setVerticalScale(1.0);
      expect(posAttr.getY(0)).toBeCloseTo(terrainData.getElevationOffsetAtGrid(0, 0), 4);
    });
  });
});
