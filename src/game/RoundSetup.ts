import { HoleConfig, HolePinPosition, HoleTeeBox, TEE_BOX_IDS, TeeBoxId } from '../course/HoleData';

export { TEE_BOX_IDS };
export type { TeeBoxId };

/**
 * Which tee a round is played from.
 *
 * The back tee is the default because it is the hole as it has always played
 * here, and as the card measures it. The other two are shorter versions of the
 * same hole rather than easier holes: the trees, the water and the green do not
 * move.
 */
export const DEFAULT_TEE: TeeBoxId = 'BACK';

export const TEE_LABELS: Record<TeeBoxId, string> = {
  BACK: 'BACK',
  MIDDLE: 'MIDDLE',
  FORWARD: 'FORWARD'
};

/**
 * The tees this hole offers.
 *
 * A hole with no tee data still has a tee, so it gets a one-entry list built
 * from it — every caller can then treat "which tee" as a real question without
 * checking whether the course data is new enough to answer.
 */
export function teeOptions(hole: HoleConfig | undefined): HoleTeeBox[] {
  if (hole?.teeBoxes?.length) return hole.teeBoxes;
  if (!hole?.tee) return [];

  return [{
    id: 'BACK',
    name: 'BACK TEE',
    x: hole.tee.x,
    z: hole.tee.z,
    lengthMetres: hole.publishedLengthMetres,
    surfaceId: `${hole.holeId}-tee`
  }];
}

/** The chosen tee, or the nearest thing the hole has to it. */
export function selectedTeeBox(hole: HoleConfig | undefined, choice: TeeBoxId): HoleTeeBox | null {
  const options = teeOptions(hole);
  if (options.length === 0) return null;

  return options.find((teeBox) => teeBox.id === choice)
    ?? options.find((teeBox) => teeBox.id === DEFAULT_TEE)
    ?? options[0];
}

/** Where the cup can be cut on this hole. */
export function pinOptions(hole: HoleConfig | undefined): HolePinPosition[] {
  if (hole?.pinPositions?.length) return hole.pinPositions;
  if (!hole?.greenCentre) return [];

  return [{ id: 'MIDDLE', name: 'MIDDLE', x: hole.greenCentre.x, z: hole.greenCentre.z }];
}

/**
 * A seed for one round's pin positions.
 *
 * The pins move from round to round but not from shot to shot: a pin that moved
 * while you were walking up to it would be a bug, not a feature, so the whole
 * round is drawn from one number decided when it starts.
 */
export function newRoundSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff) >>> 0;
}

/**
 * Today's pin on a given hole.
 *
 * Mixed from the round's seed and the hole number so the eighteen pins of a
 * round are independent of each other — seeding by the hole alone would put the
 * same pin on the 4th every single round.
 */
export function pinForHole(hole: HoleConfig | undefined, seed: number, holeNumber: number): HolePinPosition | null {
  const pins = pinOptions(hole);
  if (pins.length === 0) return null;

  return pins[mix(seed, holeNumber) % pins.length];
}

/** A cheap integer hash, enough to keep one hole's pin unrelated to the next. */
function mix(seed: number, holeNumber: number): number {
  let h = (seed ^ (holeNumber * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
