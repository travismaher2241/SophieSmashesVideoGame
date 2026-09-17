export interface ClubConfig {
  id: string;
  name: string;          // Player-facing display name, e.g. "DRIVER", "7 IRON"
  displayName: string;   // Explicit display name
  code: string;          // Short code, e.g. "DR", "7I", "PW", "PT"
  maxDistanceMetres: number; // Carry distance in metres
  carryMetres: number;   // Explicit carry distance
  loftDegrees: number;   // Launch angle / loft in degrees
  launchAngleDeg: number;// Explicit launch angle
  spinFactor: number;    // Spin / green-holding factor (0.1 for Driver to 0.95 for Wedges)
  accuracyFactor: number;// Base accuracy factor
  isPutter: boolean;
}

/**
 * Which swing animation a club is played with.
 *
 * The artwork is drawn per swing type, not per club: a driver and a 3 wood are
 * swung the same way, and so are a 6 iron and a sand wedge.
 */
export type SwingStyle = 'DRIVER' | 'IRON' | 'PUTT';

export function swingStyleForClub(club: ClubConfig): SwingStyle {
  if (club.isPutter) return 'PUTT';
  return club.id.includes('wood') || club.id === 'driver' ? 'DRIVER' : 'IRON';
}

/**
 * Lies you may take the putter from.
 *
 * A putter off a tee or out of the rough is not a shot, it is a misclick — and
 * it used to be one you could not undo, because choosing it switched the HUD to
 * putting and putting hides the club selector. So the club is simply not on
 * offer until the ball is on the green or on its fringe, which is also the only
 * place anyone would use it.
 */
export function canPuttFromLie(lieType: string | undefined): boolean {
  return lieType === 'GREEN' || lieType === 'FRINGE';
}

export const GOLF_CLUBS: ClubConfig[] = [
  {
    id: 'driver',
    name: 'DRIVER',
    displayName: 'DRIVER',
    code: 'DR',
    maxDistanceMetres: 230,
    carryMetres: 230,
    loftDegrees: 11,
    launchAngleDeg: 11,
    spinFactor: 0.15,
    accuracyFactor: 0.80,
    isPutter: false
  },
  {
    id: '3wood',
    name: '3 WOOD',
    displayName: '3 WOOD',
    code: '3W',
    maxDistanceMetres: 210,
    carryMetres: 210,
    loftDegrees: 14,
    launchAngleDeg: 14,
    spinFactor: 0.25,
    accuracyFactor: 0.83,
    isPutter: false
  },
  {
    id: '5wood',
    name: '5 WOOD',
    displayName: '5 WOOD',
    code: '5W',
    maxDistanceMetres: 195,
    carryMetres: 195,
    loftDegrees: 17,
    launchAngleDeg: 17,
    spinFactor: 0.35,
    accuracyFactor: 0.86,
    isPutter: false
  },
  {
    id: '4iron',
    name: '4 IRON',
    displayName: '4 IRON',
    code: '4I',
    maxDistanceMetres: 175,
    carryMetres: 175,
    loftDegrees: 21,
    launchAngleDeg: 21,
    spinFactor: 0.45,
    accuracyFactor: 0.88,
    isPutter: false
  },
  {
    id: '5iron',
    name: '5 IRON',
    displayName: '5 IRON',
    code: '5I',
    maxDistanceMetres: 165,
    carryMetres: 165,
    loftDegrees: 24,
    launchAngleDeg: 24,
    spinFactor: 0.50,
    accuracyFactor: 0.90,
    isPutter: false
  },
  {
    id: '6iron',
    name: '6 IRON',
    displayName: '6 IRON',
    code: '6I',
    maxDistanceMetres: 155,
    carryMetres: 155,
    loftDegrees: 27,
    launchAngleDeg: 27,
    spinFactor: 0.55,
    accuracyFactor: 0.92,
    isPutter: false
  },
  {
    id: '7iron',
    name: '7 IRON',
    displayName: '7 IRON',
    code: '7I',
    maxDistanceMetres: 145,
    carryMetres: 145,
    loftDegrees: 31,
    launchAngleDeg: 31,
    spinFactor: 0.60,
    accuracyFactor: 0.93,
    isPutter: false
  },
  {
    id: '8iron',
    name: '8 IRON',
    displayName: '8 IRON',
    code: '8I',
    maxDistanceMetres: 132,
    carryMetres: 132,
    loftDegrees: 35,
    launchAngleDeg: 35,
    spinFactor: 0.65,
    accuracyFactor: 0.95,
    isPutter: false
  },
  {
    id: '9iron',
    name: '9 IRON',
    displayName: '9 IRON',
    code: '9I',
    maxDistanceMetres: 120,
    carryMetres: 120,
    loftDegrees: 39,
    launchAngleDeg: 39,
    spinFactor: 0.70,
    accuracyFactor: 0.96,
    isPutter: false
  },
  {
    id: 'pw',
    name: 'PITCHING WEDGE',
    displayName: 'PITCHING WEDGE',
    code: 'PW',
    maxDistanceMetres: 105,
    carryMetres: 105,
    loftDegrees: 44,
    launchAngleDeg: 44,
    spinFactor: 0.78,
    accuracyFactor: 0.97,
    isPutter: false
  },
  {
    id: 'gw',
    name: 'GAP WEDGE',
    displayName: 'GAP WEDGE',
    code: 'GW',
    maxDistanceMetres: 90,
    carryMetres: 90,
    loftDegrees: 48,
    launchAngleDeg: 48,
    spinFactor: 0.85,
    accuracyFactor: 0.98,
    isPutter: false
  },
  {
    id: 'sw',
    name: 'SAND WEDGE',
    displayName: 'SAND WEDGE',
    code: 'SW',
    maxDistanceMetres: 75,
    carryMetres: 75,
    loftDegrees: 53,
    launchAngleDeg: 53,
    spinFactor: 0.90,
    accuracyFactor: 0.99,
    isPutter: false
  },
  {
    id: 'lw',
    name: 'LOB WEDGE',
    displayName: 'LOB WEDGE',
    code: 'LW',
    maxDistanceMetres: 60,
    carryMetres: 60,
    loftDegrees: 58,
    launchAngleDeg: 58,
    spinFactor: 0.95,
    accuracyFactor: 1.00,
    isPutter: false
  },
  {
    id: 'putter',
    name: 'PUTTER',
    displayName: 'PUTTER',
    code: 'PT',
    maxDistanceMetres: 30,
    carryMetres: 0,
    loftDegrees: 0,
    launchAngleDeg: 0,
    spinFactor: 0.0,
    accuracyFactor: 1.00,
    isPutter: true
  }
];

export class ClubManager {
  private currentIndex: number = 0;

  constructor(initialClubId: string = 'driver') {
    const found = GOLF_CLUBS.findIndex((c) => c.id === initialClubId);
    if (found !== -1) {
      this.currentIndex = found;
    }
  }

  public getCurrentClub(): ClubConfig {
    return GOLF_CLUBS[this.currentIndex];
  }

  public getClubIndex(): number {
    return this.currentIndex;
  }

  /**
   * Step through the bag, passing over anything this lie will not allow.
   *
   * Skipping rather than stopping keeps the control predictable: a press always
   * changes the club, and the one club you cannot play is simply not in the
   * cycle. If nothing is playable the selection stays where it is rather than
   * looping for ever.
   */
  public selectNextClub(isSelectable: (club: ClubConfig) => boolean = () => true): ClubConfig {
    return this.step(1, isSelectable);
  }

  public selectPrevClub(isSelectable: (club: ClubConfig) => boolean = () => true): ClubConfig {
    return this.step(-1, isSelectable);
  }

  private step(direction: 1 | -1, isSelectable: (club: ClubConfig) => boolean): ClubConfig {
    const count = GOLF_CLUBS.length;

    for (let tried = 1; tried <= count; tried++) {
      const next = ((this.currentIndex + direction * tried) % count + count) % count;
      if (isSelectable(GOLF_CLUBS[next])) {
        this.currentIndex = next;
        return this.getCurrentClub();
      }
    }

    return this.getCurrentClub();
  }

  public selectClubById(clubId: string): ClubConfig {
    const found = GOLF_CLUBS.findIndex((c) => c.id === clubId);
    if (found !== -1) {
      this.currentIndex = found;
    }
    return this.getCurrentClub();
  }

  public autoSelectClubForDistance(distanceMetres: number, isOnGreen: boolean = false): ClubConfig {
    // If on green, strictly select Putter
    if (isOnGreen) {
      const putterIdx = GOLF_CLUBS.findIndex((c) => c.isPutter);
      this.currentIndex = putterIdx !== -1 ? putterIdx : GOLF_CLUBS.length - 1;
      return this.getCurrentClub();
    }

    // If within 15m and off green, recommend Lob Wedge or Sand Wedge
    if (distanceMetres <= 15) {
      const lwIdx = GOLF_CLUBS.findIndex((c) => c.id === 'lw');
      this.currentIndex = lwIdx !== -1 ? lwIdx : GOLF_CLUBS.length - 2;
      return this.getCurrentClub();
    }

    // Find the club whose carry is closest to or slightly above remaining distance (excluding putter)
    const playableClubs = GOLF_CLUBS.filter((c) => !c.isPutter);
    let bestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < playableClubs.length; i++) {
      const club = playableClubs[i];
      // Prefer club that covers the distance or is closest
      const diff = club.carryMetres - distanceMetres;
      if (diff >= -5 && diff < minDiff) {
        minDiff = diff;
        bestIndex = GOLF_CLUBS.indexOf(club);
      }
    }

    if (minDiff === Infinity) {
      // Distance is beyond driver or shorter than wedges: select closest carry
      let closestClubIndex = 0;
      let closestAbsDiff = Infinity;
      for (let i = 0; i < playableClubs.length; i++) {
        const diff = Math.abs(playableClubs[i].carryMetres - distanceMetres);
        if (diff < closestAbsDiff) {
          closestAbsDiff = diff;
          closestClubIndex = GOLF_CLUBS.indexOf(playableClubs[i]);
        }
      }
      bestIndex = closestClubIndex;
    }

    this.currentIndex = bestIndex;
    return this.getCurrentClub();
  }
}
