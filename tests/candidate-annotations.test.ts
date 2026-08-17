import { describe, expect, it } from 'vitest';
import {
  CandidateAnnotations,
  CandidateFeature,
  CandidatePoint
} from '../src/course/CandidateAnnotations';
import { GeoTransform } from '../src/course/GeoTransform';
import { TerrainData, TerrainMeta } from '../src/course/TerrainData';

function point(x: number, z: number): CandidatePoint {
  return {
    x,
    z,
    elevation: 10,
    label: 'UNVERIFIED TEST POINT',
    isVerified: false
  };
}

function feature(id: string, type: CandidateFeature['type'], points: CandidatePoint[]): CandidateFeature {
  return {
    id,
    type,
    label: `UNVERIFIED ${type.toUpperCase()}`,
    isVerified: false,
    isClosed: false,
    points
  };
}

function terrain(): TerrainData {
  const meta = {
    courseId: 'warragul',
    holeId: 'hole-06',
    holeNumber: 6,
    widthSamples: 2,
    heightSamples: 2,
    gridSpacingMetres: 10,
    baseElevationMetres: 100,
    sourceBoundsMGA55: {
      minEasting: 405040,
      maxEasting: 405050,
      minNorthing: 5777260,
      maxNorthing: 5777270
    },
    binary: { type: 'Float32', endianness: 'little', order: 'row-major' }
  } as unknown as TerrainMeta;
  return new TerrainData(meta, new Float32Array(4));
}

describe('candidate polygon drafting', () => {
  it('appends points and only closes a feature with at least three points', () => {
    const annotations = new CandidateAnnotations();
    annotations.addFeature(feature('fairway-1', 'fairway', [point(0, 0)]));

    expect(() => annotations.closeFeature('fairway-1')).toThrow(/at least 3 points/);

    annotations.appendFeaturePoint('fairway-1', point(10, 0));
    annotations.appendFeaturePoint('fairway-1', point(10, 10));
    annotations.closeFeature('fairway-1');

    expect(annotations.getFeatures()[0].isClosed).toBe(true);
    expect(annotations.getFeatures()[0].points).toHaveLength(3);
    expect(() => annotations.appendFeaturePoint('fairway-1', point(0, 10))).toThrow(/closed/);
  });

  it('supports undoing points and cancelling a draft', () => {
    const annotations = new CandidateAnnotations();
    annotations.addFeature(feature('bunker-1', 'bunker', [point(1, 1), point(2, 2)]));

    expect(annotations.removeLastFeaturePoint('bunker-1')).toBe(1);
    annotations.removeFeature('bunker-1');

    expect(annotations.getFeatures()).toEqual([]);
  });

  it('exports only explicitly closed polygons as provisional candidate surfaces', () => {
    const annotations = new CandidateAnnotations();
    annotations.addFeature(feature('fairway-1', 'fairway', [point(0, 0), point(20, 0), point(20, 20)]));
    annotations.closeFeature('fairway-1');
    annotations.addFeature(feature('path-draft', 'path', [point(4, 4), point(8, 8)]));

    const terrainData = terrain();
    const exported = annotations.generateExportPackage(terrainData, new GeoTransform(terrainData));

    expect(exported.candidateSurfaces).toEqual([{
      id: 'fairway-1',
      type: 'FAIRWAY',
      name: 'UNVERIFIED FAIRWAY',
      provisional: true,
      sourceFeatureId: 'fairway-1',
      points: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }]
    }]);
    expect(exported.incompleteFeatures.map((item) => item.id)).toEqual(['path-draft']);
    expect(exported.rawAnnotations).toHaveLength(2);
  });

  it('maps closed paths to the engine CART_PATH surface type', () => {
    const annotations = new CandidateAnnotations();
    annotations.addFeature(feature('path-1', 'path', [point(0, 0), point(5, 0), point(5, 1)]));
    annotations.closeFeature('path-1');

    const terrainData = terrain();
    const exported = annotations.generateExportPackage(terrainData, new GeoTransform(terrainData));

    expect(exported.candidateSurfaces[0].type).toBe('CART_PATH');
  });
});
