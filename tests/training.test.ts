import { describe, expect, it } from 'vitest';
import {
  abilityKey,
  ATTRIBUTES,
  canTrain,
  carryMultiplier,
  DISCIPLINES,
  disciplineForClub,
  levelOf,
  MAX_LEVEL,
  puttLineErrorDegrees,
  puttPaceError,
  sessionsEarned,
  strikeForgiveness,
  trained,
  untrained
} from '../src/game/Abilities';
import { loadProgress, newProgress, recordRound, saveProgress } from '../src/game/Progress';
import { GOLF_CLUBS } from '../src/golf/Club';
import { SwingMeter } from '../src/golf/SwingMeter';

/** A stand-in for localStorage that a test can look inside. */
function fakeStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => { entries.delete(key); },
    setItem: (key: string, value: string) => { entries.set(key, value); }
  } as Storage;
}

const club = (id: string) => GOLF_CLUBS.find((entry) => entry.id === id)!;

describe('what a session buys', () => {
  it('starts everyone at nothing', () => {
    const abilities = untrained();

    for (const discipline of DISCIPLINES) {
      for (const attribute of ATTRIBUTES) {
        expect(levelOf(abilities, discipline, attribute), abilityKey(discipline, attribute)).toBe(0);
      }
    }
  });

  it('adds a level without touching what it was handed', () => {
    const before = untrained();
    const after = trained(before, 'DRIVING', 'POWER');

    expect(levelOf(after, 'DRIVING', 'POWER')).toBe(1);
    expect(levelOf(before, 'DRIVING', 'POWER')).toBe(0);
  });

  it('stops at the top of a track', () => {
    let abilities = untrained();
    for (let session = 0; session < MAX_LEVEL + 3; session++) {
      abilities = trained(abilities, 'PUTTING', 'ACCURACY');
    }

    expect(levelOf(abilities, 'PUTTING', 'ACCURACY')).toBe(MAX_LEVEL);
    expect(canTrain(abilities, 'PUTTING', 'ACCURACY')).toBe(false);
  });

  it('sorts the bag into the four disciplines', () => {
    expect(disciplineForClub(club('driver'))).toBe('DRIVING');
    expect(disciplineForClub(club('3wood'))).toBe('DRIVING');
    expect(disciplineForClub(club('4iron'))).toBe('IRONS');
    expect(disciplineForClub(club('9iron'))).toBe('IRONS');
    expect(disciplineForClub(club('pw'))).toBe('WEDGES');
    expect(disciplineForClub(club('lw'))).toBe('WEDGES');
    expect(disciplineForClub(club('putter'))).toBe('PUTTING');
  });
});

describe('training that shows up in the ball', () => {
  it('lengthens the clubs it was spent on, and only those', () => {
    let abilities = untrained();
    abilities = trained(abilities, 'DRIVING', 'POWER');
    abilities = trained(abilities, 'DRIVING', 'POWER');

    expect(carryMultiplier(abilities, club('driver'))).toBeCloseTo(1.05, 5);
    expect(carryMultiplier(abilities, club('3wood'))).toBeCloseTo(1.05, 5);
    // Practice on the range with a driver does not lengthen a wedge.
    expect(carryMultiplier(abilities, club('7iron'))).toBe(1);
    expect(carryMultiplier(abilities, club('pw'))).toBe(1);
  });

  it('is worth a useful amount over a full career, not a transformation', () => {
    let abilities = untrained();
    for (let session = 0; session < MAX_LEVEL; session++) {
      abilities = trained(abilities, 'DRIVING', 'POWER');
    }
    const carry = club('driver').carryMetres * carryMultiplier(abilities, club('driver'));

    // Around 30m on a 230m driver: enough to feel, not enough to make the course
    // you learned on unrecognisable.
    expect(carry - club('driver').carryMetres).toBeGreaterThan(20);
    expect(carry - club('driver').carryMetres).toBeLessThan(35);
  });

  it('makes a mistimed strike count for less', () => {
    let abilities = untrained();
    expect(strikeForgiveness(abilities, club('driver'))).toBe(1);

    for (let session = 0; session < MAX_LEVEL; session++) {
      abilities = trained(abilities, 'DRIVING', 'ACCURACY');
    }
    const trainedForgiveness = strikeForgiveness(abilities, club('driver'));

    expect(trainedForgiveness).toBeLessThan(1);
    expect(trainedForgiveness).toBeGreaterThan(0.5);
    // Again, only the bag it was spent on.
    expect(strikeForgiveness(abilities, club('7iron'))).toBe(1);
  });

  it('takes the wobble out of a putting stroke', () => {
    let abilities = untrained();
    const rawPace = puttPaceError(abilities);
    const rawLine = puttLineErrorDegrees(abilities);

    expect(rawPace).toBeGreaterThan(0);
    expect(rawLine).toBeGreaterThan(0);

    for (let session = 0; session < MAX_LEVEL; session++) {
      abilities = trained(abilities, 'PUTTING', 'POWER');
      abilities = trained(abilities, 'PUTTING', 'ACCURACY');
    }

    // All but gone, which is where putting used to start.
    expect(puttPaceError(abilities)).toBeCloseTo(0, 6);
    expect(puttLineErrorDegrees(abilities)).toBeCloseTo(0, 6);
  });

  it('improves steadily rather than all at the end', () => {
    let abilities = untrained();
    let previous = puttPaceError(abilities);

    for (let session = 0; session < MAX_LEVEL; session++) {
      abilities = trained(abilities, 'PUTTING', 'POWER');
      const now = puttPaceError(abilities);
      expect(now).toBeLessThan(previous);
      previous = now;
    }
  });
});

describe('a wider sweet spot on the meter', () => {
  /** Run a meter through a fixed sequence and take the strike it produces. */
  function strike(forgiveness: number) {
    const meter = new SwingMeter();
    meter.setStrikeForgiveness(forgiveness);
    meter.reset();
    meter.trigger();                                   // power running
    for (let step = 0; step < 18; step++) meter.update(1 / 60);
    meter.trigger();                                   // power locked, accuracy running
    for (let step = 0; step < 11; step++) meter.update(1 / 60);
    meter.trigger();                                   // struck
    return meter.getResult()!;
  }

  it('turns the same mistimed stop into a better strike', () => {
    const raw = strike(1);
    const practised = strike(0.6);

    // The same swing, judged less harshly — and it is a real difference to the
    // ball, not a kinder caption: the launch deviation comes down with it.
    expect(Math.abs(raw.accuracyError)).toBeGreaterThan(0);
    expect(Math.abs(practised.accuracyError)).toBeLessThan(Math.abs(raw.accuracyError));
    expect(Math.abs(practised.hookSliceAngleDegrees))
      .toBeLessThan(Math.abs(raw.hookSliceAngleDegrees));
  });

  it('leaves the power alone: a session on accuracy is not a session on distance', () => {
    expect(strike(0.6).powerRatio).toBeCloseTo(strike(1).powerRatio, 6);
  });
});

describe('what a round is worth', () => {
  it('pays three for par or better, two for a decent round, one for anything', () => {
    expect(sessionsEarned(71, 71)).toBe(3);
    expect(sessionsEarned(68, 71)).toBe(3);
    expect(sessionsEarned(79, 71)).toBe(2);
    expect(sessionsEarned(80, 71)).toBe(1);
    expect(sessionsEarned(110, 71)).toBe(1);
  });

  it('always pays something for finishing', () => {
    // The round that taught you nothing is the one you most want to train after.
    for (let strokes = 71; strokes < 140; strokes += 7) {
      expect(sessionsEarned(strokes, 71)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the career between rounds', () => {
  it('keeps what was trained', () => {
    const storage = fakeStorage();
    const saved = { ...newProgress(), sessionsAvailable: 2 };
    saved.abilities = trained(saved.abilities, 'WEDGES', 'ACCURACY');
    saveProgress(saved, storage);

    const loaded = loadProgress(storage);

    expect(levelOf(loaded.abilities, 'WEDGES', 'ACCURACY')).toBe(1);
    expect(loaded.sessionsAvailable).toBe(2);
  });

  it('starts fresh when there is nothing saved', () => {
    expect(loadProgress(fakeStorage())).toEqual(newProgress());
  });

  it('survives a save it cannot make sense of', () => {
    // Half-written by a browser that was closed, hand-edited, or from a build
    // with different tracks. None of that should stop the game starting.
    for (const junk of ['not json at all', '{"abilities":"nonsense"}', '[]', '{"sessionsAvailable":-4}']) {
      const storage = fakeStorage();
      storage.setItem('sophie-smashes-progress-v1', junk);

      const loaded = loadProgress(storage);
      expect(loaded.sessionsAvailable, junk).toBeGreaterThanOrEqual(0);
      expect(levelOf(loaded.abilities, 'DRIVING', 'POWER'), junk).toBe(0);
    }
  });

  it('refuses a level a save has no business claiming', () => {
    const storage = fakeStorage();
    storage.setItem('sophie-smashes-progress-v1', JSON.stringify({
      abilities: { DRIVING_POWER: 99, IRONS_POWER: -3, NONSENSE_TRACK: 4 },
      sessionsAvailable: 1
    }));

    const loaded = loadProgress(storage);

    expect(levelOf(loaded.abilities, 'DRIVING', 'POWER')).toBe(MAX_LEVEL);
    expect(levelOf(loaded.abilities, 'IRONS', 'POWER')).toBe(0);
    expect('NONSENSE_TRACK' in loaded.abilities).toBe(false);
  });

  it('works at all when there is nowhere to save', () => {
    // Private windows and blocked site data: the round still has to be playable.
    expect(() => saveProgress(newProgress(), undefined)).not.toThrow();
    expect(loadProgress(undefined)).toEqual(newProgress());
  });

  it('banks a finished round and remembers the best one', () => {
    let progress = newProgress();
    progress = recordRound(progress, 79, 71, 2);
    expect(progress.roundsPlayed).toBe(1);
    expect(progress.sessionsAvailable).toBe(2);
    expect(progress.bestRelativeToPar).toBe(8);

    progress = recordRound(progress, 73, 71, 2);
    expect(progress.bestRelativeToPar).toBe(2);

    // A worse round does not overwrite the best.
    progress = recordRound(progress, 95, 71, 1);
    expect(progress.bestRelativeToPar).toBe(2);
    expect(progress.roundsPlayed).toBe(3);
  });
});
