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
 * Below this, the card cannot sit beside the flyby without covering it.
 *
 * A phone held upright is about 390 CSS pixels across and a card wide enough to
 * read a hole off is 300 of them: there is no "beside". On a screen this narrow
 * the flyby becomes the preview and the map moves behind a button.
 */
const COMPACT_WIDTH = 760;
/** And a landscape phone has the same problem the other way up. */
const COMPACT_HEIGHT = 560;

export interface PreviewLayout {
  /** True when the card has to share the screen with the flyby rather than sit beside it. */
  compact: boolean;
  /** Whether the map is drawn straight away, or waits behind the MAP button. */
  mapShown: boolean;
}

/**
 * How to lay the preview out on this screen.
 *
 * The rule the phone taught us: a card wide enough to read a hole off is most
 * of a phone's width, so on a narrow screen the map covered the flyby it was
 * captioning and the player saw a drawing of the hole instead of the hole. The
 * map therefore starts hidden there — unless the map is the whole reason the
 * card is open, which is the case when it was summoned from the HUD mid-hole
 * and there is no flyby to cover.
 */
export function previewLayoutFor(
  viewport: { width: number; height: number },
  withFlyby: boolean
): PreviewLayout {
  const compact = viewport.width < COMPACT_WIDTH || viewport.height < COMPACT_HEIGHT;
  return { compact, mapShown: !compact || !withFlyby };
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
  private readonly mapWrap: HTMLElement;
  private readonly titleElem: HTMLElement;
  private readonly factsElem: HTMLElement;
  private readonly progressElem: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly mapButton: HTMLButtonElement;
  private readonly offButton: HTMLButtonElement;
  private readonly hintElem: HTMLElement;
  private info: HolePreviewInfo | null = null;
  private mapShown = true;

  constructor(callbacks: HolePreviewCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'sophie-hole-preview';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Hole preview');
    this.container.innerHTML = `
      <div class="preview-card" id="preview-card">
        <div class="preview-head">
          <div class="preview-title" id="preview-title"></div>
          <div class="preview-facts" id="preview-facts"></div>
        </div>
        <div class="preview-mapwrap" id="preview-mapwrap">
          <canvas id="preview-map" width="300" height="420"></canvas>
        </div>
        <div class="preview-foot">
          <div class="preview-progress"><span id="preview-progress-bar"></span></div>
          <div class="preview-actions">
            <button id="preview-play" class="preview-primary">PLAY HOLE ▶</button>
            <button id="preview-mapbtn" class="preview-secondary">MAP</button>
            <button id="preview-off" class="preview-secondary">SKIP PREVIEWS</button>
          </div>
          <div class="preview-hint" id="preview-hint">SPACE or click to play</div>
        </div>
      </div>
      <style>
        #sophie-hole-preview {
          position: absolute; inset: 0; display: none; align-items: center;
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

        /* A wide screen has room for the map and the flyby at once, so the map
           is always up and the button that toggles it is pointless. */
        #preview-mapbtn { display: none; }
        .preview-mapwrap.is-hidden { display: none; }

        /* --- Narrow screens -------------------------------------------------
           The card used to fill a phone end to end, which left the flyby
           playing entirely behind it: the preview showed you a drawing of the
           hole and hid the hole. Here the card becomes two small panels at the
           top and bottom of an otherwise clear screen, and the map goes behind
           the MAP button. */
        #sophie-hole-preview.is-compact {
          padding: 0; align-items: stretch; justify-content: stretch;
          background: linear-gradient(180deg, rgba(2, 10, 6, 0.55) 0%, rgba(2, 10, 6, 0) 22%,
                                       rgba(2, 10, 6, 0) 68%, rgba(2, 10, 6, 0.6) 100%);
        }
        .is-compact .preview-card {
          width: 100%; min-width: 0; max-width: none; max-height: none;
          display: flex; flex-direction: column; justify-content: space-between;
          padding: 10px; overflow: hidden;
          border: 0; border-radius: 0; background: none; box-shadow: none;
        }
        .is-compact .preview-head, .is-compact .preview-foot {
          border: 2px solid #f5d94f; border-radius: 8px; padding: 8px 10px;
          background: rgba(4, 16, 10, 0.88);
        }
        .is-compact .preview-title { font-size: 14px; letter-spacing: 1px; }
        .is-compact .preview-facts { font-size: 10px; letter-spacing: 0; }
        .is-compact .preview-mapwrap {
          flex: 1; display: flex; align-items: center; justify-content: center;
          min-height: 0; margin: 8px 0; pointer-events: none;
        }
        .is-compact #preview-map {
          margin: 0; max-height: 100%; max-width: 100%;
          background: rgba(4, 16, 10, 0.92); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
        }
        .is-compact #preview-mapbtn { display: block; }
        .is-compact .preview-hint { display: none; }
        /* Last word on the subject: the compact rule above sets display on the
           same element, and a hidden map that still takes its space is the bug
           this whole layout exists to fix. */
        .preview-mapwrap.is-hidden, .is-compact .preview-mapwrap.is-hidden { display: none; }
      </style>
    `;

    this.canvas = this.container.querySelector('#preview-map') as HTMLCanvasElement;
    this.mapWrap = this.container.querySelector('#preview-mapwrap') as HTMLElement;
    this.titleElem = this.container.querySelector('#preview-title') as HTMLElement;
    this.factsElem = this.container.querySelector('#preview-facts') as HTMLElement;
    this.progressElem = this.container.querySelector('#preview-progress-bar') as HTMLElement;
    this.playButton = this.container.querySelector('#preview-play') as HTMLButtonElement;
    this.mapButton = this.container.querySelector('#preview-mapbtn') as HTMLButtonElement;
    this.offButton = this.container.querySelector('#preview-off') as HTMLButtonElement;
    this.hintElem = this.container.querySelector('#preview-hint') as HTMLElement;

    this.playButton.addEventListener('click', () => callbacks.onPlay());
    this.offButton.addEventListener('click', () => callbacks.onTurnOff());
    this.mapButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setMapShown(!this.mapShown);
    });

    // A tap on the course rather than on a control means "get on with it". On a
    // wide screen that is the darkened area beside the card; on a phone the
    // card is the whole screen, so it is anywhere that is not a button.
    this.container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button')) return;
      if (!this.isCompact() && target !== this.container) return;
      callbacks.onPlay();
    });

    document.body.appendChild(this.container);
  }

  /**
   * Put the hole up.
   *
   * `withFlyby` false is the same card opened mid-hole from the HUD: no camera
   * move to wait for, so no progress bar, no offer to turn previews off, and
   * the map is up whatever the screen size, since the map is the whole reason
   * that button was pressed.
   */
  public show(info: HolePreviewInfo, withFlyby = true): void {
    this.info = info;

    const climb = Math.round(info.climbMetres);
    const slope = Math.abs(climb) < 3 ? 'FLAT' : climb > 0 ? `${climb}m UPHILL` : `${-climb}m DOWNHILL`;

    this.titleElem.textContent = `HOLE ${info.holeNumber} · ${info.holeName.toUpperCase()}`;
    this.factsElem.textContent =
      `PAR ${info.par} · ${Math.round(info.lengthMetres)}m · ` +
      `${info.teeName.replace(' TEE', '')} TEE · ${info.pinName} PIN · ${slope}`;

    const layout = previewLayoutFor({ width: window.innerWidth, height: window.innerHeight }, withFlyby);
    this.container.classList.toggle('is-compact', layout.compact);

    this.progressElem.style.width = '0%';
    (this.progressElem.parentElement as HTMLElement).style.display = withFlyby ? 'block' : 'none';
    this.offButton.style.display = withFlyby ? 'block' : 'none';
    this.playButton.textContent = withFlyby ? 'PLAY HOLE ▶' : 'CLOSE';
    this.hintElem.textContent = withFlyby ? 'SPACE or click to play' : 'SPACE or click to close';

    this.container.style.display = 'flex';
    // On a phone the flyby is the preview and the map is the second opinion.
    this.setMapShown(layout.mapShown);
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

  /** True while the screen is too narrow to show the card beside the flyby. */
  private isCompact(): boolean {
    return previewLayoutFor({ width: window.innerWidth, height: window.innerHeight }, true).compact;
  }

  private setMapShown(shown: boolean): void {
    this.mapShown = shown;
    this.mapWrap.classList.toggle('is-hidden', !shown);
    this.mapButton.textContent = shown ? 'HIDE MAP' : 'MAP';
    if (shown) this.redraw();
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
