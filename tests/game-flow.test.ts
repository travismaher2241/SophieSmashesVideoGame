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
  });

  it('keeps every gameplay coordinate inside the installed terrain extent', () => {
    const points = [
      { x: hole.tee!.x, z: hole.tee!.z },
      { x: hole.greenCentre!.x, z: hole.greenCentre!.z },
      ...hole.surfaces.flatMap((surface) => surface.points)
    ];

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(778);
      expect(point.z).toBeGreaterThanOrEqual(0);
      expect(point.z).toBeLessThanOrEqual(318);
    }
  });
});
