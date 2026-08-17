import { LieInfo, ReliefRule, SurfaceQuery } from '../course/SurfaceQuery';
import { TerrainQuery } from '../course/TerrainQuery';

export interface PenaltyPoint {
  x: number;
  z: number;
}

export interface PenaltyRuling {
  relief: ReliefRule;
  penaltyStrokes: number;
  /** Where the ball is put back into play. */
  dropPosition: PenaltyPoint;
  /** Short HUD headline, e.g. "OUT OF BOUNDS". */
  headline: string;
  /** One line explaining what happened and what it cost. */
  detail: string;
}

/**
 * Rules relief for balls that come to rest somewhere unplayable (blueprint §17, §18).
 *
 * Kept out of BallPhysics deliberately: physics decides where the ball stops, this
 * decides what the rules do about it. Both the ruling and its cost are driven by
 * LieInfo.relief, so adding a surface type needs no change here.
 */
export class PenaltyRules {
  /** How far back along the line of play to look for a playable drop. */
  private readonly maxSearchMetres = 80;
  private readonly searchStepMetres = 0.5;

  constructor(
    private readonly terrainQuery: TerrainQuery,
    private readonly surfaceQuery: SurfaceQuery
  ) {}

  /**
   * Evaluate a ball at rest. Returns null when the ball is playable as it lies.
   *
   * @param restingLie   lie reported where the ball stopped
   * @param restingPos   where the ball stopped
   * @param shotOrigin   where the stroke that got it there was played from
   * @param leftTerrain  true when the ball flew off the mapped DEM entirely
   */
  public evaluate(
    restingLie: LieInfo,
    restingPos: PenaltyPoint,
    shotOrigin: PenaltyPoint,
    leftTerrain: boolean
  ): PenaltyRuling | null {
    if (leftTerrain) {
      return {
        relief: 'STROKE_AND_DISTANCE',
        penaltyStrokes: 1,
        dropPosition: { ...shotOrigin },
        headline: 'OUT OF BOUNDS',
        detail: 'Ball left the mapped course. One penalty stroke, replay from the previous spot.'
      };
    }

    switch (restingLie.relief) {
      case 'NONE':
        return null;

      case 'STROKE_AND_DISTANCE':
        return {
          relief: 'STROKE_AND_DISTANCE',
          penaltyStrokes: 1,
          dropPosition: { ...shotOrigin },
          headline: 'OUT OF BOUNDS',
          detail: 'One penalty stroke, replay from the previous spot.'
        };

      case 'LATERAL_DROP': {
        const drop = this.findNearestPlayablePoint(restingPos, shotOrigin);
        if (!drop) {
          // Nothing playable between the ball and the previous spot — fall back to
          // stroke and distance rather than dropping somewhere still unplayable.
          return {
            relief: 'STROKE_AND_DISTANCE',
            penaltyStrokes: 1,
            dropPosition: { ...shotOrigin },
            headline: `${restingLie.name.toUpperCase()}`,
            detail: 'No playable drop on the line of play. One penalty stroke, replay from the previous spot.'
          };
        }
        return {
          relief: 'LATERAL_DROP',
          penaltyStrokes: 1,
          dropPosition: drop,
          headline: restingLie.name.toUpperCase(),
          detail: 'One penalty stroke, dropping on the line of play.'
        };
      }

      case 'FREE_DROP': {
        const drop = this.findNearestPlayablePoint(restingPos, shotOrigin);
        if (!drop) return null; // No relief available; play it as it lies.
        return {
          relief: 'FREE_DROP',
          penaltyStrokes: 0,
          dropPosition: drop,
          headline: restingLie.name.toUpperCase(),
          detail: 'Free relief, no penalty. Dropping at the nearest playable point.'
        };
      }
    }
  }

  /**
   * Walk back from the ball toward the previous shot position looking for the first
   * point that is on the terrain and needs no relief.
   *
   * A simplification of the real nearest-point-of-relief, which searches in every
   * direction. Searching the line of play keeps the drop somewhere the player
   * expects and can never advance the ball toward the hole.
   */
  private findNearestPlayablePoint(from: PenaltyPoint, toward: PenaltyPoint): PenaltyPoint | null {
    const dx = toward.x - from.x;
    const dz = toward.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return null;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const limit = Math.min(this.maxSearchMetres, dist);

    for (let step = this.searchStepMetres; step <= limit; step += this.searchStepMetres) {
      const x = from.x + dirX * step;
      const z = from.z + dirZ * step;

      if (this.terrainQuery.queryTerrainHeight(x, z).isOutOfBounds) continue;
      if (this.surfaceQuery.getLieAt(x, z).relief !== 'NONE') continue;

      return { x, z };
    }

    return null;
  }
}
