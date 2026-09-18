export interface RoundScoreSummary {
  totalStrokes: number;
  penaltyStrokes: number;
  par: number;
  relativeToPar: number;
  relativeLabel: string;
  resultName: string;
}

export function summarizeRoundScore(
  totalStrokes: number,
  penaltyStrokes: number,
  par: number
): RoundScoreSummary {
  const relativeToPar = totalStrokes - par;
  const relativeLabel = relativeToPar === 0
    ? 'E'
    : relativeToPar > 0
      ? `+${relativeToPar}`
      : String(relativeToPar);

  const resultName = relativeToPar <= -3
    ? 'ALBATROSS'
    : relativeToPar === -2
      ? 'EAGLE'
      : relativeToPar === -1
        ? 'BIRDIE'
        : relativeToPar === 0
          ? 'PAR'
          : relativeToPar === 1
            ? 'BOGEY'
            : relativeToPar === 2
              ? 'DOUBLE BOGEY'
              : `${relativeToPar} OVER PAR`;

  return {
    totalStrokes,
    penaltyStrokes,
    par,
    relativeToPar,
    relativeLabel,
    resultName
  };
}

/** What a hole contributed to the round, once it has been played. */
export interface PlayedHole {
  strokes: number;
  par: number;
}

export interface RunningRoundScore {
  holesPlayed: number;
  /** Strokes on the holes played, penalties included. */
  strokes: number;
  /** Par for the holes played, which is what the total is measured against. */
  par: number;
  relativeToPar: number;
  /** "E", "+3", "-1" — the number a golfer keeps in their head. */
  relativeLabel: string;
}

/**
 * The score so far, as a leaderboard would print it.
 *
 * Measured against the par of the holes actually played, not the whole course:
 * standing on the 5th at level par is level par, not thirteen under. Holes still
 * in progress do not count — "thru 4" means four holed out, which is what the
 * player means when they ask where they stand.
 */
export function runningRoundScore(played: readonly (PlayedHole | undefined)[]): RunningRoundScore {
  const holes = played.filter((hole): hole is PlayedHole => !!hole);
  const strokes = holes.reduce((total, hole) => total + hole.strokes, 0);
  const par = holes.reduce((total, hole) => total + hole.par, 0);

  return {
    holesPlayed: holes.length,
    strokes,
    par,
    relativeToPar: strokes - par,
    relativeLabel: summarizeRoundScore(strokes, 0, par).relativeLabel
  };
}
