import { Vector3 } from 'three';
import { TerrainQuery } from '../course/TerrainQuery';

export type GreenSpeedMode = 'SLOW' | 'NORMAL' | 'FAST' | 'VERY_FAST';

export interface GreenSpeedConfig {
  name: string;
  stimpMetres: number;
  frictionCoeff: number; // Rolling resistance coefficient mu
}

export const GREEN_SPEEDS: Record<GreenSpeedMode, GreenSpeedConfig> = {
  SLOW: { name: 'Slow (Stimp 8)', stimpMetres: 2.4, frictionCoeff: 0.092 },
  NORMAL: { name: 'Normal (Stimp 10)', stimpMetres: 3.0, frictionCoeff: 0.076 },
  FAST: { name: 'Fast (Stimp 11.5)', stimpMetres: 3.5, frictionCoeff: 0.065 },
  VERY_FAST: { name: 'Tournament (Stimp 13)', stimpMetres: 4.0, frictionCoeff: 0.055 }
};

export type PuttingState = 'REST' | 'ROLLING' | 'HOLED';

/** Regulation cup: 108mm across. */
export const CUP_RADIUS_METRES = 0.054;

/**
 * How close the ball's centre has to come for the cup to take it.
 *
 * A little wider than the cup itself, because a ball only has to get its centre
 * over the edge to fall in. This is the number the drawn hole must match: if the
 * black is wider than this, balls roll over the hole without dropping and the
 * picture is lying about where the target is.
 */
export const CUP_CAPTURE_RADIUS_METRES = CUP_RADIUS_METRES + 0.02135 * 0.45;

export class PuttingPhysics {
  public position: Vector3 = new Vector3();
  public velocity: Vector3 = new Vector3();
  public state: PuttingState = 'REST';
  public wasLipOut: boolean = false;
  public rollDistanceTraveled: number = 0;

  private terrainQuery: TerrainQuery;
  private greenSpeed: GreenSpeedConfig = GREEN_SPEEDS.NORMAL;

  // Real physical constants
  public readonly ballRadius: number = 0.02135; // Standard golf ball radius (metres)
  public readonly cupRadius: number = CUP_RADIUS_METRES;
  private readonly gravity: number = 9.81;

  private rollDuration: number = 0;
  private random: () => number = Math.random;
  private startPosition: Vector3 = new Vector3();

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  /** Pin the stroke's wobble down, for a test that needs the same putt twice. */
  public setRandomSource(random: () => number): void {
    this.random = random;
  }

  /**
   * A signed error inside the given bound, bunched towards the middle.
   *
   * Two draws averaged rather than one, so most strokes are close to what was
   * asked for and the bad ones are rare — which is how a stroke misses, and not
   * how a flat random number behaves.
   */
  private spread(bound: number): number {
    if (bound <= 0) return 0;

    return ((this.random() + this.random()) - 1) * bound;
  }

  public setGreenSpeed(mode: GreenSpeedMode): void {
    this.greenSpeed = GREEN_SPEEDS[mode] || GREEN_SPEEDS.NORMAL;
  }

  public getGreenSpeed(): GreenSpeedConfig {
    return this.greenSpeed;
  }

  public setPosition(x: number, z: number): void {
    const terrainY = this.terrainQuery.getTerrainHeight(x, z, true);
    this.position.set(x, terrainY + this.ballRadius, z);
    this.velocity.set(0, 0, 0);
    this.state = 'REST';
    this.wasLipOut = false;
    this.rollDuration = 0;
    this.rollDistanceTraveled = 0;
    this.startPosition.copy(this.position);
  }

  /**
   * Launch a putt based on intended roll distance and aim angle.
   * On a flat green: v = sqrt(2 * mu * g * distance)
   */
  /**
   * Strike a putt.
   *
   * `paceError` and `lineErrorDegrees` are how far the stroke may stray from
   * what the player set, as a fraction of the pace and an angle off the line.
   * Both default to nothing, which is what putting used to be: the ball went
   * precisely as far as the meter said, precisely down the aim line, every
   * single time. That is a calculator rather than a skill, and it left a session
   * on the putting green with nothing to improve.
   */
  public launchPutt(
    intendedDistanceMetres: number,
    aimAngleRadians: number,
    paceError = 0,
    lineErrorDegrees = 0
  ): void {
    const mu = this.greenSpeed.frictionCoeff;
    const struckDistance = Math.max(
      0.2,
      intendedDistanceMetres * (1 + this.spread(paceError))
    );
    const launchSpeed = Math.sqrt(2 * mu * this.gravity * struckDistance);
    const struckAngle = aimAngleRadians + (this.spread(lineErrorDegrees) * Math.PI) / 180;

    this.velocity.x = Math.cos(struckAngle) * launchSpeed;
    this.velocity.y = 0;
    this.velocity.z = Math.sin(struckAngle) * launchSpeed;

    this.state = 'ROLLING';
    this.wasLipOut = false;
    this.rollDuration = 0;
    this.rollDistanceTraveled = 0;
    this.startPosition.copy(this.position);
  }

  /**
   * Step the putting simulation in the tangent plane of the green.
   */
  public update(dt: number, cupPosition: Vector3): PuttingState {
    if (this.state === 'REST' || this.state === 'HOLED') {
      return this.state;
    }

    // High numerical fidelity sub-stepping for smooth break curves and accurate cup capture
    const subSteps = 8;
    const subDt = dt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      this.stepPuttingPlane(subDt, cupPosition);
      const checkState: string = this.state;
      if (checkState === 'REST' || checkState === 'HOLED') break;
    }

    return this.state;
  }

  private stepPuttingPlane(dt: number, cupPosition: Vector3): void {
    this.rollDuration += dt;

    const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);

    // 1. Realistic green slope acceleration component.
    // Golf ball rotational inertia (5/7) and grass blade turf resistance damp raw incline acceleration
    // so green breaks remain natural, believable, and never produce runaway infinite rolling.
    const slopeInfluence = 0.28;
    const slopeAccX = this.gravity * normal.x * slopeInfluence;
    const slopeAccZ = this.gravity * normal.z * slopeInfluence;

    this.velocity.x += slopeAccX * dt;
    this.velocity.z += slopeAccZ * dt;
    this.velocity.y = 0;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    // 2. Rolling resistance friction deceleration: a_friction = mu * g * normal_y
    const frictionAcc = this.greenSpeed.frictionCoeff * this.gravity * Math.max(0.5, normal.y);
    const newSpeed = Math.max(0, speed - frictionAcc * dt);

    if (speed > 0.0001) {
      const ratio = newSpeed / speed;
      this.velocity.x *= ratio;
      this.velocity.z *= ratio;
    }

    // 3. Move planar coordinates
    const stepDx = this.velocity.x * dt;
    const stepDz = this.velocity.z * dt;
    this.position.x += stepDx;
    this.position.z += stepDz;
    this.rollDistanceTraveled += Math.hypot(stepDx, stepDz);

    // Constrain ball to terrain height
    const terrainY = this.terrainQuery.getTerrainHeight(this.position.x, this.position.z, true);
    this.position.y = terrainY + this.ballRadius;

    // 4. Physical 108mm Cup Interaction
    const dx = this.position.x - cupPosition.x;
    const dz = this.position.z - cupPosition.z;
    const distToCup = Math.hypot(dx, dz);
    const currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    const captureRadius = CUP_CAPTURE_RADIUS_METRES;

    if (distToCup <= captureRadius) {
      if (this.wasLipOut) {
        // Ball is currently in the middle of lipping out and exiting rim
        // do not re-capture immediately
      } else if (currentSpeed < 1.6) {
        // True capture: falls directly into the cup
        this.position.set(cupPosition.x, cupPosition.y + this.ballRadius, cupPosition.z);
        this.velocity.set(0, 0, 0);
        this.state = 'HOLED';
        return;
      } else if (currentSpeed < 2.8) {
        // Check alignment with cup centre (radial offset)
        const isCentreHit = distToCup <= this.cupRadius * 0.48;
        if (isCentreHit) {
          // Centred strike drops even with aggressive pace
          this.position.set(cupPosition.x, cupPosition.y + this.ballRadius, cupPosition.z);
          this.velocity.set(0, 0, 0);
          this.state = 'HOLED';
          return;
        } else {
          // Lip-out / horseshoe deflection near rim
          this.wasLipOut = true;
          // Apply rim deflection torque: deflect tangential to cup rim
          const rimNormalX = dx / Math.max(0.001, distToCup);
          const rimNormalZ = dz / Math.max(0.001, distToCup);
          
          // Deflect velocity outward along rim and damp speed by 25%
          this.velocity.x = (this.velocity.x + rimNormalX * 0.6) * 0.75;
          this.velocity.z = (this.velocity.z + rimNormalZ * 0.6) * 0.75;
        }
      }
      // Speed >= 2.8 m/s: ball skims over cup lip without falling
    }

    // 5. Decisive, Creep-Free REST Condition
    // Once kinetic energy is negligible, settle the ball cleanly without creeping
    if (currentSpeed < 0.035 || (this.rollDuration > 8.0 && currentSpeed < 0.15)) {
      this.velocity.set(0, 0, 0);
      this.state = 'REST';
    }
  }
}
