import { SoundLayer, SoundName, SoundSpec, SOUNDS } from './SoundBank';

/**
 * Makes the audio context, or says there is none.
 *
 * Injectable so the engine can be driven by a test without a browser, and so a
 * browser with no Web Audio at all is an ordinary case rather than a crash.
 */
export type AudioContextFactory = () => AudioContext | null;

export interface AudioEngineOptions {
  createContext?: AudioContextFactory;
  /** Everything is scaled by this before it reaches the speakers. */
  masterGain?: number;
  enabled?: boolean;
}

function defaultFactory(): AudioContext | null {
  try {
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    // Some browsers throw rather than return null when audio is unavailable.
    return null;
  }
}

/**
 * The game's sound, synthesised on the spot.
 *
 * Two things shape this class. A browser will not start audio until the player
 * has touched the page, so the context is not built until there is a gesture to
 * build it on — and until then every call to play is a no-op rather than an
 * error. And a game that crashes because a phone would not give it a speaker is
 * worse than a silent one, so every path through here swallows its failures.
 */
export class AudioEngine {
  private readonly createContext: AudioContextFactory;
  private readonly masterGain: number;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled: boolean;
  private failed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.createContext = options.createContext ?? defaultFactory;
    this.masterGain = options.masterGain ?? 0.34;
    this.enabled = options.enabled ?? true;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Turn the sound on or off.
   *
   * Turning it off does not tear the context down: the player may turn it back
   * on mid-round, and rebuilding the context needs another gesture.
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setValueAtTime(enabled ? this.masterGain : 0, this.context.currentTime);
    }
  }

  /**
   * Start audio, on the back of something the player just did.
   *
   * Safe to call as often as you like: the context is built once, and a
   * suspended one is resumed.
   */
  public resume(): void {
    const context = this.ensureContext();
    if (context && context.state === 'suspended') {
      void context.resume?.();
    }
  }

  /** True once there is a live audio context — mostly so tests can see it. */
  public isRunning(): boolean {
    return this.context !== null;
  }

  /**
   * Play a sound now.
   *
   * `pitch` multiplies every frequency in it, so one spec covers a family of
   * sounds: a harder landing is the same thud, higher.
   */
  public play(name: SoundName, options: { pitch?: number; gain?: number } = {}): void {
    if (!this.enabled) return;

    const context = this.ensureContext();
    if (!context || !this.master) return;

    try {
      this.render(context, SOUNDS[name], options.pitch ?? 1, options.gain ?? 1);
    } catch {
      // A sound that will not play is never worth interrupting a round for.
      this.failed = true;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.failed) return this.context;

    // The factory itself may throw rather than return null: a browser that has
    // blocked audio can refuse at the constructor. Losing the sound is the cost
    // of that; losing the round is not.
    let context: AudioContext | null = null;
    try {
      context = this.createContext();
    } catch {
      this.failed = true;
      return null;
    }

    if (!context) {
      this.failed = true;
      return null;
    }

    try {
      const master = context.createGain();
      master.gain.setValueAtTime(this.enabled ? this.masterGain : 0, context.currentTime);
      master.connect(context.destination);
      this.context = context;
      this.master = master;
    } catch {
      this.failed = true;
      return null;
    }

    return this.context;
  }

  private render(context: AudioContext, spec: SoundSpec, pitch: number, gainScale: number): void {
    for (const layer of spec.layers) {
      this.renderLayer(context, layer, pitch, gainScale);
    }
  }

  private renderLayer(context: AudioContext, layer: SoundLayer, pitch: number, gainScale: number): void {
    const start = context.currentTime + (layer.delay ?? 0);
    const end = start + layer.duration;

    const envelope = context.createGain();
    const peak = Math.max(0.0001, layer.gain * gainScale);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(layer.attack, layer.duration * 0.5));
    // Exponential, because a linear fade to silence is audible as a click at
    // the end and an exponential one is how a struck thing actually decays.
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    let source: AudioScheduledSourceNode;

    if (layer.kind === 'tone') {
      const oscillator = context.createOscillator();
      oscillator.type = layer.wave ?? 'sine';
      oscillator.frequency.setValueAtTime(layer.startHz * pitch, start);
      if (layer.endHz !== undefined && layer.endHz !== layer.startHz) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endHz * pitch), end);
      }
      source = oscillator;
    } else {
      const buffer = context.createBufferSource();
      buffer.buffer = this.noiseBuffer(context);
      buffer.loop = true;
      source = buffer;
    }

    let tail: AudioNode = envelope;

    if (layer.filter) {
      const filter = context.createBiquadFilter();
      filter.type = layer.filter.type;
      filter.frequency.setValueAtTime(layer.filter.hz * pitch, start);
      if (layer.filter.endHz !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(1, layer.filter.endHz * pitch), end);
      }
      if (layer.filter.q !== undefined) filter.Q.setValueAtTime(layer.filter.q, start);

      source.connect(filter);
      filter.connect(envelope);
      tail = envelope;
    } else {
      source.connect(envelope);
    }

    tail.connect(this.master as GainNode);
    source.start(start);
    source.stop(end);
  }

  /**
   * One second of white noise, made once and looped.
   *
   * Every hiss, splash and thud in the game is this buffer through a different
   * filter, so generating it per sound would be a hundred thousand random
   * numbers for every bounce.
   */
  private noiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;

    const frames = Math.floor(context.sampleRate);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    this.noise = buffer;
    return buffer;
  }
}
