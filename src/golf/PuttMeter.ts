export type PuttMeterState = 'AIMING' | 'CHARGING' | 'LOCKED' | 'COMPLETE';

export interface PuttResult {
  intendedDistanceMetres: number;
  paceRatio: number; // 0.0 to 1.0
  targetDistanceMetres: number;
}

export class PuttMeter {
  private state: PuttMeterState = 'AIMING';
  private paceRatio: number = 0;
  private maxMeterDistance: number = 10;
  private targetDistance: number = 5;
  private chargeDirection: number = 1; // 1 = filling up, -1 = emptying down

  // Meter fill cycle duration (seconds from 0% to 100%)
  private readonly fillDurationSec: number = 1.6;

  constructor() {}

  public reset(targetDistanceMetres: number = 5): void {
    this.state = 'AIMING';
    this.paceRatio = 0;
    this.chargeDirection = 1;
    this.targetDistance = Math.max(0.5, targetDistanceMetres);

    // Auto-scale meter range so short putts have fine resolution
    if (this.targetDistance <= 2.5) {
      this.maxMeterDistance = Math.max(3.5, this.targetDistance * 1.6);
    } else if (this.targetDistance <= 6.0) {
      this.maxMeterDistance = Math.max(8.0, this.targetDistance * 1.5);
    } else if (this.targetDistance <= 12.0) {
      this.maxMeterDistance = Math.max(16.0, this.targetDistance * 1.4);
    } else {
      this.maxMeterDistance = Math.max(25.0, this.targetDistance * 1.3);
    }
  }

  public getState(): PuttMeterState {
    return this.state;
  }

  public getPaceRatio(): number {
    return this.paceRatio;
  }

  public getIntendedDistance(): number {
    return this.paceRatio * this.maxMeterDistance;
  }

  public getMaxMeterDistance(): number {
    return this.maxMeterDistance;
  }

  public getTargetDistance(): number {
    return this.targetDistance;
  }

  /**
   * Handle primary Putt button interaction:
   * 1st click/press -> begins CHARGING pace meter.
   * 2nd click/release -> locks pace and STRIKES the putt.
   */
  public triggerPuttAction(): PuttResult | null {
    if (this.state === 'AIMING') {
      this.state = 'CHARGING';
      this.paceRatio = 0;
      this.chargeDirection = 1;
      return null;
    }

    if (this.state === 'CHARGING') {
      this.state = 'COMPLETE';
      return this.getResult();
    }

    return null;
  }

  public update(dt: number): void {
    if (this.state !== 'CHARGING') return;

    const rate = 1 / this.fillDurationSec;
    this.paceRatio += this.chargeDirection * rate * dt;

    if (this.paceRatio >= 1.0) {
      this.paceRatio = 1.0;
      this.chargeDirection = -1; // Bounce back down from 100%
    } else if (this.paceRatio <= 0.05 && this.chargeDirection === -1) {
      this.paceRatio = 0.05;
      this.chargeDirection = 1; // Bounce back up
    }
  }

  public getResult(): PuttResult {
    const intendedDistanceMetres = Math.max(0.3, this.paceRatio * this.maxMeterDistance);
    return {
      intendedDistanceMetres,
      paceRatio: this.paceRatio,
      targetDistanceMetres: this.targetDistance
    };
  }
}
