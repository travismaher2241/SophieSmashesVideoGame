import { SURFACE_TYPES, SurfacePolygon, SurfacePoint, SurfaceType } from './SurfaceQuery';

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
  name?: string;
  provisional?: boolean;
}

export interface HoleConfig {
  courseId: string;
  courseName?: string;
  holeId: string;
  holeNumber: number;
  par: number;
  publishedLengthMetres: number;
  status: string;
  tee: Vector3Data | null;
  greenCentre: Vector3Data | null;
  surfaces: SurfacePolygon[];
  features?: unknown[];
  notes?: string[];
}

export class HoleData {
  public static async load(courseHolePath: string): Promise<HoleConfig> {
    const holeUrl = `${courseHolePath}/hole.json`;
    let response: Response;
    try {
      response = await fetch(holeUrl);
    } catch (err) {
      throw new Error(`Network failure fetching hole layout from ${holeUrl}: ${err}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to load hole layout from ${holeUrl} (Status: ${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as HoleConfig;
    const surfaces = data.surfaces ?? [];
    HoleData.validateSurfaces(surfaces, data, holeUrl);

    return { ...data, surfaces };
  }

  public static validateSurfaces(
    surfaces: SurfacePolygon[],
    hole: Pick<HoleConfig, 'courseId' | 'holeId'>,
    sourceUrl: string
  ): void {
    const where = `${hole.courseId ?? 'unknown-course'}/${hole.holeId ?? 'unknown-hole'} (${sourceUrl})`;

    if (!Array.isArray(surfaces)) {
      throw new Error(`Invalid course data for ${where}: expected "surfaces" to be an array, got ${typeof surfaces}.`);
    }

    const seenIds = new Set<string>();

    for (let i = 0; i < surfaces.length; i++) {
      const poly = surfaces[i];
      const label = poly?.id ? `surface "${poly.id}"` : `surface at index ${i}`;

      if (!poly || typeof poly !== 'object') {
        throw new Error(`Invalid course data for ${where}: ${label} is not an object.`);
      }

      if (typeof poly.id !== 'string' || poly.id.length === 0) {
        throw new Error(`Invalid course data for ${where}: ${label} is missing a non-empty string "id".`);
      }

      if (seenIds.has(poly.id)) {
        throw new Error(`Invalid course data for ${where}: duplicate surface id "${poly.id}". Surface ids must be unique.`);
      }
      seenIds.add(poly.id);

      if (!SURFACE_TYPES.includes(poly.type as SurfaceType)) {
        throw new Error(
          `Invalid course data for ${where}: ${label} has unknown type "${poly.type}".\n` +
          `Expected one of: ${SURFACE_TYPES.join(', ')}.`
        );
      }

      if (!Array.isArray(poly.points) || poly.points.length < 3) {
        throw new Error(
          `Invalid course data for ${where}: ${label} needs at least 3 points to form a polygon, ` +
          `got ${Array.isArray(poly.points) ? poly.points.length : 'none'}.`
        );
      }

      for (let p = 0; p < poly.points.length; p++) {
        const pt: SurfacePoint = poly.points[p];
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.z)) {
          throw new Error(
            `Invalid course data for ${where}: ${label} point ${p} has non-finite coordinates ` +
            `(x=${pt?.x}, z=${pt?.z}). Expected finite metres in local world space.`
          );
        }
      }
    }
  }
}
