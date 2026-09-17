import { ClubConfig } from '../golf/Club';

/**
 * The parts of the game you can get better at.
 *
 * Split by what is in your hands rather than by distance, because that is what
 * the player is choosing: practice on the range is time with a driver, or with
 * irons, or around a chipping green, or on a putting green.
 */
export type Discipline = 'DRIVING' | 'IRONS' | 'WEDGES' | 'PUTTING';

/**
 * What a session buys.
 *
 * POWER is distance; ACCURACY is a wider margin for a mistimed strike — the
 * sweet spot on the three-click meter, and on the greens the amount the stroke
 * wanders off the pace and the line you set.
 */
export type Attribute = 'POWER' | 'ACCURACY';

export const DISCIPLINES: readonly Discipline[] = ['DRIVING', 'IRONS', 'WEDGES', 'PUTTING'];
export const ATTRIBUTES: readonly Attribute[] = ['POWER', 'ACCURACY'];

/** How far each track can be taken. */
export const MAX_LEVEL = 5;

export type AbilityKey = `${Discipline}_${Attribute}`;
export type Abilities = Record<AbilityKey, number>;

export function abilityKey(discipline: Discipline, attribute: Attribute): AbilityKey {
  return `${discipline}_${attribute}`;
}

/** A player who has never trained. */
export function untrained(): Abilities {
  const abilities = {} as Abilities;
  for (const discipline of DISCIPLINES) {
    for (const attribute of ATTRIBUTES) abilities[abilityKey(discipline, attribute)] = 0;
  }
  return abilities;
}

export function levelOf(abilities: Abilities, discipline: Discipline, attribute: Attribute): number {
  return abilities[abilityKey(discipline, attribute)] ?? 0;
}

export function canTrain(abilities: Abilities, discipline: Discipline, attribute: Attribute): boolean {
  return levelOf(abilities, discipline, attribute) < MAX_LEVEL;
}

/** One session spent. Returns a new set rather than editing the old one. */
export function trained(abilities: Abilities, discipline: Discipline, attribute: Attribute): Abilities {
  if (!canTrain(abilities, discipline, attribute)) return abilities;

  return { ...abilities, [abilityKey(discipline, attribute)]: levelOf(abilities, discipline, attribute) + 1 };
}

/** Which bag a club belongs to, for working out what a session applies to. */
export function disciplineForClub(club: ClubConfig): Discipline {
  if (club.isPutter) return 'PUTTING';
  if (club.id === 'driver' || club.id.includes('wood')) return 'DRIVING';
  if (club.id.endsWith('iron')) return 'IRONS';
  return 'WEDGES';
}

/**
 * How much further a trained club carries.
 *
 * Two and a half per cent a session, so five sessions on driving is about
 * twelve per cent — nearly thirty metres on a drive. Enough to feel, not enough
 * to make the course you learned on unrecognisable.
 */
const CARRY_PER_LEVEL = 0.025;

export function carryMultiplier(abilities: Abilities, club: ClubConfig): number {
  return 1 + CARRY_PER_LEVEL * levelOf(abilities, disciplineForClub(club), 'POWER');
}

/**
 * How much wider the sweet spot gets.
 *
 * The three-click meter grades a strike on how far the marker stopped from the
 * middle. Training does not move the bands so much as make the miss count for
 * less: at five levels a strike is judged as though it were two thirds as far
 * out as it really was.
 */
const FORGIVENESS_PER_LEVEL = 0.075;

export function strikeForgiveness(abilities: Abilities, club: ClubConfig): number {
  return 1 - FORGIVENESS_PER_LEVEL * levelOf(abilities, disciplineForClub(club), 'ACCURACY');
}

/**
 * How far a putt strays from the pace and the line the player set.
 *
 * Putting was exact: the ball went precisely as far as the meter said, precisely
 * down the aim line, every time. That is a calculator rather than a skill, and
 * it left nothing for a session on the putting green to improve. There is a
 * little wobble in the stroke now, and training takes it out — at five levels it
 * is all but gone, which is where putting used to start.
 */
const PACE_ERROR_AT_ZERO = 0.05;
const LINE_ERROR_DEGREES_AT_ZERO = 1.1;

export function puttPaceError(abilities: Abilities): number {
  return PACE_ERROR_AT_ZERO * (1 - levelOf(abilities, 'PUTTING', 'POWER') / MAX_LEVEL) ** 1.5;
}

export function puttLineErrorDegrees(abilities: Abilities): number {
  return LINE_ERROR_DEGREES_AT_ZERO * (1 - levelOf(abilities, 'PUTTING', 'ACCURACY') / MAX_LEVEL) ** 1.5;
}

/** What each track does, for the training screen. */
export const ABILITY_LABELS: Record<Discipline, { name: string; power: string; accuracy: string }> = {
  DRIVING: { name: 'DRIVING', power: 'Longer off the tee', accuracy: 'Wider sweet spot with a wood' },
  IRONS: { name: 'IRONS', power: 'Longer irons', accuracy: 'Wider sweet spot with an iron' },
  WEDGES: { name: 'WEDGES', power: 'Longer wedges', accuracy: 'Wider sweet spot with a wedge' },
  PUTTING: { name: 'PUTTING', power: 'Truer pace', accuracy: 'Truer line' }
};

/**
 * How many sessions a round is worth.
 *
 * Playing well earns more, but finishing always earns one: a round that taught
 * you nothing because you played badly is the round you most want to train
 * after.
 */
export function sessionsEarned(strokes: number, par: number): number {
  const relativeToPar = strokes - par;

  if (relativeToPar <= 0) return 3;
  if (relativeToPar <= 8) return 2;
  return 1;
}
