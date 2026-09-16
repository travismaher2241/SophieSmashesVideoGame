import { Vector3 } from 'three';
import { SurfaceQuery, LieInfo, SURFACE_PROPERTIES } from '../course/SurfaceQuery';
import { TerrainQuery } from '../course/TerrainQuery';
import { ClubConfig } from '../golf/Club';
import { SwingResult } from '../golf/SwingMeter';

export type BallState = 'REST' | 'AIRBORNE' | 'BOUNCING' | 'ROLLING' | 'HOLED';

export class BallPhysics {
  /**
   * Sideways acceleration per unit of side spin, per metre/second of forward
   * speed. Set so a driver curves about as far as it did under the old capped
   * force, while slower clubs now curve proportionally less.
   */
  private static readonly CURVE_FORCE_PER_SPEED = 0.045;

  public position: Vector3 = new Vector3();
  public velocity: Vector3 = new Vector3();
  public state: BallState = 'REST';

  /**
   * True when the ball travelled beyond the mapped DEM extent. Blueprint §14 requires
   * that off-grid coordinates are not silently given a plausible-looking height, so
   * physics stops the ball at the terrain edge rather than clamping and continuing.
   */
  public leftTerrain: boolean = false;

  private terrainQuery: TerrainQuery;
  private surfaceQuery?: SurfaceQuery;
  private currentLie: LieInfo = SURFACE_PROPERTIES.TEE;

  private clubSpin: number = 0;   // Spin / green-holding check factor (0.1 to 1.0)
  private curveSpin: number = 0;  // Lateral side spin factor (-1.0 to +1.0)
  private rollDuration: number = 0;

  private readonly ballRadius: number = 0.043; // Standard golf ball radius in metres

  /**
   * Floor on the effective lie distance multiplier. No lie may reduce a swing to zero
   * launch speed — that would leave the ball frozen while strokes accumulate.
   */
  private readonly minEffectiveDistanceMultiplier: number = 0.25;

  // Physical constants
  private readonly gravity: number = 9.81;
  private readonly airDensity: number = 1.225; // kg/m^3
  private readonly dragCoeff: number = 0.22;    // Golf ball aerodynamic drag coefficient
  private readonly ballMass: number = 0.0459;   // kg
  private readonly ballArea: number = Math.PI * 0.02135 * 0.02135; // m^2

  constructor(terrainQuery: TerrainQuery, surfaceQuery?: SurfaceQuery) {
    this.terrainQuery = terrainQuery;
    this.surfaceQuery = surfaceQuery;
  }

  public setSurfaceQuery(surfaceQuery: SurfaceQuery): void {
    this.surfaceQuery = surfaceQuery;
  }

  public getCurrentLie(): LieInfo {
    return this.currentLie;
  }

  /**
   * Place the ball at a known-good course position (tee, or a rules drop).
   */
  public setPosition(x: number, z: number): void {
    const query = this.terrainQuery.queryTerrainHeight(x, z);
    if (query.isOutOfBounds) {
      throw new RangeError(
        `Cannot place ball at (${x.toFixed(1)}, ${z.toFixed(1)}): position is outside the loaded terrain extent.`
      );
    }

    this.position.set(x, query.height + this.ballRadius, z);
    this.velocity.set(0, 0, 0);
    this.state = 'REST';
    this.leftTerrain = false;
    this.clubSpin = 0;
    this.curveSpin = 0;
    this.rollDuration = 0;
    this.updateCurrentLie();
  }

  public updateCurrentLie(): LieInfo {
    if (this.leftTerrain) {
      this.currentLie = SURFACE_PROPERTIES.OUT_OF_BOUNDS;
      return this.currentLie;
    }

    if (this.surfaceQuery) {
      this.currentLie = this.surfaceQuery.getLieAt(this.position.x, this.position.z);
    }
    return this.currentLie;
  }

  /**
   * Launch golf ball with club-specific loft, carry distance, and lie penalties applied.
   */
  public launch(club: ClubConfig, swing: SwingResult, aimAngleRadians: number): void {
    this.updateCurrentLie();

    const lieDistMult = Math.max(this.minEffectiveDistanceMultiplier, this.currentLie.distanceMultiplier);
    const lieCtrlMult = this.currentLie.controlMultiplier;

    const power = swing.powerRatio;

    // Apply accuracy deviation scaled by control multiplier
    const deviationAngle = (swing.hookSliceAngleDegrees / Math.max(0.2, lieCtrlMult)) * (Math.PI / 180);
    const totalAimAngle = aimAngleRadians + deviationAngle;

    this.clubSpin = (club.spinFactor ?? 0.5) * power;
    this.curveSpin = swing.curveSpinFactor || 0;
    this.leftTerrain = false;
    this.rollDuration = 0;

    if (club.isPutter) {
      // Putting launch: ground roll directly
      const targetPuttDist = Math.max(1.0, 30.0 * power * lieDistMult);
      const putterSpeed = Math.sqrt(2 * this.currentLie.rollingFriction * this.gravity * targetPuttDist);
      this.velocity.x = Math.cos(totalAimAngle) * putterSpeed;
      this.velocity.y = 0;
      this.velocity.z = Math.sin(totalAimAngle) * putterSpeed;
      this.state = 'ROLLING';
      return;
    }

    const targetCarry = (club.carryMetres ?? club.maxDistanceMetres ?? 150) * power * lieDistMult;
    const launchAngleDeg = Math.max(8, Math.min(65, club.launchAngleDeg ?? club.loftDegrees ?? 15));
    const loftRad = (launchAngleDeg * Math.PI) / 180;
    const sin2Loft = Math.sin(2 * loftRad);

    // Ballistic vacuum speed with drag correction scaling across lofts
    const vacuumSpeed = Math.sqrt((targetCarry * this.gravity) / Math.max(0.1, sin2Loft));
    const speedCorrection = 1.0 + (targetCarry * 0.00160) / Math.pow(Math.max(0.1, sin2Loft), 0.35);
    const launchSpeed = vacuumSpeed * speedCorrection;

    const horizontalSpeed = launchSpeed * Math.cos(loftRad);
    const verticalSpeed = launchSpeed * Math.sin(loftRad);

    this.velocity.x = Math.cos(totalAimAngle) * horizontalSpeed;
    this.velocity.y = verticalSpeed;
    this.velocity.z = Math.sin(totalAimAngle) * horizontalSpeed;

    this.state = 'AIRBORNE';
  }

  /**
   * Physics simulation sub-step.
   */
  public update(dt: number, cupPosition: Vector3): BallState {
    if (this.state === 'REST' || this.state === 'HOLED') {
      return this.state;
    }

    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      const activeState = this.state;

      if (activeState === 'AIRBORNE' || activeState === 'BOUNCING') {
        this.stepAirborne(subDt);
      } else if (activeState === 'ROLLING') {
        this.stepRolling(subDt);
      }

      if (this.leftTerrain) {
        this.updateCurrentLie();
        return this.state;
      }

      // Check distance to cup (hole in condition)
      const distToCup = Math.hypot(
        this.position.x - cupPosition.x,
        this.position.z - cupPosition.z
      );

      const speed = this.velocity.length();

      if (distToCup < 0.55 && speed < 3.2 && this.position.y <= cupPosition.y + 0.4) {
        this.position.set(cupPosition.x, cupPosition.y + this.ballRadius, cupPosition.z);
        this.velocity.set(0, 0, 0);
        this.state = 'HOLED';
        this.updateCurrentLie();
        return 'HOLED';
      }

      const checkState: string = this.state;
      if (checkState === 'REST' || checkState === 'HOLED') break;
    }

    this.updateCurrentLie();
    return this.state;
  }

  private stepAirborne(dt: number): void {
    const vMag = this.velocity.length();

    if (vMag > 0.01) {
      const dragMag = 0.5 * this.airDensity * this.dragCoeff * this.ballArea * vMag * vMag;
      const dragAcc = dragMag / this.ballMass;
      const dragVx = -(this.velocity.x / vMag) * dragAcc;
      const dragVy = -(this.velocity.y / vMag) * dragAcc;
      const dragVz = -(this.velocity.z / vMag) * dragAcc;

      this.velocity.x += dragVx * dt;
      this.velocity.y += (dragVy - this.gravity) * dt;
      this.velocity.z += dragVz * dt;

      // Lateral aerodynamic curve from side spin.
      //
      // The sideways force is proportional to how fast the ball is travelling,
      // as the Magnus force actually is. That matters for more than realism: the
      // acceleration used to be capped, which made the curve depend on hang time
      // rather than on ground covered. A lofted club has plenty of hang time and
      // covers little ground, so a shaped 9 iron bent twice as far off line as a
      // driver. Tying the force to speed makes the curve scale with the shot.
      const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizSpeed > 1.0 && Math.abs(this.curveSpin) > 0.01) {
        const perpX = -this.velocity.z / horizSpeed;
        const perpZ = this.velocity.x / horizSpeed;
        const curveAcc = this.curveSpin * BallPhysics.CURVE_FORCE_PER_SPEED * horizSpeed;
        this.velocity.x += perpX * curveAcc * dt;
        this.velocity.z += perpZ * curveAcc * dt;
      }
    } else {
      this.velocity.y -= this.gravity * dt;
    }

    const prevX = this.position.x;
    const prevZ = this.position.z;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    const query = this.terrainQuery.queryTerrainHeight(this.position.x, this.position.z);
    if (query.isOutOfBounds) {
      this.stopAtTerrainEdge(prevX, prevZ);
      return;
    }

    const minHeight = query.height + this.ballRadius;

    if (this.position.y <= minHeight) {
      this.position.y = minHeight;
      this.updateCurrentLie();
      this.handleGroundContact();
    }
  }

  /**
   * Dedicated ground contact / bounce calculation.
   * Damps vertical velocity by restitution and horizontal velocity by tangential impact friction scaled with spin.
   */
  private handleGroundContact(): void {
    const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);
    const vDotN = this.velocity.dot(normal);

    // Only process impact if ball is moving into the ground
    if (vDotN < 0) {
      // Decompose velocity into normal and tangential components
      const vNormal = normal.clone().multiplyScalar(vDotN);
      const vTangential = this.velocity.clone().sub(vNormal);

      // Rebound normal velocity with restitution
      const reboundNormal = vNormal.multiplyScalar(-this.currentLie.restitution);

      // Apply tangential impact friction (damps forward roll energy on contact)
      // Club spin (high in irons/wedges) aggressively checks forward velocity
      let effectiveImpactFriction = this.currentLie.impactFriction + this.clubSpin * 0.42;

      // On Green: extra spin bite from wedges
      if (this.currentLie.type === 'GREEN' && this.clubSpin > 0.3) {
        effectiveImpactFriction += this.clubSpin * 0.20;
      }

      effectiveImpactFriction = Math.min(0.96, Math.max(0.20, effectiveImpactFriction));

      vTangential.multiplyScalar(Math.max(0, 1 - effectiveImpactFriction));

      // Recombine velocity
      this.velocity.copy(vTangential).add(reboundNormal);

      // Reduce remaining spin on each ground impact
      this.clubSpin *= 0.30;
      this.curveSpin *= 0.35;

      const reboundSpeed = Math.abs(reboundNormal.length());
      const tangentialSpeed = vTangential.length();

      // Transition to ROLLING once vertical bounce energy is low
      if (reboundSpeed < 0.85 || (tangentialSpeed < 2.0 && reboundSpeed < 1.3)) {
        this.velocity.copy(vTangential);
        this.velocity.y = 0;
        this.state = 'ROLLING';
        this.rollDuration = 0;
      } else {
        this.state = 'BOUNCING';
      }
    } else {
      // Moving upward off ground
      if (this.velocity.y < 0.5) {
        this.velocity.y = 0;
        this.state = 'ROLLING';
      }
    }
  }

  private stepRolling(dt: number): void {
    this.rollDuration += dt;
    const terrainY = this.terrainQuery.getTerrainHeight(this.position.x, this.position.z);
    this.position.y = terrainY + this.ballRadius;

    this.updateCurrentLie();

    const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);

    // Slope acceleration along terrain surface: downhill direction is +normal.x and +normal.z
    const slopeAccX = this.gravity * normal.x;
    const slopeAccZ = this.gravity * normal.z;

    this.velocity.x += slopeAccX * dt;
    this.velocity.z += slopeAccZ * dt;
    this.velocity.y = 0;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Dynamic rolling resistance deceleration: a_friction = rollingFriction * g * normal_y
    const frictionAcc = this.currentLie.rollingFriction * this.gravity * Math.max(0.3, normal.y);
    const newSpeed = Math.max(0, speed - frictionAcc * dt);

    if (speed > 0.001) {
      const ratio = newSpeed / speed;
      this.velocity.x *= ratio;
      this.velocity.z *= ratio;
    }

    // Decisive REST stop condition:
    // When speed is below 0.08 m/s, check if slope gravity exceeds static friction
    const currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const slopeMagnitude = this.gravity * Math.hypot(normal.x, normal.z);
    const staticFriction = this.currentLie.rollingFriction * this.gravity * normal.y * 1.15;

    if (currentSpeed < 0.08 || (this.rollDuration > 5.0 && currentSpeed < 0.25)) {
      if (slopeMagnitude <= staticFriction || this.rollDuration > 7.0) {
        this.velocity.set(0, 0, 0);
        this.state = 'REST';
        return;
      }
    }

    const prevX = this.position.x;
    const prevZ = this.position.z;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    if (this.terrainQuery.queryTerrainHeight(this.position.x, this.position.z).isOutOfBounds) {
      this.stopAtTerrainEdge(prevX, prevZ);
    }
  }

  /**
   * Bring the ball to rest at the last position that was actually on the terrain.
   */
  private stopAtTerrainEdge(lastInBoundsX: number, lastInBoundsZ: number): void {
    const height = this.terrainQuery.getTerrainHeight(lastInBoundsX, lastInBoundsZ, true);
    this.position.set(lastInBoundsX, height + this.ballRadius, lastInBoundsZ);
    this.velocity.set(0, 0, 0);
    this.state = 'REST';
    this.leftTerrain = true;
    this.updateCurrentLie();
  }
}
