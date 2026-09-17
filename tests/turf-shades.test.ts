import { describe, expect, it } from 'vitest';
import { RetroMaterials } from '../src/rendering/RetroMaterials';
import { SURFACE_PROPERTIES } from '../src/course/SurfaceQuery';

/**
 * Perceived brightness of a material's base colour, 0 to 255.
 *
 * Read from the hex the colour was authored as rather than from the Color's own
 * channels, which three.js keeps in linear space — dark shades compress there,
 * so a linear comparison says a colour is far darker than it looks.
 */
function brightness(type: Parameters<RetroMaterials['getMaterial']>[0]): number {
  const hex = RetroMaterials.getInstance().getMaterial(type).color.getHexString();
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('the cuts of grass, darkest to lightest', () => {
  it('gets darker every step away from the fairway', () => {
    // The ladder is the whole point: a player should be able to see what they
    // are in without reading the lie box. Deep rough shared the rough's material
    // exactly, so the worst grass on the course looked like ordinary rough.
    const ladder = ['GREEN', 'FAIRWAY', 'FIRST_CUT', 'ROUGH', 'DEEP_ROUGH'] as const;

    for (let i = 1; i < ladder.length; i++) {
      expect(
        brightness(ladder[i]),
        `${ladder[i]} should be darker than ${ladder[i - 1]}`
      ).toBeLessThan(brightness(ladder[i - 1]));
    }
  });

  it('gives deep rough a material of its own', () => {
    const rough = RetroMaterials.getInstance().getMaterial('ROUGH');
    const deep = RetroMaterials.getInstance().getMaterial('DEEP_ROUGH');

    expect(deep).not.toBe(rough);
  });

  it('keeps the darker grass to the grass that actually plays worse', () => {
    // The look should follow the rules, not the other way round: deep rough
    // costs more distance and more control than rough, and is drawn darker.
    expect(SURFACE_PROPERTIES.DEEP_ROUGH.distanceMultiplier)
      .toBeLessThan(SURFACE_PROPERTIES.ROUGH.distanceMultiplier);
    expect(SURFACE_PROPERTIES.DEEP_ROUGH.controlMultiplier)
      .toBeLessThan(SURFACE_PROPERTIES.ROUGH.controlMultiplier);
  });

  it('does not take the rough back into the dark to get there', () => {
    // Deep rough has to read as grass too. Below about a third of the fairway
    // it stops looking like turf and starts looking like a hole in the world,
    // which is what the rough itself used to look like.
    expect(brightness('DEEP_ROUGH')).toBeGreaterThan(brightness('FAIRWAY') * 0.33);
  });
});
