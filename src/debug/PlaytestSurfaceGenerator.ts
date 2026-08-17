import { SurfacePoint, SurfacePolygon } from '../course/SurfaceQuery';

/**
 * DEVELOPMENT PLACEHOLDER GEOMETRY — NOT COURSE DATA.
 *
 * Blueprint §15 forbids the engine constructing course geometry, and §60 forbids
 * inventing fairway or bunker polygons for Hole 6 before they are verified. This
 * generator therefore lives in src/debug/ rather than src/course/, and exists only
 * so ball physics can be exercised while Phase 1 survey work is outstanding.
 *
 * It is not part of the course pipeline:
 *   - it runs only when hole.json carries no traced surfaces;
 *   - every polygon it emits is flagged `provisional: true`;
 *   - its output is fed through the same SurfacePolygon path as real course data,
 *     so deleting this file changes nothing about how surfaces are consumed;
 *   - nothing writes its output back to hole.json.
 *
 * When Hole 6 is surveyed, populate hole.json's "surfaces" array and this generator
 * stops being called. Delete it once every course ships traced geometry.
 */

export interface PlaytestPoint {
  x: number;
  z: number;
}

export class PlaytestSurfaceGenerator {
  /**
   * Build a generic tee / fairway corridor / green / bunker set along the line
   * between two developer-chosen points. The shapes are golf-plausible defaults,
   * not measurements of anything.
   */
  public static generate(tee: PlaytestPoint, hole: PlaytestPoint): SurfacePolygon[] {
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
      { id: 'playtest-tee', type: 'TEE', name: 'Tee Box (placeholder)', points: teePts, provisional: true },
      { id: 'playtest-fairway', type: 'FAIRWAY', name: 'Fairway Corridor (placeholder)', points: fwPts, provisional: true },
      { id: 'playtest-green', type: 'GREEN', name: 'Putting Green (placeholder)', points: greenPts, provisional: true },
      { id: 'playtest-bunker-left', type: 'BUNKER', name: 'Left Greenside Bunker (placeholder)', points: b1Pts, provisional: true },
      { id: 'playtest-bunker-right', type: 'BUNKER', name: 'Right Greenside Bunker (placeholder)', points: b2Pts, provisional: true }
    ];
  }
}
