import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SOPHIE_HILLS_CONFIG } from '../src/game/Game';

describe('Sophie Hills front nine', () => {
  it('provides nine distinct holes totalling par 35', () => {
    expect(SOPHIE_HILLS_CONFIG.holes).toHaveLength(9);
    expect(SOPHIE_HILLS_CONFIG.totalPar).toBe(35);
    expect(new Set(SOPHIE_HILLS_CONFIG.holes.map(hole => hole.holeName)).size).toBe(9);
  });

  it('keeps every playable layout within the Sophie Hills terrain', () => {
    let parTotal = 0;
    for (let index = 1; index <= 9; index++) {
      const id = String(index).padStart(2, '0');
      const path = resolve(process.cwd(), `public/courses/sophie-hills/hole-${id}/hole.json`);
      const hole = JSON.parse(readFileSync(path, 'utf8'));
      parTotal += hole.par;
      expect(hole.holeNumber).toBe(index);
      expect(hole.tee.x).toBeGreaterThanOrEqual(0);
      expect(hole.tee.x).toBeLessThanOrEqual(778);
      expect(hole.greenCentre.x).toBeGreaterThanOrEqual(0);
      expect(hole.greenCentre.x).toBeLessThanOrEqual(778);
      expect(hole.tee.z).toBeGreaterThanOrEqual(0);
      expect(hole.tee.z).toBeLessThanOrEqual(318);
      expect(hole.greenCentre.z).toBeGreaterThanOrEqual(0);
      expect(hole.greenCentre.z).toBeLessThanOrEqual(318);
      expect(hole.surfaces.length).toBeGreaterThanOrEqual(5);
    }
    expect(parTotal).toBe(35);
  });
});
