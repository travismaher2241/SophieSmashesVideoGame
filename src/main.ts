import { Game } from './game/Game';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #render-canvas not found!');
    return;
  }

  const game = new Game(canvas);
  game.start({
    terrainPath: '/courses/warragul/hole-06',
    courseName: 'Sophie Hills',
    courseSubtitle: 'Two-Hole Preview',
    totalPar: 7,
    holes: [
      { holePath: '/courses/sophie-hills/hole-01', holeName: 'Sunset Run' },
      { holePath: '/courses/sophie-hills/hole-02', holeName: 'Creekside Carry' }
    ]
  });
});
