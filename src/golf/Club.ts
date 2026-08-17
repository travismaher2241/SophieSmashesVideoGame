export interface ClubConfig {
  id: string;
  name: string;
  code: string;
  maxDistanceMetres: number;
  loftDegrees: number;
  isPutter: boolean;
}

export const GOLF_CLUBS: ClubConfig[] = [
  {
    id: 'driver',
    name: 'Driver (1W)',
    code: '1W',
    maxDistanceMetres: 230,
    loftDegrees: 12,
    isPutter: false
  },
  {
    id: '7iron',
    name: '7 Iron (7I)',
    code: '7I',
    maxDistanceMetres: 145,
    loftDegrees: 32,
    isPutter: false
  },
  {
    id: 'wedge',
    name: 'Pitching Wedge (PW)',
    code: 'PW',
    maxDistanceMetres: 100,
    loftDegrees: 48,
    isPutter: false
  },
  {
    id: 'putter',
    name: 'Putter (PT)',
    code: 'PT',
    maxDistanceMetres: 25,
    loftDegrees: 0,
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

  public selectNextClub(): ClubConfig {
    this.currentIndex = (this.currentIndex + 1) % GOLF_CLUBS.length;
    return this.getCurrentClub();
  }

  public selectPrevClub(): ClubConfig {
    this.currentIndex = (this.currentIndex - 1 + GOLF_CLUBS.length) % GOLF_CLUBS.length;
    return this.getCurrentClub();
  }

  public autoSelectClubForDistance(distanceMetres: number): ClubConfig {
    // If within 20m, recommend putter or wedge
    if (distanceMetres <= 20) {
      const putterIdx = GOLF_CLUBS.findIndex((c) => c.isPutter);
      this.currentIndex = putterIdx !== -1 ? putterIdx : GOLF_CLUBS.length - 1;
      return this.getCurrentClub();
    }

    // Find club with max carry closest above remaining distance (excluding putter)
    for (let i = GOLF_CLUBS.length - 2; i >= 0; i--) {
      if (GOLF_CLUBS[i].maxDistanceMetres >= distanceMetres) {
        this.currentIndex = i;
        return this.getCurrentClub();
      }
    }

    this.currentIndex = 0; // Default Driver
    return this.getCurrentClub();
  }
}
