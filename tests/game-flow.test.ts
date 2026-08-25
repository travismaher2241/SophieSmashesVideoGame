import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HoleConfig, HoleData } from '../src/course/HoleData';
import { GameStateManager } from '../src/game/GameState';
import { summarizeRoundScore } from '../src/game/RoundScore';

describe('playable game flow', () => {
  it('begins at the title screen', () => {
    expect(new GameStateManager().getState()).toBe('TITLE');
  });

  it.each([
    [2, 4, '-2', 'EAGLE'],
    [3, 4, '-1', 'BIRDIE'],
    [4, 4, 'E', 'PAR'],
    [5, 4, '+1', 'BOGEY'],
    [6, 4, '+2', 'DOUBLE BOGEY']
  ])('scores %i strokes on par %i as %s %s', (strokes, par, relative, name) => {
    const summary = summarizeRoundScore(strokes, 0, par);
    expect(summary.relativeLabel).toBe(relative);
    expect(summary.resultName).toBe(name);
  });

  it('includes penalties in the final total without losing the penalty breakdown', () => {
    const summary = summarizeRoundScore(6, 2, 4);
    expect(summary.totalStrokes).toBe(6);
    expect(summary.penaltyStrokes).toBe(2);
    expect(summary.relativeLabel).toBe('+2');
  });
});

describe('Sophie Hills fictional hole data', () => {
  const holePath = new URL('../public/courses/sophie-hills/hole-01/hole.json', import.meta.url);
  const hole = JSON.parse(readFileSync(holePath, 'utf8')) as HoleConfig;
  const secondHolePath = new URL('../public/courses/sophie-hills/hole-02/hole.json', import.meta.url);
  const secondHole = JSON.parse(readFileSync(secondHolePath, 'utf8')) as HoleConfig;

  it('is clearly identified as fictional rather than Warragul', () => {
    expect(hole.courseId).toBe('sophie-hills');
    expect(hole.status).toBe('fictional-gameplay-course');
    expect(hole.notes?.join(' ')).toMatch(/fictional/i);
    expect(hole.notes?.join(' ')).toMatch(/never be presented as Warragul/i);
  });

  it('has fixed tee, cup and valid authored surfaces', () => {
    expect(hole.tee).not.toBeNull();
    expect(hole.greenCentre).not.toBeNull();
    expect(hole.surfaces.length).toBeGreaterThanOrEqual(7);
    expect(() => HoleData.validateSurfaces(hole.surfaces, hole, holePath.pathname)).not.toThrow();
    expect(secondHole.tee).not.toBeNull();
    expect(secondHole.greenCentre).not.toBeNull();
    expect(secondHole.surfaces.length).toBeGreaterThanOrEqual(7);
    expect(() => HoleData.validateSurfaces(
      secondHole.surfaces,
      secondHole,
      secondHolePath.pathname
    )).not.toThrow();
  });

  it('ships a two-hole par-7 fictional preview', () => {
    expect([hole.holeNumber, secondHole.holeNumber]).toEqual([1, 2]);
    expect(hole.par + secondHole.par).toBe(7);
    expect(secondHole.status).toBe('fictional-gameplay-course');
    expect(secondHole.notes?.join(' ')).toMatch(/never be presented as Warragul/i);
  });

  it('keeps every gameplay coordinate inside the installed terrain extent', () => {
    const points = [
      { x: hole.tee!.x, z: hole.tee!.z },
      { x: hole.greenCentre!.x, z: hole.greenCentre!.z },
      ...hole.surfaces.flatMap((surface) => surface.points),
      { x: secondHole.tee!.x, z: secondHole.tee!.z },
      { x: secondHole.greenCentre!.x, z: secondHole.greenCentre!.z },
      ...secondHole.surfaces.flatMap((surface) => surface.points)
    ];

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(778);
      expect(point.z).toBeGreaterThanOrEqual(0);
      expect(point.z).toBeLessThanOrEqual(318);
    }
  });
});

describe('Sophie Hills terrain & course separation', () => {
  const terrainMetaPath = new URL('../public/courses/sophie-hills/terrain_meta.json', import.meta.url);
  const terrainMeta = JSON.parse(readFileSync(terrainMetaPath, 'utf8'));
  const terrainBinPath = new URL('../public/courses/sophie-hills/terrain.bin', import.meta.url);
  const terrainBinBuffer = readFileSync(terrainBinPath);

  it('has valid metadata conforming to TerrainLoader schema', async () => {
    const { TerrainLoader } = await import('../src/course/TerrainLoader');
    expect(() => TerrainLoader.validateMetadata(terrainMeta)).not.toThrow();
    expect(terrainMeta.courseId).toBe('sophie-hills');
    expect(terrainMeta.status).toBe('fictional-gameplay-terrain');
  });

  it('has exact binary DEM matching expected sample count and byte length', () => {
    expect(terrainBinBuffer.byteLength).toBe(terrainMeta.binary.expectedBytes);
    expect(terrainBinBuffer.byteLength).toBe(390 * 160 * 4);

    const view = new DataView(terrainBinBuffer.buffer, terrainBinBuffer.byteOffset, terrainBinBuffer.byteLength);
    for (let i = 0; i < 390 * 160; i++) {
      const val = view.getFloat32(i * 4, true);
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it('ensures Sophie Hills default config contains no Warragul paths', async () => {
    const { SOPHIE_HILLS_CONFIG, WARRAGUL_RESEARCH_CONFIG } = await import('../src/game/Game');
    expect(SOPHIE_HILLS_CONFIG.terrainPath).not.toMatch(/warragul/i);
    expect(SOPHIE_HILLS_CONFIG.terrainPath).toBe('/courses/sophie-hills');
    for (const hole of SOPHIE_HILLS_CONFIG.holes) {
      expect(hole.holePath).not.toMatch(/warragul/i);
      expect(hole.holePath).toMatch(/^\/courses\/sophie-hills\//);
    }

    // Warragul config remains isolated in research mode
    expect(WARRAGUL_RESEARCH_CONFIG.isResearchMode).toBe(true);
    expect(WARRAGUL_RESEARCH_CONFIG.terrainPath).toMatch(/warragul/i);
  });
});

