import { Vector3 } from 'three';
import { TerrainQuery } from '../course/TerrainQuery';
import { ClubConfig } from '../golf/Club';
import { SwingResult } from '../golf/SwingMeter';

export type BallState = 'REST' | 'AIRBORNE' | 'ROLLING' | 'HOLED';

export class BallPhysics {
  public position: Vector3 = new Vector3();
  public velocity: Vector3 = new Vector3();
  public state: BallState = 'REST';

  private terrainQuery: TerrainQuery;
  private readonly ballRadius: number = 0.043; // Standard golf ball radius in metres

  // Physical constants
  private readonly gravity: number = 9.81;
  private readonly airDensity: number = 1.225; // kg/m^3
  private readonly dragCoeff: number = 0.23;    // Golf ball drag coefficient
  private readonly ballMass: number = 0.0459;   // kg
  private readonly ballArea: number = Math.PI * 0.02135 * 0.02135; // m^2
  private readonly restitution: number = 0.42;  // Turf bounce elasticity
  private readonly rollingFriction: number = 0.14; // Grass rolling friction

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
  }

  public setPosition(x: number, z: number): void {
    const y = this.terrainQuery.getTerrainHeight(x, z, true) + this.ballRadius;
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.state = 'REST';
  }

  /**
   * Launch golf ball with given club, swing result, and aim angle (radians).
   * Aim angle 0 = facing +X down the course, Math.PI/2 = facing +Z.
   */
  public launch(club: ClubConfig, swing: SwingResult, aimAngleRadians: number): void {
    const power = swing.powerRatio;
    const targetDistance = club.maxDistanceMetres * power;

    // Apply hook/slice horizontal deviation angle
    const totalAimAngle = aimAngleRadians + (swing.hookSliceAngleDegrees * Math.PI / 180);

    if (club.isPutter) {
      // Putter: Pure ground roll velocity
      const putterSpeed = Math.sqrt(2 * this.rollingFriction * this.gravity * targetDistance);
      this.velocity.x = Math.cos(totalAimAngle) * putterSpeed;
      this.velocity.y = 0;
      this.velocity.z = Math.sin(totalAimAngle) * putterSpeed;
      this.state = 'ROLLING';
      return;
    }

    // Lofted shot: calculate launch speed and flight velocity
    const loftRad = (club.loftDegrees * Math.PI) / 180;

    // Estimate initial launch speed required to achieve target distance considering drag
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

    // Sub-stepping for collision accuracy
    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      const activeState: string = this.state;

      if (activeState === 'AIRBORNE') {
        this.stepAirborne(subDt);
      } else if (activeState === 'ROLLING') {
        this.stepRolling(subDt);
      }

      // Check distance to cup
      const distToCup = Math.hypot(
        this.position.x - cupPosition.x,
        this.position.z - cupPosition.z
      );

      const speed = this.velocity.length();

      // Cup capture radius ~0.55m, speed threshold < 3.2m/s
      if (distToCup < 0.55 && speed < 3.2 && this.position.y <= cupPosition.y + 0.5) {
        this.position.set(cupPosition.x, cupPosition.y + this.ballRadius, cupPosition.z);
        this.velocity.set(0, 0, 0);
        this.state = 'HOLED';
        return 'HOLED';
      }

      const checkState: string = this.state;
      if (checkState === 'REST' || checkState === 'HOLED') break;
    }

    return this.state;
  }

  private stepAirborne(dt: number): void {
    // 1. Aerodynamic drag force
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

    // 2. Position update
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // 3. Terrain collision check
    const terrainY = this.terrainQuery.getTerrainHeight(this.position.x, this.position.z, true);
    const minHeight = terrainY + this.ballRadius;

    if (this.position.y <= minHeight) {
      this.position.y = minHeight;

      // Surface normal reflection
      const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);
      
      const vDotN = this.velocity.dot(normal);

      if (vDotN < 0) {
        const bounceImpulse = normal.clone().multiplyScalar(-(1 + this.restitution) * vDotN);
        this.velocity.add(bounceImpulse);
      }

      const verticalSpeed = Math.abs(this.velocity.y);
      if (verticalSpeed < 1.2) {
        this.velocity.y = 0;
        this.state = 'ROLLING';
      }
    }
  }

  private stepRolling(dt: number): void {
    const terrainY = this.terrainQuery.getTerrainHeight(this.position.x, this.position.z, true);
    this.position.y = terrainY + this.ballRadius;

    const normal = this.terrainQuery.getTerrainNormal(this.position.x, this.position.z);

    // Slope acceleration along X and Z
    const slopeAccX = -this.gravity * normal.x;
    const slopeAccZ = -this.gravity * normal.z;

    this.velocity.x += slopeAccX * dt;
    this.velocity.z += slopeAccZ * dt;

    // Rolling friction deceleration
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.05) {
      const frictionAcc = this.rollingFriction * this.gravity;
      const newSpeed = Math.max(0, speed - frictionAcc * dt);
      const ratio = newSpeed / speed;
      this.velocity.x *= ratio;
      this.velocity.z *= ratio;
    } else {
      this.velocity.set(0, 0, 0);
      this.state = 'REST';
    }

    // Position update
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
  }
}
