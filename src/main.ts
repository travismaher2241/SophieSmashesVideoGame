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
    holePath: '/courses/sophie-hills/hole-01',
    courseName: 'Sophie Hills',
    holeName: 'Sunset Run'
  });
});
