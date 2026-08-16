import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TerrainData, TerrainMeta } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainMeshBuilder } from '../src/rendering/TerrainMeshBuilder';

describe('Phase 0 — Real DEM Terrain Verification Suite', () => {
  const courseDir = path.resolve(__dirname, '../public/courses/warragul/hole-06');
  const metaPath = path.join(courseDir, 'terrain_meta.json');
  
  it('1. Verifies metadata JSON integrity and required headers', () => {
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    expect(meta.courseId).toBe('warragul');
    expect(meta.holeId).toBe('hole-06');
    expect(meta.widthSamples).toBe(390);
    expect(meta.heightSamples).toBe(160);
    expect(meta.gridSpacingMetres).toBe(2.0);
    expect(meta.sourceCRS).toBe('EPSG:7855');
    expect(meta.binary.file).toBe('terrain.bin');
    expect(meta.binary.expectedValues).toBe(62400);
    expect(meta.binary.expectedBytes).toBe(249600);
  });

  it('2. Verifies binary file size is exactly 249,600 bytes and contains 62,400 finite Float32 samples', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binPath = path.join(courseDir, meta.binary.file);
    expect(fs.existsSync(binPath)).toBe(true);

    const binBuffer = fs.readFileSync(binPath);
    expect(binBuffer.byteLength).toBe(249600);

    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );
    expect(floatArray.length).toBe(62400);

    for (let i = 0; i < floatArray.length; i++) {
      expect(Number.isFinite(floatArray[i])).toBe(true);
    }
  });

  it('3. Verifies metadata min/max elevation agreement with binary values', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    let minOffset = Infinity;
    let maxOffset = -Infinity;

    for (let i = 0; i < floatArray.length; i++) {
      if (floatArray[i] < minOffset) minOffset = floatArray[i];
      if (floatArray[i] > maxOffset) maxOffset = floatArray[i];
    }

    const calculatedMinAbs = meta.baseElevationMetres + minOffset;
    const calculatedMaxAbs = meta.baseElevationMetres + maxOffset;

    expect(calculatedMinAbs).toBeCloseTo(meta.minElevationMetres, 4);
    expect(calculatedMaxAbs).toBeCloseTo(meta.maxElevationMetres, 4);
  });

  it('4. Verifies row-major indexing and 778m x 318m vertex extent', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    const terrainData = new TerrainData(meta, floatArray);

    expect(terrainData.vertexExtentX).toBe(778.0); // (390-1) * 2
    expect(terrainData.vertexExtentZ).toBe(318.0); // (160-1) * 2

    // Test row-major indexing: index = row * width + col
    const col = 10;
    const row = 5;
    const expectedIndex = row * 390 + col;
    expect(terrainData.getElevationOffsetAtGrid(col, row)).toBe(floatArray[expectedIndex]);
  });

  it('5. Verifies bilinear interpolation math across grid cell corners', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    const terrainData = new TerrainData(meta, floatArray);
    const query = new TerrainQuery(terrainData);

    // Midpoint between Grid (0,0) and Grid (1,0) at (1.0m, 0.0m)
    const h00 = terrainData.getElevationOffsetAtGrid(0, 0);
    const h10 = terrainData.getElevationOffsetAtGrid(1, 0);
    const expectedMidpoint = (h00 + h10) / 2;

    const queryResult = query.queryTerrainHeight(1.0, 0.0);
    expect(queryResult.height).toBeCloseTo(expectedMidpoint, 5);
    expect(queryResult.isOutOfBounds).toBe(false);
  });

  it('6. Verifies out-of-bounds handling for height and normal queries', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    const terrainData = new TerrainData(meta, floatArray);
    const query = new TerrainQuery(terrainData);

    // Negative coordinate
    const hNegative = query.queryTerrainHeight(-10, 50, false);
    expect(hNegative.isOutOfBounds).toBe(true);
    expect(Number.isNaN(hNegative.height)).toBe(true);

    // Beyond max extent (X > 778m)
    const hExceeded = query.queryTerrainHeight(800, 100, false);
    expect(hExceeded.isOutOfBounds).toBe(true);
    expect(Number.isNaN(hExceeded.height)).toBe(true);

    // Normal query out of bounds
    const nExceeded = query.queryTerrainNormal(800, 100, undefined, false);
    expect(nExceeded.isOutOfBounds).toBe(true);
  });

  it('7. Verifies 3D mesh geometry contains 62,400 vertices and exactly 123,702 triangles', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    const terrainData = new TerrainData(meta, floatArray);
    const meshBuilder = new TerrainMeshBuilder(terrainData);
    const mesh = meshBuilder.getMesh();
    const geo = mesh.geometry;

    const posAttr = geo.getAttribute('position');
    const indexAttr = geo.getIndex();

    expect(posAttr.count).toBe(62400); // 390 * 160 vertices
    expect(indexAttr).not.toBeNull();
    
    // (390-1) * (160-1) * 2 triangles = 389 * 159 * 2 = 123,702 triangles
    const triangleCount = indexAttr!.count / 3;
    expect(triangleCount).toBe(123702);
  });

  it('8. Verifies 1:1 vertical scale is default and physically accurate', () => {
    const meta: TerrainMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(path.join(courseDir, meta.binary.file));
    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );

    const terrainData = new TerrainData(meta, floatArray);
    const meshBuilder = new TerrainMeshBuilder(terrainData);

    expect(meshBuilder.getVerticalScale()).toBe(1.0);
  });
});
