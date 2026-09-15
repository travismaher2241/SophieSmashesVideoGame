import { Game, SOPHIE_HILLS_CONFIG, WARRAGUL_RESEARCH_CONFIG } from './game/Game';

// Re-exported so existing importers of these configs keep working. The definitions
// live in Game.ts; duplicating them here meant a hole could be renamed in one copy
// and not the other.
export { SOPHIE_HILLS_CONFIG, WARRAGUL_RESEARCH_CONFIG };
export type { GameSource } from './game/Game';

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
