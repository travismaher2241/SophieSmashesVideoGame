export type SwingMeterState =
  | 'READY'
  | 'POWER_RUNNING'
  | 'ACCURACY_RUNNING'
  | 'IMPACT'
  | 'COMPLETE';

export type StrikeQuality = 'PURE' | 'SLIGHT' | 'NOTICEABLE' | 'BIG_MISS';

export interface SwingResult {
  powerRatio: number;            // 0.1 to 1.0
  accuracyError: number;         // -1.0 (Early/Left) to +1.0 (Late/Right), 0.0 = Perfect
  strikeQuality: StrikeQuality;  // PURE, SLIGHT, NOTICEABLE, BIG_MISS
  feedbackText: string;          // e.g. 'PURE!', 'EARLY — DRAW', 'LATE — FADE'
  isPerfect: boolean;            // True if |accuracyError| < 0.05
  hookSliceAngleDegrees: number; // Horizontal launch deviation (- degrees = left, + degrees = right)
  curveSpinFactor: number;       // Side spin factor (-1.0 to 1.0)
}

export class SwingMeter {
  private state: SwingMeterState = 'READY';

  private powerValue: number = 0;      // 0.0 to 1.0
  private accuracyMarker: number = 1.0; // 1.0 (start of return) -> 0.0 (sweet spot) -> -1.0 (late limit)
  private accuracyError: number = 0;   // -1.0 (early) to +1.0 (late)
  /**
   * How much of a mistimed strike counts, 0 to 1.
   *
   * 1 is untrained: the miss is worth exactly what it was. Practice brings it
   * down, which widens every band at once — the pure window, the slight one and
   * the big miss — rather than picking one of them to be generous about.
   */
  private strikeForgiveness: number = 1;

  private powerSpeed: number = 1.1;     // Fills 0 -> 1 in ~0.9 seconds
  private accuracySpeed: number = 1.5;  // Travels 1.0 -> -1.0 in ~1.33 seconds (reaches 0 in ~0.67s)

  private inputCount: number = 0;      // 0, 1, 2, 3
  private result: SwingResult | null = null;

  public getState(): SwingMeterState {
    return this.state;
  }

  public getPowerValue(): number {
    return this.powerValue;
  }

  public getAccuracyMarker(): number {
    return this.accuracyMarker;
  }

  public getAccuracyError(): number {
    return this.accuracyError;
  }

  public getInputCount(): number {
    return this.inputCount;
  }

  public getResult(): SwingResult | null {
    return this.result;
  }

  /** Set by the game from the player's training, per club. */
  public setStrikeForgiveness(forgiveness: number): void {
    this.strikeForgiveness = Math.max(0.1, Math.min(1, forgiveness));
  }

  public reset(): void {
    this.state = 'READY';
    this.powerValue = 0;
    this.accuracyMarker = 1.0;
    this.accuracyError = 0;
    this.inputCount = 0;
    this.result = null;
  }

  /**
   * Handle user action (spacebar, click, or mobile tap).
   * Click 1: READY -> POWER_RUNNING (starts power fill). No shot occurs.
   * Click 2: POWER_RUNNING -> ACCURACY_RUNNING (locks power, reverses meter direction). No shot occurs.
   * Click 3: ACCURACY_RUNNING -> IMPACT (locks accuracy error, completes swing result).
   *
   * Each trigger invocation advances state by at most one stage.
   */
  public trigger(): SwingMeterState {
    if (this.state === 'READY') {
      this.inputCount = 1;
      this.state = 'POWER_RUNNING';
      this.powerValue = 0;
      this.accuracyMarker = 1.0;
      this.accuracyError = 0;
      this.result = null;
    } else if (this.state === 'POWER_RUNNING') {
      this.inputCount = 2;
      this.state = 'ACCURACY_RUNNING';
      // Lock power value
      this.powerValue = Math.max(0.1, Math.min(1.0, this.powerValue));
      this.accuracyMarker = 1.0; // Start return from right side
    } else if (this.state === 'ACCURACY_RUNNING') {
      this.inputCount = 3;
      this.lockAccuracyAndImpact(this.accuracyMarker);
    }
    return this.state;
  }

  /**
   * Time update loop.
   */
  public update(dt: number): void {
    if (this.state === 'POWER_RUNNING') {
      this.powerValue += dt * this.powerSpeed;
      if (this.powerValue >= 1.0) {
        this.powerValue = 1.0;
        // Hold full power until Click 2. Automatically entering accuracy here makes
        // the player's intended 100% power click count as Click 3 and causes an
        // immediate maximum-early miss.
      }
    } else if (this.state === 'ACCURACY_RUNNING') {
      this.accuracyMarker -= dt * this.accuracySpeed;
      if (this.accuracyMarker <= -1.0) {
        this.accuracyMarker = -1.0;
        // Missed accuracy click completely -> auto-lock max late miss
        this.lockAccuracyAndImpact(-1.0);
      }
    }
  }

  /**
   * Calculate accuracy error from marker position and finalize SwingResult.
   * accuracyMarker: +1.0 (start of return) -> 0.0 (perfect center) -> -1.0 (end of return).
   * accuracyError = -accuracyMarker:
   *   marker > 0 (early, clicked before sweet spot) => accuracyError < 0 (Early / Left)
   *   marker = 0 (perfect, clicked on sweet spot)   => accuracyError = 0 (Pure)
   *   marker < 0 (late, clicked after sweet spot)   => accuracyError > 0 (Late / Right)
   */
  private lockAccuracyAndImpact(markerPos: number): void {
    this.state = 'IMPACT';
    const clampedMarker = Math.max(-1.0, Math.min(1.0, markerPos));
    this.accuracyMarker = clampedMarker;
    this.accuracyError = -clampedMarker;

    // Training does not move the bands so much as make a miss count for less:
    // a trained player is judged as though the marker stopped nearer the middle
    // than it did. The launch deviation is scaled by the same amount, so a wider
    // sweet spot really is a straighter ball rather than a kinder caption.
    const judged = this.accuracyError * this.strikeForgiveness;
    const absError = Math.abs(judged);
    let strikeQuality: StrikeQuality = 'PURE';
    let feedbackText = 'PURE!';

    if (absError < 0.05) {
      strikeQuality = 'PURE';
      feedbackText = 'PURE!';
    } else if (absError < 0.15) {
      strikeQuality = 'SLIGHT';
      feedbackText = judged < 0 ? 'SLIGHT — DRAW' : 'SLIGHT — FADE';
    } else if (absError < 0.30) {
      strikeQuality = 'NOTICEABLE';
      feedbackText = judged < 0 ? 'EARLY — DRAW' : 'LATE — FADE';
    } else {
      strikeQuality = 'BIG_MISS';
      feedbackText = judged < 0 ? 'EARLY — HOOK' : 'LATE — SLICE';
    }

    const powerRatio = Math.max(0.1, Math.min(1.0, this.powerValue));
    const isPerfect = strikeQuality === 'PURE';

    // Angular horizontal launch deviation: up to +/- 18 degrees
    // Early (error < 0): negative angle (Left / Pull)
    // Late (error > 0): positive angle (Right / Push)
    const hookSliceAngleDegrees = judged * 18.0;

    // Ball curvature spin factor: -1.0 to +1.0
    const curveSpinFactor = judged;

    this.result = {
      powerRatio,
      accuracyError: judged,
      strikeQuality,
      feedbackText,
      isPerfect,
      hookSliceAngleDegrees,
      curveSpinFactor
    };
  }

  public complete(): void {
    if (this.state === 'IMPACT') {
      this.state = 'COMPLETE';
    }
  }
}
