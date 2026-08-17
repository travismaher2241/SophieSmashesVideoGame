import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { candidateFeaturesToPolygons, getCandidateHole6Alignment } from '../src/course/CandidateHoleAlignment';
import { HoleTransform } from '../src/course/HoleTransform';
import { SurfaceQuery } from '../src/course/SurfaceQuery';
import { TerrainData, TerrainMeta } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';

describe('Warragul Hole 6 Coordinate Transform & Candidate Alignment Suite', () => {
  const courseDir = path.resolve(__dirname, '../public/courses/warragul/hole-06');
  const metaPath = path.join(courseDir, 'terrain_meta.json');
  const binPath = path.join(courseDir, 'terrain.bin');

  let meta: TerrainMeta;
  let transform: HoleTransform;
  let terrainData: TerrainData;
  let terrainQuery: TerrainQuery;

  beforeEach(() => {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const binBuffer = fs.readFileSync(binPath);
    const floatArray = new Float32Array(binBuffer.buffer, binBuffer.byteOffset, binBuffer.byteLength / 4);
    terrainData = new TerrainData(meta, floatArray);
    terrainQuery = new TerrainQuery(terrainData);
    transform = new HoleTransform(meta);
  });

  describe('1. Sample-Centre vs Raster Outer Bounds Coordinate Math', () => {
    it('verifies exact vertex span is (samples-1)*spacing = 778m x 318m', () => {
      expect(transform.vertexSpanX).toBe(778.0); // (390 - 1) * 2
      expect(transform.vertexSpanZ).toBe(318.0); // (160 - 1) * 2
      expect(transform.widthSamples).toBe(390);
      expect(transform.heightSamples).toBe(160);
      expect(transform.gridSpacing).toBe(2.0);
    });

    it('verifies raster outer bounds span 780m x 320m', () => {
      const eastingSpan = transform.maxEasting - transform.minEasting;
      const northingSpan = transform.maxNorthing - transform.minNorthing;
      expect(eastingSpan).toBe(780.0);
      expect(northingSpan).toBe(320.0);
    });

    it('verifies first sample (0,0) and last sample (389,159) GIS positions', () => {
      // First sample (col 0, row 0)
      const firstSample = transform.getSampleCentreGIS(0, 0, 0);
      expect(firstSample.easting).toBe(405040.0);
      expect(firstSample.northing).toBe(5777580.0);

      // Last sample (col 389, row 159)
      const lastSample = transform.getSampleCentreGIS(389, 159, 0);
      expect(lastSample.easting).toBe(405818.0); // 405040 + 389 * 2 = 405818
      expect(lastSample.northing).toBe(5777262.0); // 5777580 - 159 * 2 = 5777262
    });
  });

  describe('2. Bidirectional Coordinate Transform Round-Trip Accuracy', () => {
    it('verifies GIS -> Local -> GIS round trip within 1mm tolerance', () => {
      const testEasting = 405450.75;
      const testNorthing = 5777350.25;
      const testElev = 135.5;

      const local = transform.sourceToLocal(testEasting, testNorthing, testElev);
      const backToGIS = transform.localToSource(local.x, local.y, local.z);

      expect(backToGIS.easting).toBeCloseTo(testEasting, 3);
      expect(backToGIS.northing).toBeCloseTo(testNorthing, 3);
      expect(backToGIS.elevation).toBeCloseTo(testElev, 3);
      expect(backToGIS.crs).toBe('EPSG:7855');
    });

    it('verifies Local -> GIS -> Local round trip within 1mm tolerance', () => {
      const localX = 250.6;
      const localZ = 120.4;
      const localY = 18.2;

      const gis = transform.localToSource(localX, localY, localZ);
      const backToLocal = transform.sourceToLocal(gis.easting, gis.northing, gis.elevation);

      expect(backToLocal.x).toBeCloseTo(localX, 3);
      expect(backToLocal.z).toBeCloseTo(localZ, 3);
      expect(backToLocal.y).toBeCloseTo(localY, 3);
    });
  });

  describe('3. Candidate Hole 6 Topography, Metrics, and Provenance', () => {
    it('evaluates candidate Hole 6 tee and green horizontal plan distance against official 248m', () => {
      const candidate = getCandidateHole6Alignment(transform);

      expect(candidate.holeNumber).toBe(6);
      expect(candidate.officialPar).toBe(4);
      expect(candidate.officialLengthMetres).toBe(248);

      // Plan distance must be consistent with 248m within <= 2% tolerance
      expect(candidate.calculatedMetrics.planDistanceMetres).toBeCloseTo(247.39, 1);
      expect(Math.abs(candidate.calculatedMetrics.distanceDeltaMetres)).toBeLessThan(5.0);
      expect(Math.abs(candidate.calculatedMetrics.distanceDeltaPercent)).toBeLessThan(2.0);
    });

    it('measures real DEM elevation rise between candidate tee and green', () => {
      const candidate = getCandidateHole6Alignment(transform);

      // Real DEM elevation measurements
      const teeElev = candidate.calculatedMetrics.teeElevationMetres;
      const greenElev = candidate.calculatedMetrics.greenElevationMetres;
      const elevDiff = candidate.calculatedMetrics.elevationChangeMetres;

      expect(teeElev).toBeCloseTo(121.45, 1);
      expect(greenElev).toBeCloseTo(149.04, 1);
      expect(elevDiff).toBeCloseTo(27.59, 1);
      expect(elevDiff).toBeGreaterThan(10.0); // Confirms significant uphill climb
    });

    it('verifies explicit provenance metadata levels', () => {
      const candidate = getCandidateHole6Alignment(transform);

      expect(candidate.tee.verification).toBe('estimated-from-official-map');
      expect(candidate.greenCentre.verification).toBe('estimated-from-official-map');
      expect(candidate.tee.name).toBe('BEST-SUPPORTED ESTIMATED WHITE TEE');
      expect(candidate.greenCentre.name).toBe('BEST-SUPPORTED ESTIMATED GREEN CENTRE');

      for (const feature of candidate.features) {
        expect(feature.verification).toBe('estimated-from-official-map');
      }
    });

    it('identifies 2 separate greenside bunkers and cart path', () => {
      const candidate = getCandidateHole6Alignment(transform);

      const bunkers = candidate.features.filter((f) => f.type === 'BUNKER');
      expect(bunkers.length).toBe(2);
      expect(bunkers[0].id).toBe('h06-bunker-01');
      expect(bunkers[1].id).toBe('h06-bunker-02');

      const paths = candidate.features.filter((f) => f.type === 'PATH');
      expect(paths.length).toBe(1);
      expect(paths[0].id).toBe('h06-path-01');
    });
  });

  describe('4. Surface Classification on Candidate Geometry', () => {
    it('verifies point-in-polygon classification for candidate features', () => {
      const candidate = getCandidateHole6Alignment(transform);
      const polygons = candidateFeaturesToPolygons(candidate.features);
      const surfaceQuery = new SurfaceQuery(polygons);

      // Point inside candidate fairway (Local X: 450, Z: 200)
      const fairwayLie = surfaceQuery.getLieAt(450.0, 200.0);
      expect(fairwayLie.type).toBe('FAIRWAY');

      // Point inside candidate green (Local X: 600, Z: 160)
      const greenLie = surfaceQuery.getLieAt(600.0, 160.0);
      expect(greenLie.type).toBe('GREEN');

      // Point inside candidate bunker 01 (Local X: 588, Z: 145)
      const bunkerLie1 = surfaceQuery.getLieAt(588.0, 145.0);
      expect(bunkerLie1.type).toBe('BUNKER');

      // Point inside candidate bunker 02 (Local X: 598, Z: 176)
      const bunkerLie2 = surfaceQuery.getLieAt(598.0, 176.0);
      expect(bunkerLie2.type).toBe('BUNKER');

      // Point inside candidate cart path (Local X: 441, Z: 226)
      const pathLie = surfaceQuery.getLieAt(441.0, 226.0);
      expect(pathLie.type).toBe('PATH');
    });
  });
});
