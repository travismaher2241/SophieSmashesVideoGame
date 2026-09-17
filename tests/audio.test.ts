import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { landingSoundFor, SoundName, SOUNDS, soundDuration, swingSoundFor } from '../src/audio/SoundBank';
import { GOLF_CLUBS } from '../src/golf/Club';

const club = (id: string) => GOLF_CLUBS.find((entry) => entry.id === id)!;

/**
 * A recording stand-in for the Web Audio API.
 *
 * Only the handful of calls the engine makes, each one keeping what it was
 * asked to do so a test can read it back.
 */
function fakeContext() {
  const scheduled: Array<{ kind: string; start: number; stop: number | null; hz: number[] }> = [];
  const connections: string[] = [];
  const gains: number[] = [];
  let resumed = 0;

  const param = (record: number[]) => ({
    setValueAtTime: (value: number) => record.push(value),
    linearRampToValueAtTime: (value: number) => record.push(value),
    exponentialRampToValueAtTime: (value: number) => record.push(value)
  });

  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 10,
    sampleRate: 48000,
    destination: { name: 'destination' },
    resume: () => {
      resumed++;
      context.state = 'running';
      return Promise.resolve();
    },
    createGain() {
      const values: number[] = [];
      gains.push(...[]);
      return {
        name: 'gain',
        gainValues: values,
        gain: param(values),
        connect: (to: { name?: string }) => connections.push(`gain->${to.name ?? '?'}`)
      };
    },
    createOscillator() {
      const hz: number[] = [];
      const entry = { kind: 'tone', start: -1, stop: null as number | null, hz };
      scheduled.push(entry);
      return {
        name: 'osc',
        type: 'sine' as OscillatorType,
        frequency: param(hz),
        connect: (to: { name?: string }) => connections.push(`osc->${to.name ?? '?'}`),
        start: (t: number) => { entry.start = t; },
        stop: (t: number) => { entry.stop = t; }
      };
    },
    createBufferSource() {
      const entry = { kind: 'noise', start: -1, stop: null as number | null, hz: [] as number[] };
      scheduled.push(entry);
      return {
        name: 'buffer',
        buffer: null as AudioBuffer | null,
        loop: false,
        connect: (to: { name?: string }) => connections.push(`buffer->${to.name ?? '?'}`),
        start: (t: number) => { entry.start = t; },
        stop: (t: number) => { entry.stop = t; }
      };
    },
    createBiquadFilter() {
      const hz: number[] = [];
      return {
        name: 'filter',
        type: 'lowpass' as BiquadFilterType,
        frequency: param(hz),
        Q: param([]),
        filterHz: hz,
        connect: (to: { name?: string }) => connections.push(`filter->${to.name ?? '?'}`)
      };
    },
    createBuffer(_channels: number, frames: number) {
      const data = new Float32Array(frames);
      return { getChannelData: () => data, length: frames } as unknown as AudioBuffer;
    }
  };

  return {
    context: context as unknown as AudioContext,
    scheduled,
    connections,
    gains,
    resumed: () => resumed
  };
}

describe('the sound bank', () => {
  const names = Object.keys(SOUNDS) as SoundName[];

  it('gives every sound at least one voice', () => {
    for (const name of names) {
      expect(SOUNDS[name].layers.length, name).toBeGreaterThan(0);
    }
  });

  it('keeps every sound short enough to be a sound effect', () => {
    // A sound that outlasts the shot it belongs to is a bug you hear on the
    // next one. The cheer is the only long one, and it is under a second and a
    // half.
    for (const name of names) {
      const duration = soundDuration(SOUNDS[name]);
      expect(duration, name).toBeGreaterThan(0);
      expect(duration, name).toBeLessThanOrEqual(1.5);
    }
  });

  it('describes every layer with numbers that can be played', () => {
    for (const name of names) {
      for (const [index, layer] of SOUNDS[name].layers.entries()) {
        const where = `${name} layer ${index}`;
        expect(layer.duration, where).toBeGreaterThan(0);
        expect(layer.gain, where).toBeGreaterThan(0);
        expect(layer.gain, where).toBeLessThanOrEqual(1);
        // An attack longer than the sound never reaches its peak.
        expect(layer.attack, where).toBeLessThanOrEqual(layer.duration);
        if (layer.kind === 'tone') {
          expect(layer.startHz, where).toBeGreaterThan(0);
          if (layer.endHz !== undefined) expect(layer.endHz, where).toBeGreaterThan(0);
        }
        if (layer.filter) expect(layer.filter.hz, where).toBeGreaterThan(0);
      }
    }
  });

  it('gives each club its own strike', () => {
    expect(swingSoundFor(club('driver'))).toBe('SWING_WOOD');
    expect(swingSoundFor(club('3wood'))).toBe('SWING_WOOD');
    expect(swingSoundFor(club('7iron'))).toBe('SWING_IRON');
    expect(swingSoundFor(club('putter'))).toBe('PUTT');
    expect(swingSoundFor(GOLF_CLUBS.find((entry) => entry.name.includes('WEDGE'))!)).toBe('SWING_WEDGE');
  });

  it('gives the ground its own arrival', () => {
    // Water and sand are the two the player most needs to hear without looking.
    expect(landingSoundFor('WATER')).toBe('LAND_WATER');
    expect(landingSoundFor('BUNKER')).toBe('LAND_SAND');
    expect(landingSoundFor('FAIRWAY')).toBe('LAND_TURF');
    expect(landingSoundFor('GREEN')).toBe('LAND_TURF');
    expect(landingSoundFor('DEEP_ROUGH')).toBe('LAND_TURF');
  });
});

describe('the audio engine', () => {
  it('builds nothing until it is asked for a sound', () => {
    let built = 0;
    const engine = new AudioEngine({ createContext: () => { built++; return fakeContext().context; } });

    expect(engine.isRunning()).toBe(false);
    expect(built).toBe(0);

    engine.play('UI');
    expect(engine.isRunning()).toBe(true);
    expect(built).toBe(1);

    engine.play('UI');
    expect(built, 'the context is built once, not per sound').toBe(1);
  });

  it('schedules every voice of a sound, and schedules it to stop', () => {
    // Nothing may be started without an end: a tone left running is a tone that
    // is still running on the next hole.
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.context });

    engine.play('SWING_WOOD');

    expect(fake.scheduled).toHaveLength(SOUNDS.SWING_WOOD.layers.length);
    for (const entry of fake.scheduled) {
      expect(entry.start).toBeGreaterThanOrEqual(10);
      expect(entry.stop).not.toBeNull();
      expect(entry.stop!).toBeGreaterThan(entry.start);
    }
  });

  it('honours a layer that waits its turn', () => {
    // The cup sound is a rattle and then two notes; if the delays were ignored
    // it would be a chord.
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.context });

    engine.play('HOLED');

    const starts = fake.scheduled.map((entry) => entry.start);
    expect(new Set(starts).size).toBeGreaterThan(1);
    expect(Math.max(...starts)).toBeGreaterThan(Math.min(...starts));
  });

  it('bends the whole sound when it is given a pitch', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.context });

    engine.play('LAND_TURF', { pitch: 2 });

    const tone = fake.scheduled.find((entry) => entry.kind === 'tone')!;
    const spec = SOUNDS.LAND_TURF.layers.find((layer) => layer.kind === 'tone')!;
    expect(tone.hz[0]).toBeCloseTo(spec.startHz * 2, 5);
  });

  it('makes no sound at all when it is switched off', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.context, enabled: false });

    engine.play('SWING_WOOD');
    expect(fake.scheduled).toHaveLength(0);
    expect(engine.isEnabled()).toBe(false);

    engine.setEnabled(true);
    engine.play('SWING_WOOD');
    expect(fake.scheduled.length).toBeGreaterThan(0);
  });

  it('starts the context on a gesture, and only resumes a suspended one', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.context });

    engine.resume();
    expect(fake.resumed()).toBe(1);

    // Already running: resuming again is not an error, and not a second resume.
    engine.resume();
    expect(fake.resumed()).toBe(1);
  });

  it('plays on silently when the browser will not give it audio', () => {
    // A phone that refuses an audio context must cost the player a sound, not a
    // round.
    const silent = new AudioEngine({ createContext: () => null });
    expect(() => silent.play('SWING_WOOD')).not.toThrow();
    expect(() => silent.resume()).not.toThrow();
    expect(silent.isRunning()).toBe(false);

    const broken = new AudioEngine({
      createContext: () => {
        throw new Error('no audio here');
      }
    });
    expect(() => broken.play('SWING_WOOD')).not.toThrow();
  });

  it('survives a context that fails part-way through a sound', () => {
    const fake = fakeContext();
    const context = fake.context as unknown as { createOscillator: () => unknown };
    const engine = new AudioEngine({ createContext: () => fake.context });

    engine.play('UI');
    context.createOscillator = () => {
      throw new Error('gone');
    };
    expect(() => engine.play('SWING_WOOD')).not.toThrow();
  });
});
