import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildScorecard, HoleScore } from '../src/game/Scorecard';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';

const PARS = [4, 3, 4, 4, 3, 4, 4, 4, 5];

/** A round where the given strokes have been taken, hole by hole. */
function played(...strokes: (number | null)[]): (HoleScore | undefined)[] {
  return strokes.map((count, index) =>
    count === null ? undefined : { strokes: count, penaltyStrokes: 0, par: PARS[index] }
  );
}

describe('the card after a hole', () => {
  it('shows every hole, including the ones still to come', () => {
    const card = buildScorecard(PARS, played(4, 3), 1);

    expect(card.holes).toHaveLength(9);
    expect(card.holes[2].strokes).toBeNull();
    expect(card.holes[2].result).toBe('UNPLAYED');
    // Par for an unplayed hole still shows: that is half of why you look.
    expect(card.holes[2].par).toBe(4);
  });

  it('measures the running score against the holes played, not the whole course', () => {
    // Level par after two holes is level par, not thirteen under. Measuring
    // against the course total would make every card read like a blowout until
    // the ninth green.
    const card = buildScorecard(PARS, played(4, 3), 1);

    expect(card.strokesPlayed).toBe(7);
    expect(card.parPlayed).toBe(7);
    expect(card.relativeLabel).toBe('E');
    // The par column still totals the course, which is what a card prints.
    expect(card.parTotal).toBe(35);
  });

  it('adds up a part-played round the way a card does', () => {
    const card = buildScorecard(PARS, played(5, 3, 4, 6, 6), 4);

    expect(card.holesPlayed).toBe(5);
    expect(card.strokesPlayed).toBe(24);
    expect(card.parPlayed).toBe(18);
    expect(card.relativeLabel).toBe('+6');
    expect(card.isComplete).toBe(false);
  });

  it('names each hole by how it was scored', () => {
    const card = buildScorecard(PARS, played(2, 2, 4, 5, 7), 4);

    expect(card.holes.map((hole) => hole.result).slice(0, 5)).toEqual([
      'EAGLE_OR_BETTER', // 2 on a par 4
      'BIRDIE',          // 2 on a par 3
      'PAR',
      'BOGEY',
      'WORSE'            // 7 on a par 3
    ]);
  });

  it('marks the hole just finished, which is the one being looked for', () => {
    const card = buildScorecard(PARS, played(4, 3, 4), 2);

    expect(card.holes.filter((hole) => hole.isCurrent).map((hole) => hole.number)).toEqual([3]);
  });

  it('knows when the round is over', () => {
    const card = buildScorecard(PARS, played(4, 3, 4, 4, 3, 4, 4, 4, 5), 8);

    expect(card.isComplete).toBe(true);
    expect(card.relativeLabel).toBe('E');
    expect(card.strokesPlayed).toBe(35);
  });

  it('holds up before a single hole is finished', () => {
    const card = buildScorecard(PARS, [], 0);

    expect(card.holesPlayed).toBe(0);
    expect(card.strokesPlayed).toBe(0);
    expect(card.relativeLabel).toBe('E');
    expect(card.holes.every((hole) => hole.result === 'UNPLAYED')).toBe(true);
  });

  it('prefers the par the hole was actually played off', () => {
    // If a hole's own file ever disagrees with the playlist, the card should
    // show what the score was measured against rather than the other copy.
    const card = buildScorecard(PARS, [{ strokes: 5, penaltyStrokes: 0, par: 5 }], 0);

    expect(card.holes[0].par).toBe(5);
    expect(card.holes[0].result).toBe('PAR');
  });
});

describe('the pars the card is drawn from', () => {
  it('matches what each hole file says', () => {
    // The playlist carries a copy so the card can be drawn before the holes are
    // loaded. Two copies of a number drift; this is what stops them.
    for (const hole of SOPHIE_HILLS_CONFIG.holes) {
      const file = JSON.parse(
        readFileSync(fileURLToPath(new URL(`../public${hole.holePath}/hole.json`, import.meta.url)), 'utf8')
      );

      expect(hole.par, hole.holeName).toBe(file.par);
    }
  });

  it('adds up to the course par the title screen promises', () => {
    const summed = SOPHIE_HILLS_CONFIG.holes.reduce((total, hole) => total + hole.par, 0);

    expect(summed).toBe(SOPHIE_HILLS_CONFIG.totalPar);
  });
});
