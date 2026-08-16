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
  | 'OUT_OF_BOUNDS';

export interface SurfacePoint {
  x: number;
  z: number;
}

export interface SurfacePolygon {
  id: string;
  type: SurfaceType;
  name: string;
  points: SurfacePoint[];
}

export interface LieInfo {
  type: SurfaceType;
  name: string;
  distanceMultiplier: number; // e.g. 1.0 for Fairway, 0.85 for Rough, 0.60 for Bunker
  controlMultiplier: number;  // e.g. 1.0 for Fairway, 0.75 for Rough
  restitution: number;        // Bounce elasticity (0.45 fairway, 0.15 bunker, 0.35 green)
  rollingFriction: number;    // Ground friction (0.12 fairway, 0.45 bunker, 0.06 green)
}

export const SURFACE_PROPERTIES: Record<SurfaceType, LieInfo> = {
  TEE: {
    type: 'TEE',
    name: 'Teeing Ground',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.45,
    rollingFriction: 0.12
  },
  FAIRWAY: {
    type: 'FAIRWAY',
    name: 'Fairway',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.42,
    rollingFriction: 0.12
  },
  FIRST_CUT: {
    type: 'FIRST_CUT',
    name: 'First Cut',
    distanceMultiplier: 0.95,
    controlMultiplier: 0.92,
    restitution: 0.38,
    rollingFriction: 0.16
  },
  ROUGH: {
    type: 'ROUGH',
    name: 'Primary Rough',
    distanceMultiplier: 0.82,
    controlMultiplier: 0.75,
    restitution: 0.28,
    rollingFriction: 0.24
  },
  DEEP_ROUGH: {
    type: 'DEEP_ROUGH',
    name: 'Deep Heavy Rough',
    distanceMultiplier: 0.65,
    controlMultiplier: 0.50,
    restitution: 0.18,
    rollingFriction: 0.38
  },
  FRINGE: {
    type: 'FRINGE',
    name: 'Green Fringe',
    distanceMultiplier: 0.98,
    controlMultiplier: 0.95,
    restitution: 0.38,
    rollingFriction: 0.10
  },
  GREEN: {
    type: 'GREEN',
    name: 'Putting Green',
    distanceMultiplier: 1.0,
    controlMultiplier: 1.0,
    restitution: 0.35,
    rollingFriction: 0.06 // Smooth green fast roll
  },
  BUNKER: {
    type: 'BUNKER',
    name: 'Sand Bunker',
    distanceMultiplier: 0.60,
    controlMultiplier: 0.55,
    restitution: 0.12, // Heavy sand damping
    rollingFriction: 0.48 // High sand resistance
  },
  WATER: {
    type: 'WATER',
    name: 'Water Hazard',
    distanceMultiplier: 0.0,
    controlMultiplier: 0.0,
    restitution: 0.0,
    rollingFriction: 1.0
  },
  PATH: {
    type: 'PATH',
    name: 'Cart Path',
    distanceMultiplier: 1.05,
    controlMultiplier: 0.85,
    restitution: 0.75, // Hard asphalt bounce
    rollingFriction: 0.08
  },
  OUT_OF_BOUNDS: {
    type: 'OUT_OF_BOUNDS',
    name: 'Out of Bounds',
    distanceMultiplier: 0.0,
    controlMultiplier: 0.0,
    restitution: 0.30,
    rollingFriction: 0.30
  }
};

export class SurfaceQuery {
  private polygons: SurfacePolygon[] = [];

  constructor(polygons: SurfacePolygon[] = []) {
    this.polygons = polygons;
  }

  public setPolygons(polygons: SurfacePolygon[]): void {
    this.polygons = polygons;
  }

  /**
   * Determine course surface lie at continuous 3D world coordinate (x, z).
   * Uses Ray-Casting point-in-polygon containment test.
   */
  public getLieAt(x: number, z: number): LieInfo {
    // Priority order: GREEN > BUNKER > TEE > FRINGE > FAIRWAY > PATH > WATER > OUT_OF_BOUNDS > ROUGH
    const priorityOrder: SurfaceType[] = [
      'GREEN',
      'BUNKER',
      'TEE',
      'FRINGE',
      'FAIRWAY',
      'PATH',
      'WATER',
      'OUT_OF_BOUNDS',
      'FIRST_CUT',
      'DEEP_ROUGH',
      'ROUGH'
    ];

    for (const surfaceType of priorityOrder) {
      const matchingPolys = this.polygons.filter((p) => p.type === surfaceType);
      for (const poly of matchingPolys) {
        if (this.isPointInPolygon(x, z, poly.points)) {
          return SURFACE_PROPERTIES[surfaceType];
        }
      }
    }

    // Default ground lie outside defined polygons is Primary Rough
    return SURFACE_PROPERTIES.ROUGH;
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
