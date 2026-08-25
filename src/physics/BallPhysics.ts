import { Vector3 } from 'three';
import { SurfaceQuery, LieInfo, SURFACE_PROPERTIES } from '../course/SurfaceQuery';
import { TerrainQuery } from '../course/TerrainQuery';
import { ClubConfig } from '../golf/Club';
import { SwingResult } from '../golf/SwingMeter';

export type BallState = 'REST' | 'AIRBORNE' | 'ROLLING' | 'HOLED';

export class BallPhysics {
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

  private readonly ballRadius: number = 0.043; // Standard golf ball radius in metres

  /**
   * Floor on the effective lie distance multiplier. No lie may reduce a swing to zero
   * launch speed — that would leave the ball frozen while strokes accumulate.
   */
  private readonly minEffectiveDistanceMultiplier: number = 0.25;

  // Physical constants
  private readonly gravity: number = 9.81;
  private readonly airDensity: number = 1.225; // kg/m^3
  private readonly dragCoeff: number = 0.23;    // Golf ball drag coefficient
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
   *
   * Throws on out-of-bounds input: callers own valid coordinates, and §94 requires a
   * useful error rather than a silently relocated ball.
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
    this.updateCurrentLie();
  }

  public updateCurrentLie(): LieInfo {
    if (this.leftTerrain) {
      // Beyond the mapped course there is no surface to classify.
      this.currentLie = SURFACE_PROPERTIES.OUT_OF_BOUNDS;
      return this.currentLie;
    }

    if (this.surfaceQuery) {
      this.currentLie = this.surfaceQuery.getLieAt(this.position.x, this.position.z);
    }
    return this.currentLie;
  }

  /**
   * Launch golf ball with lie penalties applied.
   */
  public launch(club: ClubConfig, swing: SwingResult, aimAngleRadians: number): void {
    this.updateCurrentLie();

    // Lie multipliers
    const lieDistMult = Math.max(this.minEffectiveDistanceMultiplier, this.currentLie.distanceMultiplier);
    const lieCtrlMult = this.currentLie.controlMultiplier;

    const power = swing.powerRatio;
    const targetDistance = club.maxDistanceMetres * power * lieDistMult;

    // Apply accuracy deviation scaled by control multiplier
    const deviationAngle = (swing.hookSliceAngleDegrees / Math.max(0.2, lieCtrlMult)) * Math.PI / 180;
    const totalAimAngle = aimAngleRadians + deviationAngle;

    this.leftTerrain = false;
    this.rollDuration = 0;

    if (club.isPutter) {
      const putterSpeed = Math.sqrt(2 * this.currentLie.rollingFriction * this.gravity * targetDistance);
      this.velocity.x = Math.cos(totalAimAngle) * putterSpeed;
      this.velocity.y = 0;
      this.velocity.z = Math.sin(totalAimAngle) * putterSpeed;
      this.state = 'ROLLING';
      return;
    }

    const loftRad = (club.loftDegrees * Math.PI) / 180;
    const sin2Loft = Math.sin(2 * loftRad);
    const vacuumSpeed = Math.sqrt((targetDistance * this.gravity) / Math.max(0.1, sin2Loft));
    const launchSpeed = vacuumSpeed * (1 + targetDistance * 0.0012);

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
      const activeState: string = this.state;

      if (activeState === 'AIRBORNE') {
        this.stepAirborne(subDt);
      } else if (activeState === 'ROLLING') {
        this.stepRolling(subDt);
      }

      if (this.leftTerrain) {
        this.updateCurrentLie();
        return this.state;
      }

      // Check distance to cup
      const distToCup = Math.hypot(
        this.position.x - cupPosition.x,
        this.position.z - cupPosition.z
      );

      const speed = this.velocity.length();

      if (distToCup < 0.55 && speed < 3.2 && this.position.y <= cupPosition.y + 0.5) {
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

      // Update surface lie at bounce point
      this.updateCurrentLie();

      const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);
      const vDotN = this.velocity.dot(normal);

      if (vDotN < 0) {
        const bounceImpulse = normal.clone().multiplyScalar(-(1 + this.currentLie.restitution) * vDotN);
        this.velocity.add(bounceImpulse);
      }

      const verticalSpeed = Math.abs(this.velocity.y);
      if (verticalSpeed < 1.2) {
        this.velocity.y = 0;
        this.state = 'ROLLING';
      }
    }
  }

  private rollDuration: number = 0;

  private stepRolling(dt: number): void {
    this.rollDuration += dt;
    const terrainY = this.terrainQuery.getTerrainHeight(this.position.x, this.position.z);
    this.position.y = terrainY + this.ballRadius;

    this.updateCurrentLie();

    const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);

    const slopeAccX = -this.gravity * normal.x;
    const slopeAccZ = -this.gravity * normal.z;

    this.velocity.x += slopeAccX * dt;
    this.velocity.z += slopeAccZ * dt;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.20 && this.rollDuration < 4.5) {
      const frictionAcc = this.currentLie.rollingFriction * this.gravity;
      const newSpeed = Math.max(0, speed - frictionAcc * dt);
      const ratio = newSpeed / speed;
      this.velocity.x *= ratio;
      this.velocity.z *= ratio;
    } else {
      this.velocity.set(0, 0, 0);
      this.state = 'REST';
      return;
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
   * Bring the ball to rest at the last position that was actually on the terrain and
   * flag it as having left the course. The rules layer decides what that costs.
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
