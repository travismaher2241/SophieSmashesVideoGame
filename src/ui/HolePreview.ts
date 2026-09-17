import { SurfacePolygon } from '../course/SurfaceQuery';
import { buildHoleMapView, distanceMarkers, drawHoleMap, MapPoint } from './HoleMap';

export interface HolePreviewInfo {
  holeNumber: number;
  holeName: string;
  par: number;
  /** Playing length from the tee in use, in metres. */
  lengthMetres: number;
  teeName: string;
  pinName: string;
  surfaces: readonly SurfacePolygon[];
  trees?: readonly MapPoint[];
  tee: MapPoint;
  pin: MapPoint;
  drivingLine?: MapPoint | null;
  /** Rise from tee to green in metres; negative runs downhill. */
  climbMetres: number;
}

export interface HolePreviewCallbacks {
  /** Play the hole: dismiss the preview and hand the camera back. */
  onPlay: () => void;
  /** Stop showing the preview before every tee shot. */
  onTurnOff: () => void;
}

/**
 * The card a player sees before the tee shot: the hole drawn from above, with
 * the flyby running behind it.
 *
 * A golfer walking onto a tee has already seen the hole — from the last green,
 * from the card, from the last time they played it. A player who has only the
 * address view has to discover a dogleg by hitting a driver into the trees on
 * the corner. This is the part of the round the screen was leaving out.
 */
export class HolePreview {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly titleElem: HTMLElement;
  private readonly factsElem: HTMLElement;
  private readonly progressElem: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly offButton: HTMLButtonElement;
  private readonly hintElem: HTMLElement;
  private info: HolePreviewInfo | null = null;

  constructor(callbacks: HolePreviewCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'sophie-hole-preview';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Hole preview');
    this.container.innerHTML = `
      <div class="preview-card">
        <div class="preview-title" id="preview-title"></div>
        <div class="preview-facts" id="preview-facts"></div>
        <canvas id="preview-map" width="300" height="420"></canvas>
        <div class="preview-progress"><span id="preview-progress-bar"></span></div>
        <div class="preview-actions">
          <button id="preview-play" class="preview-primary">PLAY HOLE ▶</button>
          <button id="preview-off" class="preview-secondary">SKIP PREVIEWS</button>
        </div>
        <div class="preview-hint" id="preview-hint">SPACE or click to play</div>
      </div>
      <style>
        #sophie-hole-preview {
          position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
          padding: 12px 12px 12px 26px; justify-content: flex-start; z-index: 115;
          /* Weighted to the side the card is on, so the flyby it is describing
             stays visible instead of being covered by its own description. */
          background: linear-gradient(90deg, rgba(2, 10, 6, 0.86) 0%, rgba(2, 10, 6, 0.55) 42%, rgba(2, 10, 6, 0.1) 100%);
          font-family: 'Courier New', monospace;
        }
        .preview-card {
          width: fit-content; min-width: min(280px, calc(100vw - 36px)); max-width: min(440px, calc(100vw - 36px));
          max-height: calc(100vh - 24px);
          overflow: auto;
          padding: 14px 16px 12px;
          border: 3px solid #f5d94f; border-radius: 10px;
          background: linear-gradient(180deg, rgba(8, 30, 17, 0.97), rgba(4, 16, 10, 0.98));
          box-shadow: 0 0 0 4px #173b22, 0 14px 40px rgba(0, 0, 0, 0.7);
          color: #e8ffe8; text-align: center;
        }
        .preview-title { color: #fff6a0; font-size: 17px; font-weight: bold; letter-spacing: 2px; }
        .preview-facts { margin-top: 3px; color: #9bd6aa; font-size: 11px; letter-spacing: 1px; }
        #preview-map {
          width: auto; max-width: 100%; height: auto; max-height: 56vh; margin-top: 10px;
          border: 2px solid #3f7d52; border-radius: 6px; image-rendering: pixelated;
        }
        .preview-progress { height: 4px; margin-top: 8px; background: #12301b; border-radius: 2px; overflow: hidden; }
        .preview-progress span { display: block; height: 100%; width: 0%; background: #f5d94f; }
        .preview-actions { display: flex; gap: 8px; margin-top: 10px; }
        .preview-primary {
          flex: 2; padding: 11px; border: 3px solid #b4ff9a; border-radius: 6px;
          background: #269b3c; color: #fff; cursor: pointer;
          font: bold 14px 'Courier New', monospace; letter-spacing: 2px; box-shadow: 0 4px 0 #0b4c1a;
        }
        .preview-primary:active { transform: translateY(2px); box-shadow: 0 2px 0 #0b4c1a; }
        .preview-secondary {
          flex: 1; padding: 11px 4px; border: 2px solid #3f7d52; border-radius: 6px;
          background: #0b2413; color: #9bd6aa; cursor: pointer;
          font: bold 10px 'Courier New', monospace; letter-spacing: 1px;
        }
        .preview-secondary:hover { border-color: #6fc084; color: #eafff0; }
        .preview-hint { margin-top: 8px; color: #7fae8c; font-size: 10px; letter-spacing: 1px; }
        @media (max-height: 620px) {
          #preview-map { max-height: 42vh; }
          .preview-hint { display: none; }
        }
        @media (max-width: 760px) {
          /* No room beside the card on a phone, so it takes the middle back. */
          #sophie-hole-preview {
            padding: 12px; justify-content: center;
            background: radial-gradient(circle at 50% 45%, rgba(8, 36, 18, 0.6), rgba(2, 10, 6, 0.88));
          }
        }
      </style>
    `;

    this.canvas = this.container.querySelector('#preview-map') as HTMLCanvasElement;
    this.titleElem = this.container.querySelector('#preview-title') as HTMLElement;
    this.factsElem = this.container.querySelector('#preview-facts') as HTMLElement;
    this.progressElem = this.container.querySelector('#preview-progress-bar') as HTMLElement;
    this.playButton = this.container.querySelector('#preview-play') as HTMLButtonElement;
    this.offButton = this.container.querySelector('#preview-off') as HTMLButtonElement;
    this.hintElem = this.container.querySelector('#preview-hint') as HTMLElement;

    this.playButton.addEventListener('click', () => callbacks.onPlay());
    // The card covers the canvas, so a click meant for the course lands here.
    // Anywhere off the card plays the hole, which is what that click meant.
    this.container.addEventListener('click', (event) => {
      if (event.target === this.container) callbacks.onPlay();
    });
    this.offButton.addEventListener('click', () => callbacks.onTurnOff());

    document.body.appendChild(this.container);
  }

  /**
   * Put the hole up.
   *
   * `withFlyby` false is the same card opened mid-hole from the HUD: no camera
   * move to wait for, so no progress bar and no offer to turn previews off.
   */
  public show(info: HolePreviewInfo, withFlyby = true): void {
    this.info = info;

    const climb = Math.round(info.climbMetres);
    const slope = Math.abs(climb) < 3 ? 'FLAT' : climb > 0 ? `${climb}m UPHILL` : `${-climb}m DOWNHILL`;

    this.titleElem.textContent = `HOLE ${info.holeNumber} · ${info.holeName.toUpperCase()}`;
    this.factsElem.textContent =
      `PAR ${info.par} · ${Math.round(info.lengthMetres)}m · ` +
      `${info.teeName.replace(' TEE', '')} TEE · ${info.pinName} PIN · ${slope}`;

    this.progressElem.style.width = '0%';
    (this.progressElem.parentElement as HTMLElement).style.display = withFlyby ? 'block' : 'none';
    this.offButton.style.display = withFlyby ? 'block' : 'none';
    this.playButton.textContent = withFlyby ? 'PLAY HOLE ▶' : 'CLOSE';
    this.hintElem.textContent = withFlyby ? 'SPACE or click to play' : 'SPACE or click to close';

    this.container.style.display = 'flex';
    this.redraw();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.container.style.display === 'flex';
  }

  /** Move the bar along with the camera. */
  public setFlybyProgress(fraction: number): void {
    this.progressElem.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  }

  private redraw(): void {
    const info = this.info;
    const ctx = this.canvas.getContext('2d');
    if (!info || !ctx) return;

    // Fit the canvas to the hole before drawing it. A hole is four times as
    // long as it is wide, so a fixed square of canvas is mostly margin — and
    // the margin is what pushes the map down to a thumbnail.
    const measured = buildHoleMapView({
      surfaces: info.surfaces,
      trees: info.trees,
      tee: info.tee,
      pin: info.pin,
      width: this.canvas.height,
      height: this.canvas.height
    });
    this.canvas.width = Math.round(
      Math.max(190, Math.min(420, this.canvas.height * measured.contentAspect + 40))
    );

    const view = drawHoleMap(ctx, {
      surfaces: info.surfaces,
      trees: info.trees,
      tee: info.tee,
      pin: info.pin,
      drivingLine: info.drivingLine,
      width: this.canvas.width,
      height: this.canvas.height
    });

    // Yardages down the playing line: on a dogleg the 200 is 200 to the corner,
    // which is the number the tee shot is actually about.
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const marker of distanceMarkers(info.tee, info.drivingLine, info.pin)) {
      const at = view.project(marker.at);
      ctx.fillStyle = 'rgba(4, 16, 10, 0.75)';
      ctx.fillRect(at.x - 15, at.y - 7, 30, 14);
      ctx.fillStyle = '#fff6a0';
      ctx.fillText(String(marker.metres), at.x, at.y);
    }
  }
}
