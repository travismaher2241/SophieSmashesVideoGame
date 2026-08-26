/**
 * Course surface classification and lie lookup.
 *
 * Blueprint §17 defines the full surface vocabulary, §18 defines lie detection by
 * polygon containment. This module holds no course geometry of its own — polygons
 * arrive from course data via setPolygons() (§15).
 */

export type SurfaceType =
  | 'TEE'
  | 'FAIRWAY'
  | 'FIRST_CUT'
  | 'ROUGH'
  | 'DEEP_ROUGH'
  | 'FRINGE'
  | 'GREEN'
  | 'BUNKER'
  | 'WATER'
  | 'PATH'
  | 'GROUND_UNDER_REPAIR'
  | 'OUT_OF_BOUNDS'
  | 'GENERAL_AREA';

/** Every §17 surface type, used for course-data validation. */
export const SURFACE_TYPES: readonly SurfaceType[] = [
  'TEE',
  'FAIRWAY',
  'FIRST_CUT',
  'ROUGH',
  'DEEP_ROUGH',
  'FRINGE',
  'GREEN',
  'BUNKER',
  'WATER',
  'PATH',
  'GROUND_UNDER_REPAIR',
  'OUT_OF_BOUNDS',
  'GENERAL_AREA'
];

/**
 * What the rules require when a ball comes to rest on this surface.
 *
 * NONE                 play the ball as it lies
 * FREE_DROP            reposition to the nearest playable point, no penalty stroke
 * LATERAL_DROP         reposition to the nearest playable point, one penalty stroke
 * STROKE_AND_DISTANCE  replay from where the previous stroke was played, one penalty stroke
 */
export type ReliefRule = 'NONE' | 'FREE_DROP' | 'LATERAL_DROP' | 'STROKE_AND_DISTANCE';

export interface SurfacePoint {
  x: number;
  z: number;
}

export interface SurfacePolygon {
  id: string;
  type: SurfaceType;
  name: string;
  points: SurfacePoint[];
  /**
   * True for development placeholder geometry that has not been traced from the
   * real course. Verified course data omits this. See blueprint §60.
   */
  provisional?: boolean;
}

export interface GroundPhysics {
  rollingResistance: number;
  bounceRestitution: number;
  impactFriction: number;
  spinDamping: number;
}

export interface LieInfo {
  type: SurfaceType;
  name: string;
  distanceMultiplier: number; // e.g. 1.0 for Fairway, 0.82 for Rough, 0.60 for Bunker
  controlMultiplier: number;  // e.g. 1.0 for Fairway, 0.75 for Rough
  restitution: number;        // Bounce elasticity (0.35 fairway, 0.08 bunker, 0.25 green)
  rollingFriction: number;    // Ground roll friction (0.22 fairway, 0.65 bunker, 0.08 green)
  impactFriction: number;     // Tangential speed reduction on ground contact (0.50 fairway, 0.88 bunker)
  relief: ReliefRule;         // Rules outcome when the ball rests here
}

/**
 * Blueprint §38 requires these to be tuneable rather than buried in physics code.
 * They live here for now; moving them into per-course data is R05 work.
 */
export const SURFACE_PROPERTIES: Record<SurfaceType, LieInfo> = {
  TEE: {
    type: 'TEE',
    name: 'Tee',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.38,
    rollingFriction: 0.20,
    impactFriction: 0.45,
    relief: 'NONE'
  },
  FAIRWAY: {
    type: 'FAIRWAY',
    name: 'Fairway',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.35,
    rollingFriction: 0.22,
    impactFriction: 0.50,
    relief: 'NONE'
  },
  FIRST_CUT: {
    type: 'FIRST_CUT',
    name: 'First Cut',
    distanceMultiplier: 0.95,
    controlMultiplier: 0.92,
    restitution: 0.28,
    rollingFriction: 0.30,
    impactFriction: 0.62,
    relief: 'NONE'
  },
  ROUGH: {
    type: 'ROUGH',
    name: 'Rough',
    distanceMultiplier: 0.82,
    controlMultiplier: 0.75,
    restitution: 0.18,
    rollingFriction: 0.52,
    impactFriction: 0.78,
    relief: 'NONE'
  },
  DEEP_ROUGH: {
    type: 'DEEP_ROUGH',
    name: 'Deep Rough',
    distanceMultiplier: 0.65,
    controlMultiplier: 0.50,
    restitution: 0.12,
    rollingFriction: 0.60,
    impactFriction: 0.85,
    relief: 'NONE'
  },
  FRINGE: {
    type: 'FRINGE',
    name: 'Fringe',
    distanceMultiplier: 0.98,
    controlMultiplier: 0.95,
    restitution: 0.30,
    rollingFriction: 0.16,
    impactFriction: 0.55,
    relief: 'NONE'
  },
  GREEN: {
    type: 'GREEN',
    name: 'Green',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.25,
    rollingFriction: 0.08, // Smooth green putting roll
    impactFriction: 0.68, // High check on approach landing
    relief: 'NONE'
  },
  BUNKER: {
    type: 'BUNKER',
    name: 'Bunker',
    distanceMultiplier: 0.60,
    controlMultiplier: 0.55,
    restitution: 0.08, // Heavy sand damping
    rollingFriction: 0.65, // High sand resistance
    impactFriction: 0.88, // Absorbs almost all horizontal speed
    relief: 'NONE'
  },
  WATER: {
    type: 'WATER',
    name: 'Water Hazard',
    distanceMultiplier: 0.55,
    controlMultiplier: 0.45,
    restitution: 0.05,
    rollingFriction: 0.90,
    impactFriction: 0.95,
    relief: 'LATERAL_DROP'
  },
  PATH: {
    type: 'PATH',
    name: 'Cart Path',
    distanceMultiplier: 1.05,
    controlMultiplier: 0.85,
    restitution: 0.70, // Hard asphalt bounce
    rollingFriction: 0.10,
    impactFriction: 0.25,
    relief: 'NONE'
  },
  GROUND_UNDER_REPAIR: {
    type: 'GROUND_UNDER_REPAIR',
    name: 'Ground Under Repair',
    distanceMultiplier: 0.85,
    controlMultiplier: 0.70,
    restitution: 0.22,
    rollingFriction: 0.35,
    impactFriction: 0.70,
    relief: 'FREE_DROP'
  },
  OUT_OF_BOUNDS: {
    type: 'OUT_OF_BOUNDS',
    name: 'Out of Bounds',
    distanceMultiplier: 0.70,
    controlMultiplier: 0.60,
    restitution: 0.25,
    rollingFriction: 0.35,
    impactFriction: 0.70,
    relief: 'STROKE_AND_DISTANCE'
  },
  GENERAL_AREA: {
    type: 'GENERAL_AREA',
    name: 'General Area',
    distanceMultiplier: 0.90,
    controlMultiplier: 0.85,
    restitution: 0.28,
    rollingFriction: 0.30,
    impactFriction: 0.60,
    relief: 'NONE'
  }
};

/**
 * Containment scan order for overlapping features.
 *
 * §18 offers a starting priority but notes it "should later account for overlapping
 * features". Rulings are scanned before playing surfaces: a point inside a GUR,
 * out-of-bounds or penalty-area polygon takes that ruling regardless of the
 * fairway or green polygon it may also sit inside.
 */
export const SURFACE_PRIORITY: readonly SurfaceType[] = [
  'GROUND_UNDER_REPAIR',
  'OUT_OF_BOUNDS',
  'WATER',
  'GREEN',
  'BUNKER',
  'TEE',
  'FRINGE',
  'FAIRWAY',
  'PATH',
  'FIRST_CUT',
  'DEEP_ROUGH',
  'ROUGH',
  'GENERAL_AREA'
];

export class SurfaceQuery {
  private polygons: SurfacePolygon[] = [];

  /** Polygons bucketed by type so a lie query does not re-scan the whole set per type. */
  private byType: Map<SurfaceType, SurfacePolygon[]> = new Map();

  constructor(polygons: SurfacePolygon[] = []) {
    this.setPolygons(polygons);
  }

  public setPolygons(polygons: SurfacePolygon[]): void {
    this.polygons = polygons;
    this.byType = new Map();

    for (const poly of polygons) {
      const bucket = this.byType.get(poly.type);
      if (bucket) {
        bucket.push(poly);
      } else {
        this.byType.set(poly.type, [poly]);
      }
    }
  }

  public getPolygons(): readonly SurfacePolygon[] {
    return this.polygons;
  }

  /** True when any loaded polygon is development placeholder geometry (§60). */
  public hasProvisionalGeometry(): boolean {
    return this.polygons.some((p) => p.provisional === true);
  }

  /**
   * Determine course surface lie at continuous 3D world coordinate (x, z).
   * Uses Ray-Casting point-in-polygon containment in SURFACE_PRIORITY order.
   *
   * A point covered by no polygon returns GENERAL_AREA — unclassified playable
   * ground. It deliberately does not claim to be rough, which would be a specific
   * classification the course data has not made.
   */
  public getLieAt(x: number, z: number): LieInfo {
    for (const surfaceType of SURFACE_PRIORITY) {
      const bucket = this.byType.get(surfaceType);
      if (!bucket) continue;

      for (const poly of bucket) {
        if (this.isPointInPolygon(x, z, poly.points)) {
          return SURFACE_PROPERTIES[surfaceType];
        }
      }
    }

    return SURFACE_PROPERTIES.GENERAL_AREA;
  }

  /**
   * Ray-Casting Point-in-Polygon containment test.
   */
  private isPointInPolygon(x: number, z: number, points: SurfacePoint[]): boolean {
    if (points.length < 3) return false;

    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, zi = points[i].z;
      const xj = points[j].x, zj = points[j].z;

      const intersect =
        zi > z !== zj > z &&
        x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }
}
