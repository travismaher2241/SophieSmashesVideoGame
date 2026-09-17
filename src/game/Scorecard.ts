import { summarizeRoundScore } from './RoundScore';

/** What the round knows about a hole once it has been played. */
export interface HoleScore {
  strokes: number;
  penaltyStrokes: number;
  par: number;
}

export interface ScorecardHole {
  number: number;
  par: number;
  /** Null until the hole has been played. */
  strokes: number | null;
  /** Strokes against par, or null while unplayed. */
  relativeToPar: number | null;
  /** How the hole was scored, for the eye: birdies read differently to doubles. */
  result: 'EAGLE_OR_BETTER' | 'BIRDIE' | 'PAR' | 'BOGEY' | 'WORSE' | 'UNPLAYED';
  /** The hole just finished, which is what the player is looking for. */
  isCurrent: boolean;
}

/** One row of the printed card: the front nine, the back nine, or all of it. */
export interface ScorecardRow {
  /** OUT, IN, or the whole card when there is only one row. */
  label: string;
  holes: ScorecardHole[];
  par: number;
  /** Strokes on the holes of this row that have been played. */
  strokes: number;
  holesPlayed: number;
}

export interface Scorecard {
  holes: ScorecardHole[];
  /**
   * The card as it is printed: nine across, twice, with a subtotal each.
   *
   * Eighteen columns will not fit a phone, and a real card does not print them
   * that way either.
   */
  rows: ScorecardRow[];
  holesPlayed: number;
  /** Par for the holes played so far — what the running total is measured against. */
  parPlayed: number;
  strokesPlayed: number;
  /** Par for the whole course, played or not. */
  parTotal: number;
  /** Running score against par, as "E", "+3", "-1". */
  relativeLabel: string;
  relativeToPar: number;
  isComplete: boolean;
}

/**
 * Break the card into the rows it prints as.
 *
 * Nine to a row, the way a card is laid out, with the subtotal each row earns:
 * OUT and IN over eighteen holes, one unlabelled row over nine. A course of some
 * other length falls back to rows of nine with the last one short, rather than
 * refusing to draw.
 */
function splitIntoNines(holes: ScorecardHole[]): ScorecardRow[] {
  const rows: ScorecardRow[] = [];

  for (let start = 0; start < holes.length; start += 9) {
    const group = holes.slice(start, start + 9);
    const playedHere = group.filter((hole) => hole.strokes !== null);

    rows.push({
      label: holes.length <= 9 ? 'HOLE' : start === 0 ? 'OUT' : 'IN',
      holes: group,
      par: group.reduce((sum, hole) => sum + hole.par, 0),
      strokes: playedHere.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0),
      holesPlayed: playedHere.length
    });
  }

  return rows;
}

function resultFor(relativeToPar: number): ScorecardHole['result'] {
  if (relativeToPar <= -2) return 'EAGLE_OR_BETTER';
  if (relativeToPar === -1) return 'BIRDIE';
  if (relativeToPar === 0) return 'PAR';
  if (relativeToPar === 1) return 'BOGEY';
  return 'WORSE';
}

/**
 * The card as it stands.
 *
 * Par comes from the course rather than from the holes played, so the card can
 * show what is still to come as well as what is done — a scorecard you can only
 * read backwards is half a scorecard. The running total is measured against the
 * par of the holes actually played, though, or standing on the 5th tee at level
 * par would read as thirteen under.
 */
export function buildScorecard(
  pars: readonly number[],
  completed: readonly (HoleScore | undefined)[],
  currentHoleIndex: number
): Scorecard {
  const holes: ScorecardHole[] = pars.map((par, index) => {
    const score = completed[index];
    const relativeToPar = score ? score.strokes - score.par : null;

    return {
      number: index + 1,
      par: score?.par ?? par,
      strokes: score?.strokes ?? null,
      relativeToPar,
      result: relativeToPar === null ? 'UNPLAYED' : resultFor(relativeToPar),
      isCurrent: index === currentHoleIndex
    };
  });

  const played = holes.filter((hole) => hole.strokes !== null);
  const strokesPlayed = played.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0);
  const parPlayed = played.reduce((sum, hole) => sum + hole.par, 0);
  const summary = summarizeRoundScore(strokesPlayed, 0, parPlayed);

  return {
    holes,
    rows: splitIntoNines(holes),
    holesPlayed: played.length,
    parPlayed,
    strokesPlayed,
    parTotal: holes.reduce((sum, hole) => sum + hole.par, 0),
    relativeLabel: summary.relativeLabel,
    relativeToPar: summary.relativeToPar,
    isComplete: played.length === holes.length
  };
}
