import { Game, GameSource } from './game/Game';

export const SOPHIE_HILLS_CONFIG: GameSource = {
  terrainPath: '/courses/sophie-hills',
  courseName: 'Sophie Hills',
  courseSubtitle: 'Front Nine',
  totalPar: 35,
  holes: [
    { holePath: '/courses/sophie-hills/hole-01', holeName: 'Sunset Run' },
    { holePath: '/courses/sophie-hills/hole-02', holeName: 'Creekside Carry' },
    { holePath: '/courses/sophie-hills/hole-03', holeName: 'Wattle Bend' },
    { holePath: '/courses/sophie-hills/hole-04', holeName: 'Long Paddock' },
    { holePath: '/courses/sophie-hills/hole-05', holeName: 'Gumtree Rise' },
    { holePath: '/courses/sophie-hills/hole-06', holeName: 'Billabong' },
    { holePath: '/courses/sophie-hills/hole-07', holeName: 'Ridge Runner' },
    { holePath: '/courses/sophie-hills/hole-08', holeName: 'Sandbelt Turn' },
    { holePath: '/courses/sophie-hills/hole-09', holeName: 'Homeward Bound' }
  ]
};

export const WARRAGUL_RESEARCH_CONFIG: GameSource = {
  terrainPath: '/courses/warragul/hole-06',
  courseName: 'Warragul Country Club (Research Mode)',
  courseSubtitle: 'Hole 6 Alignment & GIS Study',
  totalPar: 4,
  holes: [
    { holePath: '/courses/warragul/hole-06', holeName: 'Hole 6 (Provisional)' }
  ],
  isResearchMode: true
};

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #render-canvas not found!');
    return;
  }

  const game = new Game(canvas);
  (window as any).__SOPHIE_GOLF_GAME__ = game;
  game.start(SOPHIE_HILLS_CONFIG);
});
