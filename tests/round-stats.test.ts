import { describe, expect, it } from 'vitest';
import { HoleStat, statLines, suggestTraining, summariseRound } from '../src/game/RoundStats';

function hole(overrides: Partial<HoleStat> = {}): HoleStat {
  return {
    par: 4,
    strokes: 4,
    penalties: 0,
    putts: 2,
    teeShotLie: 'FAIRWAY',
    driveDistanceMetres: 240,
    strokesToGreen: 2,
    ...overrides
  };
}

describe('round statistics', () => {
  it('counts a fairway only where there was one to hit', () => {
    // Nobody measures fairways hit on a par 3: you are aiming at the green.
    const summary = summariseRound([
      hole({ teeShotLie: 'FAIRWAY' }),
      hole({ teeShotLie: 'ROUGH' }),
      hole({ par: 3, teeShotLie: 'GREEN', strokesToGreen: 1 })
    ]);

    expect(summary.fairwayChances).toBe(2);
    expect(summary.fairwaysHit).toBe(1);
  });

  it('counts a green in regulation as par minus two', () => {
    const summary = summariseRound([
      hole({ par: 4, strokesToGreen: 2 }),
      hole({ par: 4, strokesToGreen: 3 }),
      hole({ par: 5, strokesToGreen: 3 }),
      hole({ par: 3, strokesToGreen: 1 }),
      hole({ par: 3, strokesToGreen: 2 })
    ]);

    expect(summary.greensInRegulation).toBe(3);
    expect(summary.girChances).toBe(5);
  });

  it('does not credit a green reached with the help of a penalty', () => {
    // The ball is on the green in two, but one of the two was a drop. Counting
    // that as a green in regulation flatters exactly the round that went wrong.
    const withPenalty = summariseRound([hole({ par: 4, strokesToGreen: 3, penalties: 1 })]);
    expect(withPenalty.greensInRegulation).toBe(0);
  });

  it('averages only the drives that were drives', () => {
    const summary = summariseRound([
      hole({ driveDistanceMetres: 240 }),
      hole({ driveDistanceMetres: 200 }),
      // Laid up with an iron, so there is no drive to measure here.
      hole({ driveDistanceMetres: null }),
      hole({ par: 3, driveDistanceMetres: null })
    ]);

    expect(summary.averageDriveMetres).toBe(220);
    expect(summary.longestDriveMetres).toBe(240);
  });

  it('reports no driving at all rather than an average of nothing', () => {
    const summary = summariseRound([hole({ par: 3, driveDistanceMetres: null })]);
    expect(summary.averageDriveMetres).toBeNull();
    expect(summary.longestDriveMetres).toBeNull();
    expect(statLines(summary).some((line) => line.label === 'DRIVING')).toBe(false);
  });

  it('counts putts per hole across the round', () => {
    const summary = summariseRound([hole({ putts: 2 }), hole({ putts: 3 }), hole({ putts: 1 })]);
    expect(summary.putts).toBe(6);
    expect(summary.puttsPerHole).toBe(2);
  });

  it('counts a scramble as par saved from off the green', () => {
    const summary = summariseRound([
      // Missed the green, still made par.
      hole({ par: 4, strokesToGreen: 3, strokes: 4 }),
      // Missed the green and dropped a shot.
      hole({ par: 4, strokesToGreen: 3, strokes: 5 }),
      // Hit the green, so there was nothing to scramble for.
      hole({ par: 4, strokesToGreen: 2, strokes: 4 })
    ]);

    expect(summary.scrambleChances).toBe(2);
    expect(summary.scrambles).toBe(1);
  });

  it('says nothing at all about a round that was not played', () => {
    const summary = summariseRound([]);
    expect(summary.holesPlayed).toBe(0);
    expect(statLines(summary)).toEqual([]);
    expect(suggestTraining(summary)).toBeNull();
  });
});

describe('the bars', () => {
  it('rates a number against what a good round looks like', () => {
    const good = statLines(summariseRound([hole({ teeShotLie: 'FAIRWAY' }), hole({ teeShotLie: 'FAIRWAY' })]));
    const bad = statLines(summariseRound([hole({ teeShotLie: 'ROUGH' }), hole({ teeShotLie: 'ROUGH' })]));

    expect(good.find((line) => line.label === 'FAIRWAYS')!.rating).toBe(1);
    expect(bad.find((line) => line.label === 'FAIRWAYS')!.rating).toBe(0);
  });

  it('rates fewer putts as better, not worse', () => {
    // The one statistic on the board where a bigger number is a worse round.
    const few = statLines(summariseRound([hole({ putts: 1 })]));
    const many = statLines(summariseRound([hole({ putts: 4 })]));

    expect(few.find((line) => line.label === 'PUTTS')!.rating)
      .toBeGreaterThan(many.find((line) => line.label === 'PUTTS')!.rating);
  });

  it('keeps every rating inside the bar', () => {
    const extreme = statLines(summariseRound([
      hole({ putts: 0, driveDistanceMetres: 900, teeShotLie: 'FAIRWAY', penalties: 4, strokes: 12 })
    ]));

    for (const line of extreme) {
      expect(line.rating, line.label).toBeGreaterThanOrEqual(0);
      expect(line.rating, line.label).toBeLessThanOrEqual(1);
    }
  });
});

describe('what the round says to train', () => {
  it('names the putter after a round of three-putts', () => {
    const summary = summariseRound(
      Array.from({ length: 18 }, () => hole({ putts: 3, teeShotLie: 'FAIRWAY', strokesToGreen: 2 }))
    );

    expect(suggestTraining(summary)).toMatchObject({ discipline: 'PUTTING', attribute: 'ACCURACY' });
  });

  it('names driving accuracy after a round spent in the trees', () => {
    const summary = summariseRound(
      Array.from({ length: 18 }, () => hole({ teeShotLie: 'ROUGH', putts: 1, strokesToGreen: 2 }))
    );

    expect(suggestTraining(summary)).toMatchObject({ discipline: 'DRIVING', attribute: 'ACCURACY' });
  });

  it('names the irons after a round of missed greens', () => {
    const summary = summariseRound(
      Array.from({ length: 18 }, () =>
        // Off the tee fine, on the green late, and holed out from the fringe so
        // scrambling is not the thing that stands out.
        hole({ teeShotLie: 'FAIRWAY', strokesToGreen: 4, strokes: 4, putts: 1 })
      )
    );

    const advice = suggestTraining(summary)!;
    expect(advice.discipline).toBe('IRONS');
  });

  it('tells a player who did everything right to get longer', () => {
    const summary = summariseRound(
      Array.from({ length: 18 }, () =>
        hole({ teeShotLie: 'FAIRWAY', strokesToGreen: 2, putts: 1, strokes: 3, driveDistanceMetres: 300 })
      )
    );

    expect(suggestTraining(summary)).toMatchObject({ discipline: 'DRIVING', attribute: 'POWER' });
  });

  it('gives a reason in the player\'s own numbers', () => {
    const summary = summariseRound(
      Array.from({ length: 18 }, () => hole({ putts: 3, teeShotLie: 'FAIRWAY', strokesToGreen: 2 }))
    );

    expect(suggestTraining(summary)!.reason).toContain('3.00');
  });
});
