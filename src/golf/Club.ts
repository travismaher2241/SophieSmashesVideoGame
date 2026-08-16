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
    name: '1 Wood (Driver)',
    code: '1W',
    maxDistanceMetres: 230,
    loftDegrees: 12,
    isPutter: false
  },
  {
    id: '5iron',
    name: '5 Iron',
    code: '5I',
    maxDistanceMetres: 170,
    loftDegrees: 24,
    isPutter: false
  },
  {
    id: '9iron',
    name: '9 Iron',
    code: '9I',
    maxDistanceMetres: 120,
    loftDegrees: 40,
    isPutter: false
  },
  {
    id: 'wedge',
    name: 'Pitching Wedge',
    code: 'PW',
    maxDistanceMetres: 70,
    loftDegrees: 56,
    isPutter: false
  },
  {
    id: 'putter',
    name: 'Putter',
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
    if (distanceMetres < 15) {
      this.currentIndex = GOLF_CLUBS.findIndex((c) => c.isPutter);
      return this.getCurrentClub();
    }

    // Find club with max distance closest above remaining distance
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
