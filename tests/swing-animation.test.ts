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

describe('the swing plays as one motion after the third click', () => {
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
