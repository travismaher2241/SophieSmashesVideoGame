export type SwingMeterState = 'IDLE' | 'POWER_RISING' | 'ACCURACY_FALLING' | 'COMPLETE';

export interface SwingResult {
  powerRatio: number;      // 0.0 to 1.0
  accuracyRatio: number;   // -1.0 (Hook) to +1.0 (Slice), 0.0 is Perfect
  isPerfect: boolean;      // True if accuracy within sweet spot (+/- 0.08)
  hookSliceAngleDegrees: number; // Horizontal spread angle (+/- degrees)
}

export class SwingMeter {
  private state: SwingMeterState = 'IDLE';

  private powerValue: number = 0;    // 0 to 1
  private accuracyValue: number = 0; // 0 (bottom sweet spot) to 1 (top)

  private powerSpeed: number = 1.0;    // Fills 0 -> 1 in ~1.0 seconds
  private accuracySpeed: number = 1.25; // Falls 1 -> 0 in ~0.8 seconds

  private result: SwingResult | null = null;

  public getState(): SwingMeterState {
    return this.state;
  }

  public getPowerValue(): number {
    return this.powerValue;
  }

  public getAccuracyValue(): number {
    return this.accuracyValue;
  }

  public getResult(): SwingResult | null {
    return this.result;
  }

  public reset(): void {
    this.state = 'IDLE';
    this.powerValue = 0;
    this.accuracyValue = 0;
    this.result = null;
  }

  /**
   * Handle user action (spacebar, click, or tap).
   * 1st trigger: Start power rising.
   * 2nd trigger: Lock power & start accuracy falling.
   * 3rd trigger: Lock accuracy & complete swing.
   */
  public trigger(): SwingMeterState {
    if (this.state === 'IDLE') {
      this.state = 'POWER_RISING';
      this.powerValue = 0;
      this.accuracyValue = 1.0;
    } else if (this.state === 'POWER_RISING') {
      this.state = 'ACCURACY_FALLING';
      this.accuracyValue = 1.0; // Start falling from top
    } else if (this.state === 'ACCURACY_FALLING') {
      this.completeSwing(this.accuracyValue);
    }
    return this.state;
  }

  public update(dt: number): void {
    if (this.state === 'POWER_RISING') {
      this.powerValue += dt * this.powerSpeed;
      if (this.powerValue >= 1.0) {
        this.powerValue = 1.0;
        // Auto-rebound if player misses 2nd click at top
        this.state = 'ACCURACY_FALLING';
        this.accuracyValue = 1.0;
      }
    } else if (this.state === 'ACCURACY_FALLING') {
      this.accuracyValue -= dt * this.accuracySpeed;
      if (this.accuracyValue <= -0.5) {
        // Player missed 3rd click completely -> maximum slice
        this.completeSwing(-0.5);
      }
    }
  }

  private completeSwing(rawAcc: number): void {
    this.state = 'COMPLETE';
    
    // Power ratio 0.1..1.0
    const powerRatio = Math.max(0.1, Math.min(1.0, this.powerValue));

    // Ideal accuracy sweet spot is near 0.0 (the bottom marker)
    // rawAcc = 0 -> Perfect (0.0)
    // rawAcc > 0 -> Early click (Hook / Left)
    // rawAcc < 0 -> Late click (Slice / Right)
    const accuracyDev = Math.max(-1.0, Math.min(1.0, rawAcc));
    const isPerfect = Math.abs(accuracyDev) < 0.12;

    // Convert accuracy deviation to horizontal dispersion angle (+/- 18 degrees)
    const hookSliceAngleDegrees = accuracyDev * -18.0;

    this.result = {
      powerRatio,
      accuracyRatio: accuracyDev,
      isPerfect,
      hookSliceAngleDegrees
    };
  }
}
