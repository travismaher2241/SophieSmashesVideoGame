import { GeoTransform } from './GeoTransform';
import { TerrainData } from './TerrainData';

export interface CandidatePoint {
  x: number;
  z: number;
  elevation: number;
  label: string;
  isVerified: false;
  eastingMGA55?: number;
  northingOptionA?: number;
  northingOptionB?: number;
}

export interface CandidateFeature {
  id: string;
  type: 'tee' | 'green' | 'fairway' | 'bunker' | 'path';
  label: string;
  isVerified: false;
  /** True only after the author explicitly closes a polygon with 3+ points. */
  isClosed: boolean;
  points: CandidatePoint[];
  notes?: string;
}

export interface CandidateSurfaceDraft {
  id: string;
  type: 'FAIRWAY' | 'BUNKER' | 'CART_PATH';
  name: string;
  provisional: true;
  sourceFeatureId: string;
  points: Array<{ x: number; z: number }>;
}

export interface CandidateExportPackage {
  courseId: string;
  holeId: string;
  holeNumber: number;
  status: 'candidate-annotation-unverified';
  exportedAt: string;
  provenance: {
    northingOrientationProven: boolean;
    note: string;
  };
  candidateTee: CandidatePoint | null;
  candidateGreenCentre: CandidatePoint | null;
  candidateFairway: CandidateFeature | null;
  candidateBunkers: CandidateFeature[];
  candidatePaths: CandidateFeature[];
  /** Closed polygons in the same coordinate shape consumed by hole.json. */
  candidateSurfaces: CandidateSurfaceDraft[];
  /** Drafts with fewer than three points, or not explicitly finished. */
  incompleteFeatures: CandidateFeature[];
  rawAnnotations: CandidateFeature[];
}

export class CandidateAnnotations {
  private tee: CandidatePoint | null = null;
  private greenCentre: CandidatePoint | null = null;
  private features: CandidateFeature[] = [];

  public getTee(): CandidatePoint | null {
    return this.tee;
  }

  public getGreenCentre(): CandidatePoint | null {
    return this.greenCentre;
  }

  public getFeatures(): CandidateFeature[] {
    return [...this.features];
  }

  public setTee(point: CandidatePoint): void {
    point.isVerified = false;
    point.label = 'UNVERIFIED TEE';
    this.tee = point;
  }

  public setGreenCentre(point: CandidatePoint): void {
    point.isVerified = false;
    point.label = 'UNVERIFIED GREEN';
    this.greenCentre = point;
  }

  public addFeature(feature: CandidateFeature): void {
    feature.isVerified = false;
    feature.isClosed = false;
    if (!feature.label.includes('UNVERIFIED')) {
      feature.label = `UNVERIFIED ${feature.label.toUpperCase()}`;
    }
    this.features.push(feature);
  }

  public appendFeaturePoint(featureId: string, point: CandidatePoint): void {
    const feature = this.requireFeature(featureId);
    if (feature.isClosed) {
      throw new Error(`Cannot append a point to closed candidate feature "${featureId}".`);
    }
    feature.points.push(point);
  }

  public removeLastFeaturePoint(featureId: string): number {
    const feature = this.requireFeature(featureId);
    if (feature.isClosed) {
      throw new Error(`Cannot edit closed candidate feature "${featureId}".`);
    }
    feature.points.pop();
    return feature.points.length;
  }

  public closeFeature(featureId: string): void {
    const feature = this.requireFeature(featureId);
    if (feature.points.length < 3) {
      throw new Error(
        `Candidate feature "${featureId}" needs at least 3 points to close; got ${feature.points.length}.`
      );
    }
    feature.isClosed = true;
  }

  public removeFeature(featureId: string): void {
    const index = this.features.findIndex((feature) => feature.id === featureId);
    if (index >= 0) this.features.splice(index, 1);
  }

  public clearAll(): void {
    this.tee = null;
    this.greenCentre = null;
    this.features = [];
  }

  /**
   * Export candidate JSON structure.
   */
  public generateExportPackage(terrainData: TerrainData, geoTransform: GeoTransform): CandidateExportPackage {
    const annotatePointWithGeo = (pt: CandidatePoint | null): CandidatePoint | null => {
      if (!pt) return null;
      const geo = geoTransform.getGeoCoordinates(pt.x, pt.z, pt.elevation);
      return {
        ...pt,
        isVerified: false,
        eastingMGA55: geo.eastingMGA55,
        northingOptionA: geo.northingOptionA,
        northingOptionB: geo.northingOptionB
      };
    };

    const annotatedTee = annotatePointWithGeo(this.tee);
    const annotatedGreen = annotatePointWithGeo(this.greenCentre);

    const annotatedFeatures = this.features.map((feat) => ({
      ...feat,
      isVerified: false as const,
      points: feat.points.map((pt) => annotatePointWithGeo(pt)!)
    }));

    const completedFeatures = annotatedFeatures.filter((feature) => feature.isClosed);
    const incompleteFeatures = annotatedFeatures.filter((feature) => !feature.isClosed);
    const fairway = completedFeatures.find((f) => f.type === 'fairway') || null;
    const bunkers = completedFeatures.filter((f) => f.type === 'bunker');
    const paths = completedFeatures.filter((f) => f.type === 'path');

    const surfaceType = {
      fairway: 'FAIRWAY',
      bunker: 'BUNKER',
      path: 'CART_PATH'
    } as const;

    const candidateSurfaces: CandidateSurfaceDraft[] = completedFeatures
      .filter((feature): feature is typeof feature & { type: keyof typeof surfaceType } =>
        feature.type === 'fairway' || feature.type === 'bunker' || feature.type === 'path'
      )
      .map((feature) => ({
        id: feature.id,
        type: surfaceType[feature.type],
        name: feature.label,
        provisional: true,
        sourceFeatureId: feature.id,
        points: feature.points.map(({ x, z }) => ({ x, z }))
      }));

    return {
      courseId: terrainData.meta.courseId,
      holeId: terrainData.meta.holeId,
      holeNumber: terrainData.meta.holeNumber,
      status: 'candidate-annotation-unverified',
      exportedAt: new Date().toISOString(),
      provenance: {
        northingOrientationProven: false,
        note: 'Candidate annotations derived visually via alignment tool. Require authoritative GIS aerial overlay confirmation.'
      },
      candidateTee: annotatedTee,
      candidateGreenCentre: annotatedGreen,
      candidateFairway: fairway,
      candidateBunkers: bunkers,
      candidatePaths: paths,
      candidateSurfaces,
      incompleteFeatures,
      rawAnnotations: annotatedFeatures
    };
  }

  private requireFeature(featureId: string): CandidateFeature {
    const feature = this.features.find((candidate) => candidate.id === featureId);
    if (!feature) {
      throw new Error(`Unknown candidate feature "${featureId}".`);
    }
    return feature;
  }
}
