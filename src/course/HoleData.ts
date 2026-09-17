import { SURFACE_TYPES, SurfacePolygon, SurfacePoint, SurfaceType } from './SurfaceQuery';

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
  name?: string;
  provisional?: boolean;
}

/** Kinds of tree billboard a hole may place. Mirrors TreeRenderer's TreeType. */
export const HOLE_TREE_TYPES = ['GUM_LARGE', 'GUM_MEDIUM', 'PINE', 'CLUSTER', 'BUSH'] as const;

export type HoleTreeType = (typeof HOLE_TREE_TYPES)[number];

/**
 * A tree placed explicitly by course data, in the same local metre coordinates as
 * the surface polygons. Holes that omit these fall back to procedural scatter.
 */
export interface HoleTree {
  x: number;
  z: number;
  type: HoleTreeType;
  scale?: number;
}

/** A tee the hole can be played from. */
export interface HoleTeeBox {
  /** BACK is the tee the card length is measured from. */
  id: TeeBoxId;
  /** How it reads on screen, e.g. "FORWARD TEE". */
  name: string;
  x: number;
  z: number;
  /** Playing length from this tee, in metres. */
  lengthMetres: number;
  /** The TEE surface polygon this tee stands on. */
  surfaceId: string;
}

export const TEE_BOX_IDS = ['BACK', 'MIDDLE', 'FORWARD'] as const;

export type TeeBoxId = (typeof TEE_BOX_IDS)[number];

/**
 * A place the cup can be cut on this green.
 *
 * A hole with one pin is the same hole every time you play it. These are the
 * positions the course says are fair to cut; which one is in today is the
 * round's business, not the hole's.
 */
export interface HolePinPosition {
  id: string;
  name: string;
  x: number;
  z: number;
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
  /**
   * Where the tee shot should be aimed, when that is not simply at the green.
   *
   * On a dogleg the green sits around a corner, so aiming at it sends a good
   * drive across the bend and into the trees. Holes that bend name the point on
   * the fairway to play to instead; straight holes omit it.
   */
  drivingLine?: Vector3Data;
  /** Tees this hole can be played from. Holes without them play from `tee`. */
  teeBoxes?: HoleTeeBox[];
  /** Where the cup may be cut. Holes without them play to `greenCentre`. */
  pinPositions?: HolePinPosition[];
  surfaces: SurfacePolygon[];
  trees?: HoleTree[];
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
    HoleData.validateTrees(data.trees, data, holeUrl);
    HoleData.validateTeeBoxes(data.teeBoxes, data, holeUrl);
    HoleData.validatePinPositions(data.pinPositions, data, holeUrl);

    if (data.drivingLine && (!Number.isFinite(data.drivingLine.x) || !Number.isFinite(data.drivingLine.z))) {
      throw new Error(
        `Invalid course data for ${data.courseId}/${data.holeId} (${holeUrl}): ` +
        `drivingLine has non-finite coordinates (x=${data.drivingLine.x}, z=${data.drivingLine.z}).`
      );
    }

    return { ...data, surfaces };
  }

  public static validateTrees(
    trees: HoleTree[] | undefined,
    hole: Pick<HoleConfig, 'courseId' | 'holeId'>,
    sourceUrl: string
  ): void {
    if (trees === undefined) return;

    const where = `${hole.courseId ?? 'unknown-course'}/${hole.holeId ?? 'unknown-hole'} (${sourceUrl})`;

    if (!Array.isArray(trees)) {
      throw new Error(`Invalid course data for ${where}: expected "trees" to be an array, got ${typeof trees}.`);
    }

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];

      if (!tree || typeof tree !== 'object') {
        throw new Error(`Invalid course data for ${where}: tree at index ${i} is not an object.`);
      }

      if (!Number.isFinite(tree.x) || !Number.isFinite(tree.z)) {
        throw new Error(
          `Invalid course data for ${where}: tree at index ${i} has non-finite coordinates ` +
          `(x=${tree.x}, z=${tree.z}). Expected finite metres in local world space.`
        );
      }

      if (!HOLE_TREE_TYPES.includes(tree.type)) {
        throw new Error(
          `Invalid course data for ${where}: tree at index ${i} has unknown type "${tree.type}".\n` +
          `Expected one of: ${HOLE_TREE_TYPES.join(', ')}.`
        );
      }

      if (tree.scale !== undefined && (!Number.isFinite(tree.scale) || tree.scale <= 0)) {
        throw new Error(
          `Invalid course data for ${where}: tree at index ${i} has scale ${tree.scale}. ` +
          `Expected a positive number, or omit it for the default size.`
        );
      }
    }
  }

  public static validateTeeBoxes(
    teeBoxes: HoleTeeBox[] | undefined,
    hole: Pick<HoleConfig, 'courseId' | 'holeId'>,
    sourceUrl: string
  ): void {
    if (teeBoxes === undefined) return;

    const where = `${hole.courseId ?? 'unknown-course'}/${hole.holeId ?? 'unknown-hole'} (${sourceUrl})`;

    if (!Array.isArray(teeBoxes) || teeBoxes.length === 0) {
      throw new Error(`Invalid course data for ${where}: "teeBoxes" must be a non-empty array when present.`);
    }

    // A hole that lists tees must list the one the card is measured from, or the
    // length printed on the scorecard belongs to no tee anybody can play.
    if (!teeBoxes.some((teeBox) => teeBox?.id === 'BACK')) {
      throw new Error(`Invalid course data for ${where}: "teeBoxes" has no BACK tee, which is the card length.`);
    }

    for (let i = 0; i < teeBoxes.length; i++) {
      const teeBox = teeBoxes[i];

      if (!teeBox || typeof teeBox !== 'object') {
        throw new Error(`Invalid course data for ${where}: tee box at index ${i} is not an object.`);
      }

      if (!TEE_BOX_IDS.includes(teeBox.id)) {
        throw new Error(
          `Invalid course data for ${where}: tee box at index ${i} has unknown id "${teeBox.id}".\n` +
          `Expected one of: ${TEE_BOX_IDS.join(', ')}.`
        );
      }

      if (!Number.isFinite(teeBox.x) || !Number.isFinite(teeBox.z)) {
        throw new Error(
          `Invalid course data for ${where}: tee box "${teeBox.id}" has non-finite coordinates ` +
          `(x=${teeBox.x}, z=${teeBox.z}). Expected finite metres in local world space.`
        );
      }

      if (!Number.isFinite(teeBox.lengthMetres) || teeBox.lengthMetres <= 0) {
        throw new Error(
          `Invalid course data for ${where}: tee box "${teeBox.id}" has length ${teeBox.lengthMetres}m. ` +
          'Expected a positive number of metres.'
        );
      }
    }
  }

  public static validatePinPositions(
    pins: HolePinPosition[] | undefined,
    hole: Pick<HoleConfig, 'courseId' | 'holeId'>,
    sourceUrl: string
  ): void {
    if (pins === undefined) return;

    const where = `${hole.courseId ?? 'unknown-course'}/${hole.holeId ?? 'unknown-hole'} (${sourceUrl})`;

    if (!Array.isArray(pins) || pins.length === 0) {
      throw new Error(`Invalid course data for ${where}: "pinPositions" must be a non-empty array when present.`);
    }

    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];

      if (!pin || typeof pin !== 'object') {
        throw new Error(`Invalid course data for ${where}: pin at index ${i} is not an object.`);
      }

      if (typeof pin.id !== 'string' || pin.id.length === 0) {
        throw new Error(`Invalid course data for ${where}: pin at index ${i} is missing a non-empty string "id".`);
      }

      if (!Number.isFinite(pin.x) || !Number.isFinite(pin.z)) {
        throw new Error(
          `Invalid course data for ${where}: pin "${pin.id}" has non-finite coordinates ` +
          `(x=${pin.x}, z=${pin.z}). Expected finite metres in local world space.`
        );
      }
    }
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
