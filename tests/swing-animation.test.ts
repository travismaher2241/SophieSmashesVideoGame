import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SophieGolfer } from '../src/golfer/SophieGolfer';

function makeGolfer() {
  const golfer = new SophieGolfer();
  golfer.updateStance(new Vector3(0, 0, 0), 0, 0);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 2, -6);
  return { golfer, camera };
}

/** Run the animation forward in 60fps steps, returning when impact fires. */
function runToImpact(golfer: SophieGolfer, camera: PerspectiveCamera, limitSeconds = 5) {
  let elapsed = 0;
  let impactAt: number | null = null;

  golfer.playSwing(() => {
    impactAt = elapsed;
  });

  const step = 1 / 60;
  while (elapsed < limitSeconds && impactAt === null) {
    elapsed += step;
    golfer.updateAnimation(step, camera);
  }

  return impactAt;
}

/** The frame index currently bound, by the pose it shows. */
const FRAME = {
  ADDRESS_1: 0,
  ADDRESS_2: 1,
  BACKSWING_TOP: 2,
  DOWNSWING_IMPACT: 3,
  FOLLOW_THROUGH: 4
} as const;

/** Which frame index the golfer is showing right now. */
function currentFrame(golfer: SophieGolfer): number {
  return golfer.getFrameIndex();
}

describe('waiting over the ball', () => {
  it('alternates between the two address poses', () => {
    const { golfer, camera } = makeGolfer();
    const seen = new Set<number>();

    for (let i = 0; i < 400; i++) {
      golfer.updateAnimation(1 / 60, camera);
      seen.add(currentFrame(golfer));
    }

    expect(seen).toEqual(new Set([FRAME.ADDRESS_1, FRAME.ADDRESS_2]));
  });

  it('never shows a mid-swing pose while waiting', () => {
    const { golfer, camera } = makeGolfer();

    for (let i = 0; i < 400; i++) {
      golfer.updateAnimation(1 / 60, camera);
      expect(currentFrame(golfer)).toBeLessThanOrEqual(FRAME.ADDRESS_2);
    }
  });
});

describe('the swing plays as one motion after the third click', () => {
  it('runs address 2, backswing top, downswing, follow through, in that order', () => {
    const { golfer, camera } = makeGolfer();
    const frames: number[] = [];

    golfer.playSwing(() => {});
    for (let i = 0; i < 200 && golfer.isSwinging(); i++) {
      const frame = currentFrame(golfer);
      if (frames[frames.length - 1] !== frame) frames.push(frame);
      golfer.updateAnimation(1 / 60, camera);
    }

    expect(frames).toEqual([
      FRAME.ADDRESS_2,
      FRAME.BACKSWING_TOP,
      FRAME.DOWNSWING_IMPACT,
      FRAME.FOLLOW_THROUGH
    ]);
  });

  it('never shows the resting address pose mid-swing', () => {
    // Address 1 is the waiting pose only; the swing starts from address 2.
    const { golfer, camera } = makeGolfer();

    golfer.playSwing(() => {});
    for (let i = 0; i < 200 && golfer.isSwinging(); i++) {
      expect(currentFrame(golfer)).not.toBe(FRAME.ADDRESS_1);
      golfer.updateAnimation(1 / 60, camera);
    }
  });

  it('does not launch the ball on the click that starts it', () => {
    // The fault: every click snapped a pose and the third fired the ball on the
    // same tick, so there was no swing to watch.
    const { golfer } = makeGolfer();
    let launched = false;

    golfer.playSwing(() => {
      launched = true;
    });

    expect(launched).toBe(false);
  });

  it('launches the ball part-way through, at impact', () => {
    const { golfer, camera } = makeGolfer();
    const impactAt = runToImpact(golfer, camera);

    expect(impactAt).not.toBeNull();
    expect(impactAt!).toBeCloseTo(SophieGolfer.TIME_TO_IMPACT_SECONDS, 1);
    // Long enough to read as a swing, short enough not to feel like a delay.
    expect(impactAt!).toBeGreaterThan(0.4);
    expect(impactAt!).toBeLessThan(1.2);
  });

  it('works through every phase in order, without skipping one', () => {
    const { golfer, camera } = makeGolfer();
    const seen: string[] = [];

    golfer.playSwing(() => seen.push('IMPACT'));

    for (let i = 0; i < 300; i++) {
      const phase = (golfer as any).currentPhase as string;
      if (seen[seen.length - 1] !== phase && phase !== 'REST') seen.push(phase);
      golfer.updateAnimation(1 / 60, camera);
      if (!golfer.isSwinging()) break;
    }

    expect(seen).toEqual(['BACKSWING', 'TOP_HOLD', 'DOWNSWING', 'IMPACT', 'FOLLOW_THROUGH']);
  });

  it('carries on through the follow-through and settles back to address', () => {
    const { golfer, camera } = makeGolfer();
    runToImpact(golfer, camera);

    expect(golfer.isSwinging()).toBe(true);

    for (let i = 0; i < 300 && golfer.isSwinging(); i++) {
      golfer.updateAnimation(1 / 60, camera);
    }

    expect(golfer.isSwinging()).toBe(false);
  });

  it('fires impact exactly once', () => {
    const { golfer, camera } = makeGolfer();
    let impacts = 0;

    golfer.playSwing(() => impacts++);
    for (let i = 0; i < 300; i++) golfer.updateAnimation(1 / 60, camera);

    expect(impacts).toBe(1);
  });

  it('still lets a putt strike immediately, having no backswing to play', () => {
    const { golfer } = makeGolfer();
    let struck = false;

    golfer.strikeImpact(() => {
      struck = true;
    });

    expect(struck).toBe(true);
  });
});
