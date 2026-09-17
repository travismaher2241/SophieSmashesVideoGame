import { describe, expect, it } from 'vitest';
import { canPuttFromLie, ClubConfig, ClubManager, GOLF_CLUBS } from '../src/golf/Club';

/** The rule the game applies: everything but the putter, which needs a green. */
const offTheGreen = (club: ClubConfig) => !club.isPutter;
const onTheFringe = () => true;

describe('taking the putter out of the bag', () => {
  it('allows it on the green and its fringe, and nowhere else', () => {
    expect(canPuttFromLie('GREEN')).toBe(true);
    expect(canPuttFromLie('FRINGE')).toBe(true);

    for (const lie of ['TEE', 'FAIRWAY', 'FIRST_CUT', 'ROUGH', 'DEEP_ROUGH', 'BUNKER', 'WATER']) {
      expect(canPuttFromLie(lie), lie).toBe(false);
    }
  });

  it('says no to a lie it has never heard of', () => {
    expect(canPuttFromLie(undefined)).toBe(false);
    expect(canPuttFromLie('')).toBe(false);
  });
});

describe('cycling through the bag', () => {
  it('passes over the putter when the lie forbids it', () => {
    // Starting on the lob wedge, the club before the putter: forward used to
    // land on it, and choosing it off the green was a misclick with no way back.
    const bag = new ClubManager('lw');

    expect(bag.selectNextClub(offTheGreen).id).toBe('driver');
  });

  it('passes over it going the other way too', () => {
    const bag = new ClubManager('driver');

    expect(bag.selectPrevClub(offTheGreen).id).toBe('lw');
  });

  it('hands it over where it is allowed', () => {
    const bag = new ClubManager('lw');

    expect(bag.selectNextClub(onTheFringe).id).toBe('putter');
  });

  it('still changes club on every press', () => {
    // Skipping rather than refusing: the control has to keep doing something,
    // or it reads as broken.
    const bag = new ClubManager('driver');
    const seen = new Set<string>();

    for (let press = 0; press < GOLF_CLUBS.length - 1; press++) {
      seen.add(bag.selectNextClub(offTheGreen).id);
    }

    expect(seen.size).toBe(GOLF_CLUBS.length - 1);
    expect(seen.has('putter')).toBe(false);
  });

  it('comes all the way round without landing on the putter', () => {
    const bag = new ClubManager('driver');
    // Thirteen clubs in the cycle once the putter is out of it, so three laps is
    // thirty-nine presses — not forty-two.
    const cycle = GOLF_CLUBS.length - 1;

    for (let press = 0; press < cycle * 3; press++) {
      expect(bag.selectNextClub(offTheGreen).isPutter).toBe(false);
    }
    expect(bag.getCurrentClub().id).toBe('driver');
  });

  it('stays where it is when nothing at all is playable', () => {
    const bag = new ClubManager('7iron');

    expect(bag.selectNextClub(() => false).id).toBe('7iron');
    expect(bag.selectPrevClub(() => false).id).toBe('7iron');
  });

  it('still walks the whole bag when everything is allowed', () => {
    const bag = new ClubManager('driver');

    for (let press = 0; press < GOLF_CLUBS.length; press++) bag.selectNextClub();
    expect(bag.getCurrentClub().id).toBe('driver');
  });
});
