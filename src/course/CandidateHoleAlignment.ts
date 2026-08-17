import { CourseFeaturePosition, HoleTransform, VerificationLevel } from './HoleTransform';
import { SurfacePolygon } from './SurfaceQuery';

export interface CandidateHoleFeature {
  id: string;
  name: string;
  type: string;
  verification: VerificationLevel;
  sourcePoints: { easting: number; northing: number }[];
  localPoints: { x: number; z: number }[];
  notes: string;
}

export interface CandidateHole6Alignment {
  holeNumber: number;
  officialPar: number;
  officialLengthMetres: number;
  transform: {
    sourceCRS: string;
    rasterBounds: {
      minEasting: number;
      maxEasting: number;
      minNorthing: number;
      maxNorthing: number;
    };
    vertexSpanMetres: {
      widthX: number;
      heightZ: number;
    };
  };
  tee: CourseFeaturePosition;
  greenCentre: CourseFeaturePosition;
  calculatedMetrics: {
    planDistanceMetres: number;
    officialDistanceMetres: number;
    distanceDeltaMetres: number;
    distanceDeltaPercent: number;
    teeElevationMetres: number;
    greenElevationMetres: number;
    elevationChangeMetres: number;
    slopeDescription: string;
  };
  features: CandidateHoleFeature[];
  evidenceSummary: {
    topography: string;
    landmarks: string;
    courseMapReference: string;
    bunkersIdentified: number;
    pathIdentified: string;
    remainingUncertainty: string;
  };
}

/**
 * Generates the candidate estimated alignment for Warragul Country Club Hole 6
 * based on the DEM elevation profile, official course map reference, and hole characteristics.
 */
export function getCandidateHole6Alignment(transform: HoleTransform): CandidateHole6Alignment {
  // 1. Candidate Tee (Lower elevation valley in mid-west of crop)
  const teeLocalX = 360.0;
  const teeLocalZ = 220.0;
  const teeLocalY = 6.57; // ~121.45m absolute
  const teeGIS = transform.localToSource(teeLocalX, teeLocalY, teeLocalZ);

  // 2. Candidate Green Centre (Elevated hill plateau in east of crop)
  const greenLocalX = 600.0;
  const greenLocalZ = 160.0;
  const greenLocalY = 34.16; // ~149.04m absolute
  const greenGIS = transform.localToSource(greenLocalX, greenLocalY, greenLocalZ);

  // 3. Metric Calculations
  const planDist = transform.calculateHorizontalDistance(
    { x: teeLocalX, z: teeLocalZ },
    { x: greenLocalX, z: greenLocalZ }
  );
  const elevDiff = greenGIS.elevation - teeGIS.elevation;

  const tee: CourseFeaturePosition = {
    name: 'BEST-SUPPORTED ESTIMATED WHITE TEE',
    sourcePosition: teeGIS,
    localPosition: { x: teeLocalX, y: teeLocalY, z: teeLocalZ },
    verification: 'estimated-from-official-map',
    notes: 'Located in the lower valley takeoff area facing east-northeast towards the elevated green.'
  };

  const greenCentre: CourseFeaturePosition = {
    name: 'BEST-SUPPORTED ESTIMATED GREEN CENTRE',
    sourcePosition: greenGIS,
    localPosition: { x: greenLocalX, y: greenLocalY, z: greenLocalZ },
    verification: 'estimated-from-official-map',
    notes: 'Positioned on the elevated eastern hill ridge consistent with the official uphill Par 4 description.'
  };

  // 4. Candidate Traced Surfaces
  const candidateFairway: CandidateHoleFeature = {
    id: 'candidate-fairway',
    name: 'Candidate Fairway Corridor',
    type: 'FAIRWAY',
    verification: 'estimated-from-official-map',
    localPoints: [
      { x: 366.0, z: 206.0 },
      { x: 450.0, z: 184.0 },
      { x: 540.0, z: 166.0 },
      { x: 586.0, z: 150.0 },
      { x: 590.0, z: 172.0 },
      { x: 536.0, z: 196.0 },
      { x: 444.0, z: 218.0 },
      { x: 364.0, z: 236.0 }
    ],
    sourcePoints: [],
    notes: 'Uphill landing zone corridor tapering towards the green entrance.'
  };
  candidateFairway.sourcePoints = candidateFairway.localPoints.map((pt) => {
    const gis = transform.localToSource(pt.x, 0, pt.z);
    return { easting: gis.easting, northing: gis.northing };
  });

  const candidateGreenSurface: CandidateHoleFeature = {
    id: 'candidate-green',
    name: 'Candidate Putting Green Surface',
    type: 'GREEN',
    verification: 'estimated-from-official-map',
    localPoints: [
      { x: 586.0, z: 154.0 },
      { x: 598.0, z: 148.0 },
      { x: 612.0, z: 154.0 },
      { x: 614.0, z: 166.0 },
      { x: 604.0, z: 172.0 },
      { x: 588.0, z: 168.0 }
    ],
    sourcePoints: [],
    notes: 'Elevated green plateau oval (~26m x 24m).'
  };
  candidateGreenSurface.sourcePoints = candidateGreenSurface.localPoints.map((pt) => {
    const gis = transform.localToSource(pt.x, 0, pt.z);
    return { easting: gis.easting, northing: gis.northing };
  });

  const candidateBunker01: CandidateHoleFeature = {
    id: 'h06-bunker-01',
    name: 'Greenside Bunker 01 (Left)',
    type: 'BUNKER',
    verification: 'estimated-from-official-map',
    localPoints: [
      { x: 584.0, z: 144.0 },
      { x: 596.0, z: 142.0 },
      { x: 594.0, z: 148.0 },
      { x: 582.0, z: 150.0 }
    ],
    sourcePoints: [],
    notes: 'Left greenside protective sand trap.'
  };
  candidateBunker01.sourcePoints = candidateBunker01.localPoints.map((pt) => {
    const gis = transform.localToSource(pt.x, 0, pt.z);
    return { easting: gis.easting, northing: gis.northing };
  });

  const candidateBunker02: CandidateHoleFeature = {
    id: 'h06-bunker-02',
    name: 'Greenside Bunker 02 (Right)',
    type: 'BUNKER',
    verification: 'estimated-from-official-map',
    localPoints: [
      { x: 592.0, z: 174.0 },
      { x: 606.0, z: 174.0 },
      { x: 604.0, z: 180.0 },
      { x: 590.0, z: 178.0 }
    ],
    sourcePoints: [],
    notes: 'Right greenside protective sand trap.'
  };
  candidateBunker02.sourcePoints = candidateBunker02.localPoints.map((pt) => {
    const gis = transform.localToSource(pt.x, 0, pt.z);
    return { easting: gis.easting, northing: gis.northing };
  });

  const candidatePath: CandidateHoleFeature = {
    id: 'h06-path-01',
    name: 'Artificially Surfaced Cart Path',
    type: 'PATH',
    verification: 'estimated-from-official-map',
    localPoints: [
      { x: 356.0, z: 242.0 },
      { x: 440.0, z: 224.0 },
      { x: 530.0, z: 202.0 },
      { x: 584.0, z: 182.0 },
      { x: 588.0, z: 184.0 },
      { x: 532.0, z: 206.0 },
      { x: 442.0, z: 228.0 },
      { x: 358.0, z: 246.0 }
    ],
    sourcePoints: [],
    notes: 'Artificially surfaced cart pathway referenced in Warragul local rules running along south-eastern edge of hole.'
  };
  candidatePath.sourcePoints = candidatePath.localPoints.map((pt) => {
    const gis = transform.localToSource(pt.x, 0, pt.z);
    return { easting: gis.easting, northing: gis.northing };
  });

  return {
    holeNumber: 6,
    officialPar: 4,
    officialLengthMetres: 248,
    transform: {
      sourceCRS: transform.crs,
      rasterBounds: {
        minEasting: transform.minEasting,
        maxEasting: transform.maxEasting,
        minNorthing: transform.minNorthing,
        maxNorthing: transform.maxNorthing
      },
      vertexSpanMetres: {
        widthX: transform.vertexSpanX,
        heightZ: transform.vertexSpanZ
      }
    },
    tee,
    greenCentre,
    calculatedMetrics: {
      planDistanceMetres: planDist,
      officialDistanceMetres: 248,
      distanceDeltaMetres: planDist - 248,
      distanceDeltaPercent: ((planDist - 248) / 248) * 100,
      teeElevationMetres: teeGIS.elevation,
      greenElevationMetres: greenGIS.elevation,
      elevationChangeMetres: elevDiff,
      slopeDescription: `+${elevDiff.toFixed(2)}m uphill climb from tee to green`
    },
    features: [
      candidateFairway,
      candidateGreenSurface,
      candidateBunker01,
      candidateBunker02,
      candidatePath
    ],
    evidenceSummary: {
      topography: 'DEM confirms a continuous uphill slope rising from 121.45m at the candidate tee takeoff to 149.04m at the candidate green plateau (+27.59m vertical rise).',
      landmarks: 'Elevated ridge along eastern portion of tile matching Warragul Hole 6 ridge green location.',
      courseMapReference: 'Official course map depicts Hole 6 as a straight-to-slight-dogleg uphill Par 4 of 248m with greenside bunkers and cart path.',
      bunkersIdentified: 2,
      pathIdentified: 'Artificially surfaced pathway along south-eastern boundary.',
      remainingUncertainty: 'Exact surveyed boundary pegs for teeing grounds, bunker perimeters, and cart path curvature require authoritative on-site or high-resolution orthophoto vector overlay.'
    }
  };
}

/**
 * Converts CandidateHoleFeatures to standard SurfacePolygon array for review renderer.
 */
export function candidateFeaturesToPolygons(features: CandidateHoleFeature[]): SurfacePolygon[] {
  return features.map((f) => ({
    id: f.id,
    type: f.type as any,
    name: f.name,
    points: f.localPoints,
    provisional: f.verification !== 'verified-from-source-data'
  }));
}
