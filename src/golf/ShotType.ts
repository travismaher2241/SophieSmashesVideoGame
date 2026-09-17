import { ClubConfig } from './Club';

/**
 * How hard, and how high, the ball is being sent.
 *
 * Every shot that was not a putt used to be a full swing, which meant a ball
 * fifteen metres off the green was played with the same motion as a drive and
 * the only lever was to take less of the meter. That is not how anyone plays
 * around a green: you pick a shot, and the shot decides how the ball behaves
 * when it lands as much as how far it goes.
 */
export type ShotType = 'FULL' | 'CHIP' | 'PITCH' | 'LOB';

export const SHOT_TYPES: readonly ShotType[] = ['FULL', 'CHIP', 'PITCH', 'LOB'];

export interface ShotTypeProfile {
  label: string;
  /** One line for the player, on the control. */
  hint: string;
  /**
   * How much of the club's own carry the shot flies, at a full meter. Null means
   * all of it — a full shot is whatever the club does.
   *
   * A fraction rather than a fixed number, so the club in your hands still
   * decides how far the ball goes. Chipping an 8 iron is a different shot from
   * chipping a lob wedge, and it was not when every club chipped the same
   * fourteen metres.
   */
  carryFraction: number | null;
  /** Ceiling on that, so no club can be made to chip half the hole. */
  maxCarryMetres: number | null;
  /** Launch angle in degrees, or null to use the club's loft. */
  launchAngleDeg: number | null;
  /**
   * How much of the way to the pin the shot is meant to land, 0 to 1.
   *
   * A chip is aimed at a landing spot well short and left to run; a lob is aimed
   * at the flag because it will not move afterwards. This is what picks the club
   * for you, and it is why the suggestion is playable rather than merely legal.
   */
  landsAtFraction: number;
  /**
   * How hard it checks on landing, 0 to 1. This is what separates the shots once
   * they are on the ground: a chip is mostly roll, a lob barely moves.
   */
  spinFactor: number | null;
}

const PROFILES: Record<ShotType, ShotTypeProfile> = {
  FULL: {
    label: 'FULL',
    hint: 'the whole club',
    landsAtFraction: 1,
    carryFraction: null,
    maxCarryMetres: null,
    launchAngleDeg: null,
    spinFactor: null
  },
  CHIP: {
    // Low, lands early, runs like a putt. The shot for a clear path to the flag.
    label: 'CHIP',
    hint: 'low, runs on',
    landsAtFraction: 0.58,
    carryFraction: 0.14,
    maxCarryMetres: 26,
    launchAngleDeg: 19,
    spinFactor: 0.1
  },
  PITCH: {
    // Up in the air and down with some check. The everyday shot from short range.
    label: 'PITCH',
    hint: 'flighted, checks',
    landsAtFraction: 0.88,
    carryFraction: 0.4,
    maxCarryMetres: 48,
    launchAngleDeg: 47,
    spinFactor: 0.8
  },
  LOB: {
    // Straight up and straight down. Costs distance, stops where it lands.
    label: 'LOB',
    hint: 'high, stops fast',
    landsAtFraction: 0.95,
    carryFraction: 0.34,
    maxCarryMetres: 28,
    launchAngleDeg: 61,
    spinFactor: 0.97
  }
};

export function shotTypeProfile(type: ShotType): ShotTypeProfile {
  return PROFILES[type];
}

/**
 * Within this distance of the pin the short game is on offer.
 *
 * Beyond it there is nothing a chip or a pitch can do that a club cannot, and
 * the control would be clutter on every tee shot.
 */
export const SHORT_GAME_RANGE_METRES = 55;

/** Whether the short shots can be played from here at all. */
export function shortGameAvailable(distanceToPinMetres: number, isOnGreen: boolean): boolean {
  return !isOnGreen && distanceToPinMetres <= SHORT_GAME_RANGE_METRES;
}

/** The next type when cycling, clamped at each end rather than wrapping. */
export function adjacentShotType(type: ShotType, direction: -1 | 1): ShotType {
  const index = SHOT_TYPES.indexOf(type);
  const next = Math.max(0, Math.min(SHOT_TYPES.length - 1, index + direction));
  return SHOT_TYPES[next];
}

/**
 * The shot that suits this distance, as a starting point.
 *
 * Close in, a chip: the ball spends most of its journey on the ground, where it
 * is predictable. Further out there is no room to run it, so it goes in the air.
 */
export function suggestedShotType(distanceToPinMetres: number): ShotType {
  if (distanceToPinMetres > SHORT_GAME_RANGE_METRES) return 'FULL';
  if (distanceToPinMetres <= 22) return 'CHIP';
  return 'PITCH';
}

/**
 * The club as this shot plays it.
 *
 * Handed to the flight model in place of the real club, which is why none of
 * this needed new physics: a chip is a club that carries sixteen metres, comes
 * out low and does not check. The club still matters — it caps the carry, so a
 * lob wedge cannot be made to chip fifty metres.
 */
/** The loft the shot profiles are written against: a pitching wedge. */
const REFERENCE_LOFT = 44;

/**
 * How much of the club's own loft still shows through a short shot.
 *
 * Not all of it — a chip is a chip whatever is in your hands — but enough that
 * the choice matters. Chipping an 8 iron comes out lower and runs a long way;
 * the same shot with a lob wedge lands softer and sits down. Without this every
 * club chipped identically, which made the bag pointless inside forty metres.
 */
const LOFT_SHOWS_THROUGH = 0.34;

export function applyShotType(club: ClubConfig, type: ShotType): ClubConfig {
  const profile = PROFILES[type];
  if (club.isPutter) return club;

  const clubCarry = club.carryMetres ?? club.maxDistanceMetres ?? 150;
  if (profile.carryFraction === null || profile.maxCarryMetres === null) return club;

  const carry = Math.min(clubCarry * profile.carryFraction, profile.maxCarryMetres);
  const loftOffset = (club.loftDegrees - REFERENCE_LOFT) * LOFT_SHOWS_THROUGH;
  const spin = (profile.spinFactor ?? club.spinFactor) * (0.55 + 0.45 * (club.spinFactor / 0.95));

  return {
    ...club,
    carryMetres: carry,
    maxDistanceMetres: carry,
    launchAngleDeg: Math.max(12, Math.min(66, (profile.launchAngleDeg ?? club.launchAngleDeg) + loftOffset)),
    spinFactor: Math.max(0.05, Math.min(1, spin))
  };
}

/** What the shot will carry at a full meter, for the readout. */
export function carryForShot(club: ClubConfig, type: ShotType): number {
  return applyShotType(club, type).carryMetres;
}

/**
 * The club to play this shot with, from this distance.
 *
 * Picked for where the shot needs to land rather than for the distance to the
 * pin, which is not the same thing once the ball is going to run: a chip is
 * aimed well short and left to release. Without this the game handed you a lob
 * wedge at forty metres and a pitch that carried twenty-four — legal, unplayable
 * and no way to tell why.
 */
export function clubForShortShot(
  clubs: readonly ClubConfig[],
  type: ShotType,
  distanceToPinMetres: number
): ClubConfig | null {
  const playable = clubs.filter((club) => !club.isPutter);
  if (playable.length === 0) return null;

  const wanted = distanceToPinMetres * PROFILES[type].landsAtFraction;

  // Ties go to the more lofted club, which is the shorter one: the bag runs from
  // driver down, and several clubs give the same shot once the ceiling caps them.
  // Taking the first match had the game handing out a driver to lob thirty
  // metres, which is legal and ridiculous.
  return playable.reduce((best, club) =>
    Math.abs(carryForShot(club, type) - wanted) <= Math.abs(carryForShot(best, type) - wanted)
      ? club
      : best
  );
}
