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
  points: CandidatePoint[];
  notes?: string;
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
    if (!feature.label.includes('UNVERIFIED')) {
      feature.label = `UNVERIFIED ${feature.label.toUpperCase()}`;
    }
    this.features.push(feature);
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

    const fairway = annotatedFeatures.find((f) => f.type === 'fairway') || null;
    const bunkers = annotatedFeatures.filter((f) => f.type === 'bunker');
    const paths = annotatedFeatures.filter((f) => f.type === 'path');

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
      rawAnnotations: annotatedFeatures
    };
  }
}
