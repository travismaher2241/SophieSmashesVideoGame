import { Game } from './game/Game';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #render-canvas not found!');
    return;
  }

  const game = new Game(canvas);
  game.start('/courses/warragul/hole-06');
});
