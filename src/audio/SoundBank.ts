import { ClubConfig } from '../golf/Club';
import { SurfaceType } from '../course/SurfaceQuery';

/**
 * How a sound is made.
 *
 * Every sound in the game is built here out of oscillators and filtered noise
 * rather than loaded from a file. A 16-bit golf game's sounds were synthesised
 * on the machine, they suit the look, and it keeps the course the only thing
 * this game has to download.
 *
 * A layer is one voice: a tone that may slide from one pitch to another, or a
 * burst of noise shaped by a filter. Real sounds are two or three of these at
 * once — a strike is a click of noise over a thump of tone.
 */
export interface SoundLayer {
  kind: 'tone' | 'noise';
  /** Oscillator shape, for a tone. Square and sawtooth are the chip-era ones. */
  wave?: OscillatorType;
  /** Pitch in hertz at the start, and at the end if it slides. */
  startHz: number;
  endHz?: number;
  /** Seconds. */
  duration: number;
  /** Peak level, 0 to 1, before the master volume. */
  gain: number;
  /** Seconds to reach that peak. Short is a click, long is a swell. */
  attack: number;
  /** Seconds to wait before this layer starts, for a two-part sound. */
  delay?: number;
  /** Filter applied to a noise layer: the difference between sand and water. */
  filter?: { type: BiquadFilterType; hz: number; endHz?: number; q?: number };
}

export interface SoundSpec {
  layers: SoundLayer[];
}

export type SoundName =
  | 'SWING_WOOD'
  | 'SWING_IRON'
  | 'SWING_WEDGE'
  | 'PUTT'
  | 'METER_START'
  | 'METER_POWER'
  | 'LAND_TURF'
  | 'LAND_SAND'
  | 'LAND_WATER'
  | 'TREE'
  | 'HOLED'
  | 'PENALTY'
  | 'CHEER'
  | 'UI';

/**
 * A struck golf ball is a click and a thump at once: the crack of the face and
 * the low note of the shaft. The clubs differ in how bright that click is and
 * how low the note under it goes — a driver is a boom, a wedge is a click and
 * almost nothing else.
 */
export const SOUNDS: Record<SoundName, SoundSpec> = {
  SWING_WOOD: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.07, gain: 0.55, attack: 0.002, filter: { type: 'bandpass', hz: 1500, q: 1.1 } },
      { kind: 'tone', wave: 'triangle', startHz: 300, endHz: 120, duration: 0.16, gain: 0.5, attack: 0.002 }
    ]
  },
  SWING_IRON: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.05, gain: 0.5, attack: 0.001, filter: { type: 'bandpass', hz: 2400, q: 1.4 } },
      { kind: 'tone', wave: 'triangle', startHz: 520, endHz: 260, duration: 0.1, gain: 0.38, attack: 0.001 }
    ]
  },
  SWING_WEDGE: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.05, gain: 0.4, attack: 0.001, filter: { type: 'bandpass', hz: 1800, q: 1.6 } },
      { kind: 'tone', wave: 'triangle', startHz: 640, endHz: 400, duration: 0.07, gain: 0.26, attack: 0.001 }
    ]
  },
  // A putt is the quietest strike in golf and the game should say so: there is
  // no crack, just a soft knock of wood on plastic.
  PUTT: {
    layers: [
      { kind: 'tone', wave: 'sine', startHz: 900, endHz: 620, duration: 0.07, gain: 0.3, attack: 0.001 },
      { kind: 'noise', startHz: 0, duration: 0.025, gain: 0.18, attack: 0.001, filter: { type: 'lowpass', hz: 2200 } }
    ]
  },

  // The three-click meter, given two notes a fifth apart. The point is to be
  // able to time the swing partly by ear, so they have to be distinct and they
  // have to be short.
  METER_START: {
    layers: [{ kind: 'tone', wave: 'square', startHz: 440, duration: 0.05, gain: 0.16, attack: 0.001 }]
  },
  METER_POWER: {
    layers: [{ kind: 'tone', wave: 'square', startHz: 660, duration: 0.05, gain: 0.16, attack: 0.001 }]
  },

  /** Ball into turf: a dull thud with no ring to it. */
  LAND_TURF: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.11, gain: 0.34, attack: 0.004, filter: { type: 'lowpass', hz: 420 } },
      { kind: 'tone', wave: 'sine', startHz: 150, endHz: 80, duration: 0.09, gain: 0.2, attack: 0.003 }
    ]
  },
  /** Sand is all hiss and no thud, and it goes on longer than turf does. */
  LAND_SAND: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.3, gain: 0.34, attack: 0.006, filter: { type: 'bandpass', hz: 1400, endHz: 700, q: 0.7 } }
    ]
  },
  /** Water: a plop, then the hiss of the splash falling back. */
  LAND_WATER: {
    layers: [
      { kind: 'tone', wave: 'sine', startHz: 700, endHz: 180, duration: 0.14, gain: 0.34, attack: 0.002 },
      { kind: 'noise', startHz: 0, duration: 0.42, gain: 0.26, attack: 0.02, delay: 0.05, filter: { type: 'highpass', hz: 900 } }
    ]
  },
  /** Timber. The sound a player needs to hear before they see the ball drop. */
  TREE: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.06, gain: 0.4, attack: 0.001, filter: { type: 'bandpass', hz: 700, q: 2 } },
      { kind: 'tone', wave: 'square', startHz: 190, endHz: 120, duration: 0.12, gain: 0.26, attack: 0.001 }
    ]
  },
  /** The rattle in the cup, and then the note every golfer is playing for. */
  HOLED: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 0.1, gain: 0.3, attack: 0.001, filter: { type: 'bandpass', hz: 1100, q: 3 } },
      { kind: 'tone', wave: 'triangle', startHz: 880, duration: 0.12, gain: 0.3, attack: 0.004, delay: 0.06 },
      { kind: 'tone', wave: 'triangle', startHz: 1320, duration: 0.3, gain: 0.3, attack: 0.004, delay: 0.16 }
    ]
  },
  /** Two falling notes: the sound of a stroke you did not have to play. */
  PENALTY: {
    layers: [
      { kind: 'tone', wave: 'sawtooth', startHz: 260, duration: 0.14, gain: 0.2, attack: 0.004 },
      { kind: 'tone', wave: 'sawtooth', startHz: 180, duration: 0.3, gain: 0.2, attack: 0.004, delay: 0.14 }
    ]
  },
  /** A crowd is filtered noise that swells and dies. Kept for a birdie. */
  CHEER: {
    layers: [
      { kind: 'noise', startHz: 0, duration: 1.3, gain: 0.3, attack: 0.18, filter: { type: 'bandpass', hz: 900, endHz: 1500, q: 0.6 } }
    ]
  },
  UI: {
    layers: [{ kind: 'tone', wave: 'square', startHz: 520, duration: 0.03, gain: 0.1, attack: 0.001 }]
  }
};

/** Which strike a club makes. Woods boom, irons ring, wedges click. */
export function swingSoundFor(club: ClubConfig): SoundName {
  if (club.isPutter) return 'PUTT';
  if (club.id === 'driver' || club.id.includes('wood')) return 'SWING_WOOD';
  if (club.id.endsWith('iron')) return 'SWING_IRON';
  return 'SWING_WEDGE';
}

/** What the ground sounds like when the ball arrives on it. */
export function landingSoundFor(surface: SurfaceType): SoundName {
  if (surface === 'WATER') return 'LAND_WATER';
  if (surface === 'BUNKER') return 'LAND_SAND';
  return 'LAND_TURF';
}

/**
 * How long a sound lasts, so nothing can be scheduled to ring forever.
 *
 * Every layer's delay plus its duration; the longest one wins.
 */
export function soundDuration(spec: SoundSpec): number {
  return spec.layers.reduce((longest, layer) => Math.max(longest, (layer.delay ?? 0) + layer.duration), 0);
}
