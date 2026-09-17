import { SurfaceType } from '../course/SurfaceQuery';
import { Attribute, Discipline } from './Abilities';

/**
 * What one hole is worth to the statistics.
 *
 * Gathered as the hole is played and folded in when it is finished, rather than
 * reconstructed from the score afterwards: a 5 on a par 4 says nothing about
 * whether it was two poor tee shots or three putts, and which of those it was
 * is the whole question the player is asking.
 */
export interface HoleStat {
  par: number;
  /** Strokes played, including penalties. */
  strokes: number;
  penalties: number;
  putts: number;
  /** Where the tee shot finished. Null when the hole was never teed off. */
  teeShotLie: SurfaceType | null;
  /** Ground covered by the tee shot when it was played with a wood, in metres. */
  driveDistanceMetres: number | null;
  /**
   * Strokes taken to get the ball onto the green, holing out included.
   *
   * Null if the ball never got there, which happens when a hole is abandoned
   * rather than finished.
   */
  strokesToGreen: number | null;
}

export interface RoundStatsSummary {
  holesPlayed: number;
  /**
   * Fairways hit, out of the holes where there was a fairway to hit.
   *
   * Par 3s do not count: nobody measures a fairway on a hole where you are
   * aiming at the green from the tee.
   */
  fairwaysHit: number;
  fairwayChances: number;
  /** Greens reached in par minus two, the standard measure. */
  greensInRegulation: number;
  girChances: number;
  putts: number;
  puttsPerHole: number;
  penalties: number;
  /** Average of the tee shots played with a wood, in metres. Null if none were. */
  averageDriveMetres: number | null;
  longestDriveMetres: number | null;
  /**
   * Holes saved after missing the green: par or better without a green in
   * regulation. The number that says whether a bad approach costs a shot.
   */
  scrambles: number;
  scrambleChances: number;
}

export function newRoundStats(): HoleStat[] {
  return [];
}

export function summariseRound(holes: readonly HoleStat[]): RoundStatsSummary {
  const fairwayChances = holes.filter((hole) => hole.par >= 4).length;
  const fairwaysHit = holes.filter((hole) => hole.par >= 4 && hole.teeShotLie === 'FAIRWAY').length;

  const greensInRegulation = holes.filter(inRegulation).length;
  const scrambleChances = holes.filter((hole) => !inRegulation(hole)).length;
  const scrambles = holes.filter((hole) => !inRegulation(hole) && hole.strokes <= hole.par).length;

  const drives = holes
    .map((hole) => hole.driveDistanceMetres)
    .filter((distance): distance is number => distance !== null);

  const putts = holes.reduce((total, hole) => total + hole.putts, 0);

  return {
    holesPlayed: holes.length,
    fairwaysHit,
    fairwayChances,
    greensInRegulation,
    girChances: holes.length,
    putts,
    puttsPerHole: holes.length === 0 ? 0 : putts / holes.length,
    penalties: holes.reduce((total, hole) => total + hole.penalties, 0),
    averageDriveMetres: drives.length === 0 ? null : drives.reduce((a, b) => a + b, 0) / drives.length,
    longestDriveMetres: drives.length === 0 ? null : Math.max(...drives),
    scrambles,
    scrambleChances
  };
}

/** A green hit in regulation: on the putting surface with two left for par. */
function inRegulation(hole: HoleStat): boolean {
  return hole.strokesToGreen !== null && hole.strokesToGreen <= hole.par - 2;
}

/** One line of the post-round table. */
export interface StatLine {
  label: string;
  value: string;
  /** The same number as a fraction of its benchmark, 0 to 1, for a bar. */
  rating: number;
  detail: string;
}

/**
 * Benchmarks the round is measured against.
 *
 * Deliberately a competent club player rather than a tour professional: the
 * point of the bars is to show which part of the game is behind the others, and
 * a scale nobody can reach makes every bar short and tells you nothing.
 */
const GOOD_FAIRWAY_RATE = 0.62;
const GOOD_GIR_RATE = 0.5;
/** Putts per hole a good round comes in under. */
const GOOD_PUTTS_PER_HOLE = 1.8;
/** A drive worth having, in metres. */
const GOOD_DRIVE_METRES = 235;

export function statLines(summary: RoundStatsSummary): StatLine[] {
  const lines: StatLine[] = [];

  if (summary.fairwayChances > 0) {
    const rate = summary.fairwaysHit / summary.fairwayChances;
    lines.push({
      label: 'FAIRWAYS',
      value: `${summary.fairwaysHit}/${summary.fairwayChances}`,
      rating: clamp01(rate / GOOD_FAIRWAY_RATE),
      detail: `${Math.round(rate * 100)}%`
    });
  }

  if (summary.girChances > 0) {
    const rate = summary.greensInRegulation / summary.girChances;
    lines.push({
      label: 'GREENS',
      value: `${summary.greensInRegulation}/${summary.girChances}`,
      rating: clamp01(rate / GOOD_GIR_RATE),
      detail: `${Math.round(rate * 100)}%`
    });
  }

  if (summary.holesPlayed > 0) {
    lines.push({
      label: 'PUTTS',
      value: String(summary.putts),
      // Fewer is better, so the rating is the benchmark over the number rather
      // than the other way round.
      rating: clamp01(GOOD_PUTTS_PER_HOLE / Math.max(0.1, summary.puttsPerHole)),
      detail: `${summary.puttsPerHole.toFixed(2)} per hole`
    });
  }

  if (summary.averageDriveMetres !== null) {
    lines.push({
      label: 'DRIVING',
      value: `${Math.round(summary.averageDriveMetres)}m`,
      rating: clamp01(summary.averageDriveMetres / GOOD_DRIVE_METRES),
      detail: `longest ${Math.round(summary.longestDriveMetres ?? 0)}m`
    });
  }

  if (summary.scrambleChances > 0) {
    const rate = summary.scrambles / summary.scrambleChances;
    lines.push({
      label: 'SCRAMBLING',
      value: `${summary.scrambles}/${summary.scrambleChances}`,
      rating: clamp01(rate / 0.4),
      detail: 'pars without a green'
    });
  }

  if (summary.penalties > 0) {
    // One penalty in eighteen holes measured against the holes played reads as
    // 94% and draws a full green bar, which is the opposite of what a dropped
    // shot means. A round is allowed about one penalty in four holes before the
    // bar is empty.
    lines.push({
      label: 'PENALTIES',
      value: String(summary.penalties),
      rating: clamp01(1 - summary.penalties / Math.max(1, summary.holesPlayed * 0.25)),
      detail: 'strokes given away'
    });
  }

  return lines;
}

export interface TrainingAdvice {
  discipline: Discipline;
  attribute: Attribute;
  /** Why this one, in the player's terms. */
  reason: string;
}

/**
 * What the round says to train.
 *
 * The stats and the training board were built for each other: fairways hit is
 * driving accuracy, greens in regulation is iron play, putts per hole is
 * putting, driving distance is driving power. Whichever is furthest below its
 * benchmark is the one costing the most shots, so that is the one named — and
 * a round with nothing wrong with it gets told to get longer, because distance
 * is the thing you can always use more of.
 */
export function suggestTraining(summary: RoundStatsSummary): TrainingAdvice | null {
  if (summary.holesPlayed === 0) return null;

  const candidates: Array<TrainingAdvice & { shortfall: number }> = [];

  if (summary.fairwayChances > 0) {
    const rate = summary.fairwaysHit / summary.fairwayChances;
    candidates.push({
      discipline: 'DRIVING',
      attribute: 'ACCURACY',
      reason: `you found ${summary.fairwaysHit} of ${summary.fairwayChances} fairways`,
      shortfall: 1 - clamp01(rate / GOOD_FAIRWAY_RATE)
    });
  }

  if (summary.girChances > 0) {
    const rate = summary.greensInRegulation / summary.girChances;
    candidates.push({
      discipline: 'IRONS',
      attribute: 'ACCURACY',
      reason: `you hit ${summary.greensInRegulation} of ${summary.girChances} greens in regulation`,
      shortfall: 1 - clamp01(rate / GOOD_GIR_RATE)
    });
  }

  candidates.push({
    discipline: 'PUTTING',
    attribute: 'ACCURACY',
    reason: `you took ${summary.puttsPerHole.toFixed(2)} putts a hole`,
    shortfall: 1 - clamp01(GOOD_PUTTS_PER_HOLE / Math.max(0.1, summary.puttsPerHole))
  });

  if (summary.averageDriveMetres !== null) {
    candidates.push({
      discipline: 'DRIVING',
      attribute: 'POWER',
      reason: `your drives averaged ${Math.round(summary.averageDriveMetres)}m`,
      shortfall: 1 - clamp01(summary.averageDriveMetres / GOOD_DRIVE_METRES)
    });
  }

  if (summary.scrambleChances > 2) {
    const rate = summary.scrambles / summary.scrambleChances;
    candidates.push({
      discipline: 'WEDGES',
      attribute: 'ACCURACY',
      reason: `you saved par ${summary.scrambles} times from ${summary.scrambleChances} missed greens`,
      shortfall: 1 - clamp01(rate / 0.4)
    });
  }

  const worst = candidates.reduce((pick, entry) => (entry.shortfall > pick.shortfall ? entry : pick));

  // Nothing was actually below par for the round, so there is no weakness to
  // name. Length is the honest answer: everyone can use more of it.
  if (worst.shortfall <= 0) {
    return { discipline: 'DRIVING', attribute: 'POWER', reason: 'nothing let you down — go and get longer' };
  }

  return { discipline: worst.discipline, attribute: worst.attribute, reason: worst.reason };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
