export interface Vector2D {
  x: number;
  z: number;
  elevation: number;
}

export interface PlaytestLayoutConfig {
  tee: Vector2D;
  hole: Vector2D;
  distanceMetres: number;
  isConfigured: boolean;
  savedAt: string;
}

export class PlaytestLayoutManager {
  private static readonly STORAGE_KEY = 'sophie_golf_playtest_layout_v1';

  public static load(): PlaytestLayoutConfig | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return null;
      const config: PlaytestLayoutConfig = JSON.parse(data);
      if (config && config.isConfigured && config.tee && config.hole) {
        return config;
      }
    } catch (e) {
      console.warn('Failed to load playtest layout from localStorage:', e);
    }
    return null;
  }

  public static save(tee: Vector2D, hole: Vector2D): PlaytestLayoutConfig {
    const dx = hole.x - tee.x;
    const dz = hole.z - tee.z;
    const distanceMetres = Math.round(Math.hypot(dx, dz) * 10) / 10;

    const config: PlaytestLayoutConfig = {
      tee: {
        x: Math.round(tee.x * 10) / 10,
        z: Math.round(tee.z * 10) / 10,
        elevation: Math.round(tee.elevation * 100) / 100
      },
      hole: {
        x: Math.round(hole.x * 10) / 10,
        z: Math.round(hole.z * 10) / 10,
        elevation: Math.round(hole.elevation * 100) / 100
      },
      distanceMetres,
      isConfigured: true,
      savedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save playtest layout to localStorage:', e);
    }

    return config;
  }

  public static clear(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear playtest layout from localStorage:', e);
    }
  }
}
