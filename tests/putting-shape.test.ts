import { describe, expect, it } from 'vitest';
import { GameHUD } from '../src/ui/GameHUD';

/**
 * A DOM stand-in that hands back the same element for the same selector, so a
 * test can watch one control across a change of shot mode.
 */
function installMockDocument() {
  const byId: Record<string, any> = {};
  const bySelector: Record<string, any> = {};

  const makeElement = () => {
    const element: any = {
      id: '',
      style: {} as Record<string, string>,
      classList: { add: () => {}, remove: () => {} },
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

  const document = {
    createElement: () => makeElement(),
    body: {
      appendChild: (element: any) => {
        if (element.id) byId[element.id] = element;
      }
    },
    getElementById: (id: string) => byId[id]
  };

  (globalThis as any).document = document;

  return {
    select: (selector: string) => bySelector[selector],
    restore: () => delete (globalThis as any).document
  };
}

describe('shot shape on the green', () => {
  it('takes the shape control away when putting and brings it back for a full shot', () => {
    const dom = installMockDocument();

    try {
      const hud = new GameHUD({});

      hud.setShotMode('FULL_SWING');
      expect(dom.select('#hud-shape-capsule').style.display).toBe('flex');

      // You cannot draw or fade a putt: the ball rolls from the moment it is
      // struck. Leaving a DRAW sitting in the HUD on the green offered a choice
      // that did nothing.
      hud.setShotMode('PUTTING');
      expect(dom.select('#hud-shape-capsule').style.display).toBe('none');

      hud.setShotMode('FULL_SWING');
      expect(dom.select('#hud-shape-capsule').style.display).toBe('flex');
    } finally {
      dom.restore();
    }
  });

  it('keeps the bag reachable while putting, and hides it only where the club is fixed', () => {
    // These used to be one switch, and that was the bug: choosing a putter off
    // the green put the HUD into putting, putting hid the club selector, and the
    // way back to a real club went with it. The mode says which stroke is being
    // played; the lie says whether there is a club to choose.
    const dom = installMockDocument();

    try {
      const hud = new GameHUD({});

      hud.setShotMode('PUTTING');
      hud.setClubSelectorVisible(true);
      expect(dom.select('#hud-club-capsule').style.display).toBe('flex');
      expect(dom.select('#hud-shape-capsule').style.display).toBe('none');

      // On the putting surface itself there is no choice to make.
      hud.setClubSelectorVisible(false);
      expect(dom.select('#hud-club-capsule').style.display).toBe('none');
    } finally {
      dom.restore();
    }
  });
});
