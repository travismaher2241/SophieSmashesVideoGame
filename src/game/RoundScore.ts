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
