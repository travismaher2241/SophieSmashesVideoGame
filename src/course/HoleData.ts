import { SurfacePolygon, SurfacePoint } from './SurfaceQuery';

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface HoleConfig {
  courseId: string;
  holeId: string;
  holeNumber: number;
  par: number;
  publishedLengthMetres: number;
  status: string;
  tee: Vector3Data | null;
  greenCentre: Vector3Data | null;
  surfaces?: SurfacePolygon[];
  features?: any[];
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

    const data: HoleConfig = await response.json();
    return data;
  }

  /**
   * Dynamically generate course surface polygons (Tee, Fairway, Green, Bunkers) for active playtest layout.
   */
  public static generatePlaytestSurfaces(tee: { x: number; z: number }, hole: { x: number; z: number }): SurfacePolygon[] {
    const dx = hole.x - tee.x;
    const dz = hole.z - tee.z;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);

    const perpX = -Math.sin(angle);
    const perpZ = Math.cos(angle);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    // 1. Tee Box Surface (12m x 8m)
    const teeWidth = 8;
    const teeLength = 12;
    const teePts: SurfacePoint[] = [
      { x: tee.x - perpX * (teeWidth / 2) - dirX * 2, z: tee.z - perpZ * (teeWidth / 2) - dirZ * 2 },
      { x: tee.x + perpX * (teeWidth / 2) - dirX * 2, z: tee.z + perpZ * (teeWidth / 2) - dirZ * 2 },
      { x: tee.x + perpX * (teeWidth / 2) + dirX * teeLength, z: tee.z + perpZ * (teeWidth / 2) + dirZ * teeLength },
      { x: tee.x - perpX * (teeWidth / 2) + dirX * teeLength, z: tee.z - perpZ * (teeWidth / 2) + dirZ * teeLength }
    ];

    // 2. Fairway Corridor Surface (Width ~34m)
    const fwWidth = 34;
    const fwStartDist = 30;
    const fwEndDist = Math.max(fwStartDist + 20, length - 22);

    const fwPts: SurfacePoint[] = [
      { x: tee.x - perpX * (fwWidth / 2) + dirX * fwStartDist, z: tee.z - perpZ * (fwWidth / 2) + dirZ * fwStartDist },
      { x: tee.x + perpX * (fwWidth / 2) + dirX * fwStartDist, z: tee.z + perpZ * (fwWidth / 2) + dirZ * fwStartDist },
      { x: tee.x + perpX * (fwWidth / 2) + dirX * fwEndDist, z: tee.z + perpZ * (fwWidth / 2) + dirZ * fwEndDist },
      { x: tee.x - perpX * (fwWidth / 2) + dirX * fwEndDist, z: tee.z - perpZ * (fwWidth / 2) + dirZ * fwEndDist }
    ];

    // 3. Putting Green Surface (Oval, Radius ~16m)
    const greenRadius = 16;
    const greenPts: SurfacePoint[] = [];
    const numGreenSegments = 16;
    for (let i = 0; i < numGreenSegments; i++) {
      const a = (i / numGreenSegments) * Math.PI * 2;
      greenPts.push({
        x: hole.x + Math.cos(a) * greenRadius,
        z: hole.z + Math.sin(a) * (greenRadius * 0.85)
      });
    }

    // 4. Greenside Sand Bunkers (Left and Right of Green)
    const b1Center = { x: hole.x - perpX * 18 + dirX * 4, z: hole.z - perpZ * 18 + dirZ * 4 };
    const b1Pts: SurfacePoint[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b1Pts.push({
        x: b1Center.x + Math.cos(a) * 7,
        z: b1Center.z + Math.sin(a) * 11
      });
    }

    const b2Center = { x: hole.x + perpX * 19 - dirX * 6, z: hole.z + perpZ * 19 - dirZ * 6 };
    const b2Pts: SurfacePoint[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b2Pts.push({
        x: b2Center.x + Math.cos(a) * 9,
        z: b2Center.z + Math.sin(a) * 6
      });
    }

    return [
      { id: 'surf-tee', type: 'TEE', name: 'Tee Box', points: teePts },
      { id: 'surf-fairway', type: 'FAIRWAY', name: 'Fairway Corridor', points: fwPts },
      { id: 'surf-green', type: 'GREEN', name: 'Putting Green', points: greenPts },
      { id: 'surf-bunker-left', type: 'BUNKER', name: 'Left Greenside Bunker', points: b1Pts },
      { id: 'surf-bunker-right', type: 'BUNKER', name: 'Right Greenside Bunker', points: b2Pts }
    ];
  }
}
