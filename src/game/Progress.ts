import { TeeBoxId, TEE_BOX_IDS, DEFAULT_TEE } from './RoundSetup';
import { Abilities, untrained } from './Abilities';

/**
 * What the player keeps between rounds.
 *
 * A career rather than a session: training you earned on Tuesday is still there
 * on Wednesday, which is the whole point of earning it.
 */
export interface Progress {
  abilities: Abilities;
  /** Sessions earned and not yet spent. */
  sessionsAvailable: number;
  roundsPlayed: number;
  /** Best round against par, or null before a round has been finished. */
  bestRelativeToPar: number | null;
  /** Which tee the player last chose to play from. */
  teeChoice: TeeBoxId;
}

const STORAGE_KEY = 'sophie-smashes-progress-v1';

export function newProgress(): Progress {
  return {
    abilities: untrained(),
    sessionsAvailable: 0,
    roundsPlayed: 0,
    bestRelativeToPar: null,
    teeChoice: DEFAULT_TEE
  };
}

/**
 * Read what was saved, repairing anything that does not look right.
 *
 * A save can be from an older build, hand-edited, or half-written by a browser
 * that was closed mid-save. None of those should stop the game starting, so
 * anything unrecognised falls back to a fresh career rather than throwing.
 */
export function loadProgress(storage: Storage | undefined = safeStorage()): Progress {
  if (!storage) return newProgress();

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return newProgress();

    const parsed = JSON.parse(raw) as Partial<Progress>;
    const fresh = newProgress();

    return {
      // Only keys the build knows about, and only sane levels: a save from a
      // version with different tracks must not smuggle them in.
      abilities: Object.keys(fresh.abilities).reduce((merged, key) => {
        const saved = (parsed.abilities as Record<string, unknown> | undefined)?.[key];
        const level = typeof saved === 'number' && Number.isFinite(saved) ? Math.floor(saved) : 0;
        merged[key as keyof Abilities] = Math.max(0, Math.min(5, level));
        return merged;
      }, fresh.abilities),
      sessionsAvailable: clampCount(parsed.sessionsAvailable),
      roundsPlayed: clampCount(parsed.roundsPlayed),
      bestRelativeToPar: typeof parsed.bestRelativeToPar === 'number' && Number.isFinite(parsed.bestRelativeToPar)
        ? parsed.bestRelativeToPar
        : null,
      teeChoice: TEE_BOX_IDS.includes(parsed.teeChoice as TeeBoxId) ? (parsed.teeChoice as TeeBoxId) : DEFAULT_TEE
    };
  } catch {
    return newProgress();
  }
}

export function saveProgress(progress: Progress, storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // A full or blocked store is not worth losing the round over.
  }
}

/** Fold a finished round into the career. */
export function recordRound(
  progress: Progress,
  strokes: number,
  par: number,
  sessions: number
): Progress {
  const relativeToPar = strokes - par;

  return {
    ...progress,
    sessionsAvailable: progress.sessionsAvailable + sessions,
    roundsPlayed: progress.roundsPlayed + 1,
    bestRelativeToPar: progress.bestRelativeToPar === null
      ? relativeToPar
      : Math.min(progress.bestRelativeToPar, relativeToPar)
  };
}

function clampCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    // Private windows and blocked site data throw on access, not on use.
    return undefined;
  }
}
