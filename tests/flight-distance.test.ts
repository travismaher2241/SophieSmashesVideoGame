import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameHUD } from '../src/ui/GameHUD';

/**
 * A DOM stand-in that remembers elements by selector and keeps a real class
 * list, so a test can watch one readout across a whole shot.
 */
function installMockDocument() {
  const byId: Record<string, any> = {};
  const bySelector: Record<string, any> = {};

  const makeElement = () => {
    const classes = new Set<string>();
    const element: any = {
      id: '',
      style: {} as Record<string, string>,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name)
      },
      innerHTML: '',
      textContent: '',
      setAttribute: () => {},
      appendChild: () => {},
      addEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: (selector: string) => {
        bySelector[selector] ??= makeElement();
        return bySelector[selector];
      }
    };
    return element;
  };

  (globalThis as any).document = {
    createElement: () => makeElement(),
    body: {
      appendChild: (element: any) => {
        if (element.id) byId[element.id] = element;
      }
    },
    getElementById: (id: string) => byId[id]
  };

  return {
    select: (selector: string) => bySelector[selector],
    restore: () => delete (globalThis as any).document
  };
}

describe('the distance readout while the ball is in the air', () => {
  let dom: ReturnType<typeof installMockDocument>;
  let hud: GameHUD;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = installMockDocument();
    hud = new GameHUD({});
  });

  afterEach(() => {
    dom.restore();
    vi.useRealTimers();
  });

  const readout = () => dom.select('#hud-flight');
  const value = () => dom.select('#hud-flight-value').textContent;
  const detail = () => dom.select('#hud-flight-detail').textContent;

  it('stays out of the way until a shot is on its way', () => {
    expect(readout().classList.contains('is-visible')).toBe(false);
  });

  it('counts the distance up as the ball flies', () => {
    hud.updateFlightDistance(42.4, null);
    expect(readout().classList.contains('is-visible')).toBe(true);
    expect(value()).toBe('42');

    hud.updateFlightDistance(186.7, null);
    expect(value()).toBe('187');
  });

  it('says CARRY without a number while the ball is still up', () => {
    // Until it pitches, the distance on screen IS the carry.
    hud.updateFlightDistance(150, null);
    expect(detail()).toBe('CARRY');
  });

  it('holds the carry beside the running total once the ball lands', () => {
    hud.updateFlightDistance(228.3, 228.3);
    expect(detail()).toBe('CARRY 228 m');

    // The big number keeps going with the roll; the carry does not move.
    hud.updateFlightDistance(247.9, 228.3);
    expect(value()).toBe('248');
    expect(detail()).toBe('CARRY 228 m');
  });

  it('leaves the finished number up for a few seconds, then clears it', () => {
    hud.updateFlightDistance(247, 228);
    hud.settleFlightDistance(3);

    vi.advanceTimersByTime(2000);
    expect(readout().classList.contains('is-visible')).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(readout().classList.contains('is-visible')).toBe(false);
  });

  it('keeps the readout up if another shot starts before it has cleared', () => {
    hud.updateFlightDistance(247, 228);
    hud.settleFlightDistance(3);

    // Struck again straight away: the pending clear must not take the new shot
    // off the screen with it.
    hud.updateFlightDistance(12, null);
    vi.advanceTimersByTime(5000);

    expect(readout().classList.contains('is-visible')).toBe(true);
    expect(value()).toBe('12');
  });

  it('clears immediately when the hole starts over', () => {
    hud.updateFlightDistance(247, 228);
    hud.hideFlightDistance();

    expect(readout().classList.contains('is-visible')).toBe(false);
  });

  it('does nothing on settle when there is nothing showing', () => {
    expect(() => hud.settleFlightDistance()).not.toThrow();
    expect(readout().classList.contains('is-visible')).toBe(false);
  });
});
