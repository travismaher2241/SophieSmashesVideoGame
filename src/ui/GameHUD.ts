import { LieInfo } from '../course/SurfaceQuery';
import { summarizeRoundScore } from '../game/RoundScore';
import { ClubConfig } from '../golf/Club';
import { SwingMeter } from '../golf/SwingMeter';

export class GameHUD {
  private container: HTMLElement;
  private swingMeterContainer: HTMLElement;
  private celebrationModal: HTMLElement;
  private penaltyBanner: HTMLElement;
  private penaltyTimeoutId: number | null = null;

  // Callbacks
  private onAimLeft?: () => void;
  private onAimRight?: () => void;
  private onClubNext?: () => void;
  private onClubPrev?: () => void;
  private onSwingTrigger?: () => void;
  private onCameraToggle?: () => void;
  private onResetLayout?: () => void;
  private onDevModeToggle?: () => void;
  private onPlayAgain?: () => void;
  private onReturnToTitle?: () => void;

  // Dynamic elements
  private strokeElem!: HTMLElement;
  private distElem!: HTMLElement;
  private lieElem!: HTMLElement;
  private clubNameElem!: HTMLElement;
  private clubDetailElem!: HTMLElement;
  private cameraBtnElem!: HTMLElement;
  private headerTitleElem!: HTMLElement;
  private headerSubtitleElem!: HTMLElement;
  private menuBtnElem!: HTMLElement;
  private celebrationResultElem!: HTMLElement;
  private celebrationScoreElem!: HTMLElement;
  private celebrationCourseElem!: HTMLElement;

  private meterPowerBar!: HTMLElement;
  private meterAccMarker!: HTMLElement;
  private meterStatusElem!: HTMLElement;

  constructor(callbacks: {
    onAimLeft?: () => void;
    onAimRight?: () => void;
    onClubNext?: () => void;
    onClubPrev?: () => void;
    onSwingTrigger?: () => void;
    onCameraToggle?: () => void;
    onResetLayout?: () => void;
    onDevModeToggle?: () => void;
    onPlayAgain?: () => void;
    onReturnToTitle?: () => void;
  }) {
    this.onAimLeft = callbacks.onAimLeft;
    this.onAimRight = callbacks.onAimRight;
    this.onClubNext = callbacks.onClubNext;
    this.onClubPrev = callbacks.onClubPrev;
    this.onSwingTrigger = callbacks.onSwingTrigger;
    this.onCameraToggle = callbacks.onCameraToggle;
    this.onResetLayout = callbacks.onResetLayout;
    this.onDevModeToggle = callbacks.onDevModeToggle;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onReturnToTitle = callbacks.onReturnToTitle;

    this.container = document.createElement('div');
    this.swingMeterContainer = document.createElement('div');
    this.celebrationModal = document.createElement('div');
    this.penaltyBanner = document.createElement('div');

    this.setupStyles();
    this.buildHTML();
    this.buildSwingMeterHTML();
    this.buildCelebrationModalHTML();

    document.body.appendChild(this.container);
    document.body.appendChild(this.swingMeterContainer);
    document.body.appendChild(this.celebrationModal);
    document.body.appendChild(this.penaltyBanner);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
    this.swingMeterContainer.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.penaltyBanner.style.display = 'none';
    }
  }

  public configureHole(options: {
    courseName: string;
    holeName: string;
    holeNumber: number;
    par: number;
    distanceMetres: number;
    menuLabel: string;
  }): void {
    this.headerTitleElem.textContent = `⛳ SOPHIE GOLF — HOLE ${options.holeNumber}`;
    this.headerSubtitleElem.textContent = `${options.courseName} — ${options.holeName} · PAR ${options.par}`;
    this.menuBtnElem.textContent = options.menuLabel;
    this.celebrationCourseElem.textContent =
      `${options.courseName} — ${options.holeName} · Hole ${options.holeNumber} · Par ${options.par} · ${options.distanceMetres}m`;
  }

  public updateHUD(
    totalStrokes: number,
    penaltyStrokes: number,
    distToCupMetres: number,
    club: ClubConfig,
    lie: LieInfo,
    cameraMode: string
  ): void {
    if (this.strokeElem) {
      this.strokeElem.textContent = penaltyStrokes > 0
        ? `STROKE ${totalStrokes} (+${penaltyStrokes} PEN)`
        : `STROKE ${totalStrokes}`;
    }
    if (this.distElem) {
      this.distElem.textContent = `${distToCupMetres.toFixed(1)} m TO PIN`;
    }
    if (this.lieElem) {
      const pct = Math.round(lie.distanceMultiplier * 100);
      let color = '#55ff55';
      if (lie.type === 'ROUGH' || lie.type === 'DEEP_ROUGH') color = '#ffcc44';
      if (lie.type === 'BUNKER') color = '#ffaa33';
      if (lie.type === 'OUT_OF_BOUNDS' || lie.type === 'WATER') color = '#ff5555';
      this.lieElem.innerHTML = `LIE: <span style="color: ${color}; font-weight: bold;">${lie.name.toUpperCase()} (${pct}%)</span>`;
    }
    if (this.clubNameElem) {
      this.clubNameElem.textContent = `${club.code} - ${club.name}`;
    }
    if (this.clubDetailElem) {
      this.clubDetailElem.textContent = `Max: ${club.maxDistanceMetres}m | Loft: ${club.loftDegrees}°`;
    }
    if (this.cameraBtnElem) {
      this.cameraBtnElem.textContent = `📷 VIEW: ${cameraMode}`;
    }
  }

  public updateSwingMeter(swingMeter: SwingMeter): void {
    const state = swingMeter.getState();
    const power = swingMeter.getPowerValue();
    const acc = swingMeter.getAccuracyValue();

    if (this.meterPowerBar) {
      this.meterPowerBar.style.width = `${Math.min(100, Math.max(0, power * 100))}%`;
    }

    if (this.meterAccMarker) {
      const leftPct = ((acc + 0.5) / 1.5) * 100;
      this.meterAccMarker.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    }

    if (this.meterStatusElem) {
      if (state === 'IDLE') {
        this.meterStatusElem.innerHTML = `<span style="color: #55ff55;">CLICK SWING OR PRESS SPACE (START)</span>`;
      } else if (state === 'POWER_RISING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffff55;">CLICK TO LOCK POWER! (${Math.round(power * 100)}%)</span>`;
      } else if (state === 'ACCURACY_FALLING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffaa33;">CLICK ON GREEN SWEET SPOT!</span>`;
      } else if (state === 'COMPLETE') {
        const res = swingMeter.getResult();
        if (res?.isPerfect) {
          this.meterStatusElem.innerHTML = `<span style="color: #55ffff; font-weight: bold;">🎯 PERFECT SWING!</span>`;
        } else if (res && res.hookSliceAngleDegrees < 0) {
          this.meterStatusElem.innerHTML = `<span style="color: #ff7777;">◀ HOOK / LEFT DEVIATION</span>`;
        } else if (res) {
          this.meterStatusElem.innerHTML = `<span style="color: #ff7777;">▶ SLICE / RIGHT DEVIATION</span>`;
        }
      }
    }
  }

  public showCelebration(totalStrokes: number, penaltyStrokes: number = 0, par: number = 4): void {
    const summary = summarizeRoundScore(totalStrokes, penaltyStrokes, par);
    const strokeText = document.getElementById('celeb-stroke-text');
    if (strokeText) {
      const penaltyNote = penaltyStrokes > 0
        ? ` (including ${penaltyStrokes} penalty stroke${penaltyStrokes > 1 ? 's' : ''})`
        : '';
      strokeText.textContent =
        `Sophie holed the ball in ${totalStrokes} stroke${totalStrokes > 1 ? 's' : ''}${penaltyNote}!`;
    }
    this.celebrationResultElem.textContent = summary.resultName;
    this.celebrationScoreElem.innerHTML = `
      <div><span>PAR</span><strong>${summary.par}</strong></div>
      <div><span>SCORE</span><strong>${summary.totalStrokes}</strong></div>
      <div><span>TO PAR</span><strong>${summary.relativeLabel}</strong></div>
    `;
    this.celebrationModal.style.display = 'flex';
  }

  /**
   * Announce a rules ruling — out of bounds, a penalty area, or free relief — so the
   * ball moving on its own is explained rather than mysterious.
   */
  public showPenalty(headline: string, detail: string): void {
    if (this.penaltyTimeoutId !== null) {
      window.clearTimeout(this.penaltyTimeoutId);
    }

    this.penaltyBanner.innerHTML = `
      <div style="font-size: 15px; font-weight: bold; color: #ffdd55; letter-spacing: 1px;">${headline}</div>
      <div style="font-size: 11px; color: #ffe8bb; margin-top: 3px;">${detail}</div>
    `;
    this.penaltyBanner.style.display = 'block';

    this.penaltyTimeoutId = window.setTimeout(() => {
      this.penaltyBanner.style.display = 'none';
      this.penaltyTimeoutId = null;
    }, 4000);
  }

  public hideCelebration(): void {
    this.celebrationModal.style.display = 'none';
  }

  private setupStyles(): void {
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '30';

    this.swingMeterContainer.style.position = 'absolute';
    this.swingMeterContainer.style.bottom = '16px';
    this.swingMeterContainer.style.right = '16px';
    this.swingMeterContainer.style.zIndex = '40';
    this.swingMeterContainer.style.pointerEvents = 'auto';

    this.celebrationModal.style.display = 'none';
    this.celebrationModal.style.position = 'absolute';
    this.celebrationModal.style.top = '0';
    this.celebrationModal.style.left = '0';
    this.celebrationModal.style.width = '100%';
    this.celebrationModal.style.height = '100%';
    this.celebrationModal.style.backgroundColor = 'rgba(0, 20, 0, 0.85)';
    this.celebrationModal.style.justifyContent = 'center';
    this.celebrationModal.style.alignItems = 'center';
    this.celebrationModal.style.zIndex = '100';

    this.penaltyBanner.style.display = 'none';
    this.penaltyBanner.style.position = 'absolute';
    this.penaltyBanner.style.top = '90px';
    this.penaltyBanner.style.left = '50%';
    this.penaltyBanner.style.transform = 'translateX(-50%)';
    this.penaltyBanner.style.backgroundColor = 'rgba(48, 20, 6, 0.94)';
    this.penaltyBanner.style.border = '3px solid #ffaa33';
    this.penaltyBanner.style.borderRadius = '6px';
    this.penaltyBanner.style.padding = '10px 20px';
    this.penaltyBanner.style.textAlign = 'center';
    this.penaltyBanner.style.fontFamily = "'Courier New', Courier, monospace";
    this.penaltyBanner.style.maxWidth = '460px';
    this.penaltyBanner.style.zIndex = '70';
    this.penaltyBanner.style.pointerEvents = 'none';
    this.penaltyBanner.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <div style="position: absolute; top: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: auto;">
        
        <div style="background: rgba(10, 24, 12, 0.9); border: 2px solid #44aa44; border-radius: 6px; padding: 10px 16px; color: #d5ffd5; font-family: 'Courier New', monospace; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
          <div id="hud-title" style="font-weight: bold; font-size: 14px; color: #55ff55;">⛳ SOPHIE GOLF — HOLE 1</div>
          <div id="hud-subtitle" style="font-size: 11px; color: #aadbba;">Sophie Hills — Sunset Run · PAR 4</div>
          <div style="display: flex; gap: 16px; margin-top: 4px; font-weight: bold;">
            <span id="hud-stroke" style="color: #ffff55; font-size: 15px;">STROKE 1</span>
            <span id="hud-dist" style="color: #77ffff; font-size: 15px;">248 m TO PIN</span>
          </div>
          <div id="hud-lie" style="font-size: 12px; margin-top: 2px;">
            LIE: <span style="color: #55ff55; font-weight: bold;">TEE (100%)</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button id="btn-hud-cam" class="retro-hud-btn">📷 VIEW: GOLF</button>
          <button id="btn-hud-layout" class="retro-hud-btn" style="border-color: #ffaa33; color: #ffddaa;">⌂ MAIN MENU</button>
          <button id="btn-hud-dev" class="retro-hud-btn" style="border-color: #77aaff; color: #aaddff;">🛠️ DEV (F2)</button>
        </div>
      </div>

      <div style="position: absolute; bottom: 16px; left: 16px; pointer-events: auto; background: rgba(10, 24, 12, 0.9); border: 2px solid #44aa44; border-radius: 6px; padding: 12px; color: #d5ffd5; font-family: 'Courier New', monospace; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
        <div style="font-weight: bold; font-size: 12px; color: #aaffaa; margin-bottom: 4px;">ACTIVE CLUB:</div>
        <div id="hud-club-name" style="font-size: 15px; font-weight: bold; color: #ffff55;">1W - 1 Wood (Driver)</div>
        <div id="hud-club-detail" style="font-size: 11px; color: #bbddbb; margin-bottom: 8px;">Max: 230m | Loft: 12°</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
          <button id="btn-club-prev" class="retro-control-btn">◄ PREV CLUB [W]</button>
          <button id="btn-club-next" class="retro-control-btn">NEXT CLUB [S] ►</button>
        </div>

        <div style="font-weight: bold; font-size: 12px; color: #aaffaa; margin-bottom: 4px;">AIM DIRECTION:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="btn-aim-left" class="retro-control-btn">◀ AIM LEFT [A]</button>
          <button id="btn-aim-right" class="retro-control-btn">AIM RIGHT [D] ▶</button>
        </div>
      </div>

      <style>
        .retro-hud-btn {
          background: rgba(15, 35, 17, 0.92);
          border: 2px solid #44aa44;
          color: #ccffcc;
          padding: 8px 12px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          border-radius: 4px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.5);
        }
        .retro-hud-btn:hover {
          background: #255529;
          border-color: #77ff77;
        }
        .retro-control-btn {
          background: #18331a;
          border: 1px solid #55bb55;
          color: #ddffdd;
          padding: 6px 4px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          cursor: pointer;
          border-radius: 3px;
        }
        .retro-control-btn:hover {
          background: #2b572d;
          border-color: #ffff77;
        }
      </style>
    `;

    this.strokeElem = this.container.querySelector('#hud-stroke')!;
    this.distElem = this.container.querySelector('#hud-dist')!;
    this.lieElem = this.container.querySelector('#hud-lie')!;
    this.clubNameElem = this.container.querySelector('#hud-club-name')!;
    this.clubDetailElem = this.container.querySelector('#hud-club-detail')!;
    this.cameraBtnElem = this.container.querySelector('#btn-hud-cam')!;
    this.headerTitleElem = this.container.querySelector('#hud-title')!;
    this.headerSubtitleElem = this.container.querySelector('#hud-subtitle')!;
    this.menuBtnElem = this.container.querySelector('#btn-hud-layout')!;

    this.container.querySelector('#btn-hud-cam')?.addEventListener('click', () => this.onCameraToggle?.());
    this.container.querySelector('#btn-hud-layout')?.addEventListener('click', () => this.onResetLayout?.());
    this.container.querySelector('#btn-hud-dev')?.addEventListener('click', () => this.onDevModeToggle?.());

    this.container.querySelector('#btn-club-prev')?.addEventListener('click', () => this.onClubPrev?.());
    this.container.querySelector('#btn-club-next')?.addEventListener('click', () => this.onClubNext?.());
    this.container.querySelector('#btn-aim-left')?.addEventListener('click', () => this.onAimLeft?.());
    this.container.querySelector('#btn-aim-right')?.addEventListener('click', () => this.onAimRight?.());
  }

  private buildSwingMeterHTML(): void {
    this.swingMeterContainer.innerHTML = `
      <div style="background: rgba(10, 24, 12, 0.94); border: 3px solid #ffff44; border-radius: 8px; padding: 14px 18px; width: 340px; color: #ffffff; font-family: 'Courier New', monospace; box-shadow: 0 6px 20px rgba(0,0,0,0.7);">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: bold; font-size: 13px; color: #ffff55;">🎯 SWING METER</span>
          <span style="font-size: 10px; color: #aaffaa;">3-CLICK CONTROL</span>
        </div>

        <div style="position: relative; width: 100%; height: 24px; background: #0a180b; border: 2px solid #55aa55; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
          <div id="meter-power-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #33bb33 0%, #ffff33 70%, #ff3333 100%); transition: none;"></div>
        </div>

        <div style="position: relative; width: 100%; height: 16px; background: #112211; border: 1px solid #448844; border-radius: 3px; margin-bottom: 10px;">
          <div style="position: absolute; left: 30%; width: 6px; height: 100%; background: #00ff00; opacity: 0.8;"></div>
          <div id="meter-acc-marker" style="position: absolute; left: 30%; top: -2px; width: 4px; height: 20px; background: #ffffff; border: 1px solid #000000; transform: translateX(-50%);"></div>
        </div>

        <div id="meter-status" style="font-size: 11px; text-align: center; margin-bottom: 10px; min-height: 16px;">
          <span style="color: #55ff55;">PRESS SPACE OR CLICK BUTTON BELOW</span>
        </div>

        <button id="btn-trigger-swing" style="width: 100%; background: #cc3333; border: 2px solid #ff7777; color: #ffffff; padding: 10px; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
          SWING! [SPACE]
        </button>
      </div>
    `;

    this.meterPowerBar = this.swingMeterContainer.querySelector('#meter-power-bar')!;
    this.meterAccMarker = this.swingMeterContainer.querySelector('#meter-acc-marker')!;
    this.meterStatusElem = this.swingMeterContainer.querySelector('#meter-status')!;

    this.swingMeterContainer.querySelector('#btn-trigger-swing')?.addEventListener('click', () => {
      this.onSwingTrigger?.();
    });
  }

  private buildCelebrationModalHTML(): void {
    this.celebrationModal.innerHTML = `
      <div style="background: #0f2b11; border: 4px solid #55ff55; border-radius: 12px; padding: 32px; text-align: center; max-width: 480px; box-shadow: 0 0 30px rgba(85, 255, 85, 0.5); font-family: 'Courier New', monospace; color: #ffffff;">
        <div style="color: #8ee89b; font-size: 11px; letter-spacing: 4px;">HOLE COMPLETE</div>
        <h1 id="celeb-result" style="color: #ffff55; font-size: 34px; margin: 8px 0 10px; text-shadow: 3px 3px #003300;">PAR</h1>
        <h2 id="celeb-stroke-text" style="color: #77ffff; font-size: 18px; margin-bottom: 16px;">Sophie holed the ball in 3 strokes!</h2>
        <div id="celeb-score" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 auto 16px;">
          <div><span>PAR</span><strong>4</strong></div><div><span>SCORE</span><strong>4</strong></div><div><span>TO PAR</span><strong>E</strong></div>
        </div>
        <p id="celeb-course" style="font-size: 11px; color: #aaffaa; margin-bottom: 22px;">Sophie Hills — Sunset Run</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="btn-celeb-play-again" style="background: #22aa22; border: 2px solid #77ff77; color: #ffffff; padding: 12px; font-family: inherit; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 6px;">↻ PLAY AGAIN</button>
          <button id="btn-celeb-title" style="background: #18331a; border: 2px solid #77aa77; color: #ddffdd; padding: 12px; font-family: inherit; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 6px;">⌂ MAIN MENU</button>
        </div>
        <style>
          #celeb-score > div { border: 1px solid #4c9b59; background: #091d0d; padding: 8px; }
          #celeb-score span { display: block; color: #8fbe97; font-size: 9px; }
          #celeb-score strong { display: block; color: #fff07a; font-size: 22px; margin-top: 2px; }
        </style>
      </div>
    `;

    this.celebrationResultElem = this.celebrationModal.querySelector('#celeb-result')!;
    this.celebrationScoreElem = this.celebrationModal.querySelector('#celeb-score')!;
    this.celebrationCourseElem = this.celebrationModal.querySelector('#celeb-course')!;

    this.celebrationModal.querySelector('#btn-celeb-play-again')?.addEventListener('click', () => {
      this.hideCelebration();
      this.onPlayAgain?.();
    });
    this.celebrationModal.querySelector('#btn-celeb-title')?.addEventListener('click', () => {
      this.hideCelebration();
      this.onReturnToTitle?.();
    });
  }
}
