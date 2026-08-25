import { LieInfo } from '../course/SurfaceQuery';
import { ClubConfig } from '../golf/Club';
import { SwingMeter } from '../golf/SwingMeter';
import { summarizeRoundScore } from '../game/RoundScore';

export interface GameHUDHoleConfig {
  courseName: string;
  holeName: string;
  holeNumber: number;
  par: number;
  distanceMetres: number;
  menuLabel: string;
}

export class GameHUD {
  private container: HTMLElement;
  private swingMeterContainer: HTMLElement;
  private celebrationModal: HTMLElement;

  // Callbacks
  private onAimLeft?: () => void;
  private onAimRight?: () => void;
  private onClubNext?: () => void;
  private onClubPrev?: () => void;
  private onSwingTrigger?: () => void;
  private onCameraToggle?: () => void;
  private onResetLayout?: () => void;
  private onPlayAgain?: () => void;
  private onReturnToTitle?: () => void;

  // Dynamic elements
  private strokeElem!: HTMLElement;
  private distElem!: HTMLElement;
  private lieElem!: HTMLElement;
  private windElem!: HTMLElement;
  private clubNameElem!: HTMLElement;
  private clubDetailElem!: HTMLElement;
  private cameraBtnElem!: HTMLElement;
  private headerTitleElem!: HTMLElement;
  private headerSubtitleElem!: HTMLElement;
  private celebrationResultElem!: HTMLElement;
  private celebrationScoreElem!: HTMLElement;
  private celebrationCourseElem!: HTMLElement;
  private celebrationActionBtn!: HTMLButtonElement;
  private celebrationProgressElem!: HTMLElement;
  private penaltyBanner!: HTMLElement;

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
    onPlayAgain?: () => void;
    onDevModeToggle?: () => void;
    onReturnToTitle?: () => void;
  }) {
    this.onAimLeft = callbacks.onAimLeft;
    this.onAimRight = callbacks.onAimRight;
    this.onClubNext = callbacks.onClubNext;
    this.onClubPrev = callbacks.onClubPrev;
    this.onSwingTrigger = callbacks.onSwingTrigger;
    this.onCameraToggle = callbacks.onCameraToggle;
    this.onResetLayout = callbacks.onResetLayout;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onReturnToTitle = callbacks.onReturnToTitle;

    this.container = document.createElement('div');
    this.swingMeterContainer = document.createElement('div');
    this.container.id = 'sophie-game-hud';
    this.swingMeterContainer.id = 'sophie-swing-meter';
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
  }

  public configureHole(config: GameHUDHoleConfig): void {
    if (this.headerTitleElem) {
      this.headerTitleElem.textContent = `⛳ SOPHIE GOLF — HOLE ${config.holeNumber}`;
    }
    if (this.headerSubtitleElem) {
      this.headerSubtitleElem.textContent = `${config.courseName} — ${config.holeName} · PAR ${config.par} · ${config.distanceMetres}m`;
    }
    if (this.celebrationCourseElem) {
      this.celebrationCourseElem.textContent = `${config.courseName} — ${config.holeName} · Par ${config.par}`;
    }
  }

  public updateHUD(
    totalStrokes: number,
    penaltyStrokes: number,
    distToCupMetres: number,
    club: ClubConfig,
    lie: LieInfo,
    cameraMode: string,
    windStr: string = '4 m/s ↗'
  ): void {
    if (this.strokeElem) {
      this.strokeElem.textContent = penaltyStrokes > 0
        ? `STROKES ${totalStrokes} (${penaltyStrokes} PEN.)`
        : `STROKE ${totalStrokes}`;
    }
    if (this.distElem) {
      this.distElem.textContent = `${distToCupMetres.toFixed(1)} m TO PIN`;
    }
    if (this.windElem) {
      this.windElem.textContent = `WIND: ${windStr}`;
    }
    if (this.lieElem) {
      const pct = Math.round(lie.distanceMultiplier * 100);
      let color = '#55ff55';
      if (lie.type === 'ROUGH' || lie.type === 'DEEP_ROUGH') color = '#ffcc44';
      if (lie.type === 'BUNKER') color = '#ffaa33';
      if (lie.type === 'GREEN') color = '#55ffff';
      this.lieElem.innerHTML = `LIE: <span style="color: ${color}; font-weight: bold;">${lie.name.toUpperCase()} (${pct}%)</span>`;
    }
    if (this.clubNameElem) {
      this.clubNameElem.textContent = `${club.code} - ${club.name}`;
    }
    if (this.clubDetailElem) {
      this.clubDetailElem.textContent = `Carry: ~${club.maxDistanceMetres}m | Loft: ${club.loftDegrees}°`;
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
        this.meterStatusElem.innerHTML = `<span style="color: #55ff55;">PRESS SPACE OR CLICK SWING (INPUT 1: START)</span>`;
      } else if (state === 'POWER_RISING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffff55;">CLICK TO SET POWER! (INPUT 2: ${Math.round(power * 100)}%)</span>`;
      } else if (state === 'ACCURACY_FALLING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffaa33;">CLICK ON GREEN SWEET SPOT! (INPUT 3: ACCURACY)</span>`;
      } else if (state === 'COMPLETE') {
        const res = swingMeter.getResult();
        if (res?.isPerfect) {
          this.meterStatusElem.innerHTML = `<span style="color: #55ffff; font-weight: bold;">🎯 PERFECT STRIKE!</span>`;
        } else if (res && res.hookSliceAngleDegrees < 0) {
          this.meterStatusElem.innerHTML = `<span style="color: #ff7777;">◀ HOOK / LEFT MIS-HIT</span>`;
        } else if (res) {
          this.meterStatusElem.innerHTML = `<span style="color: #ff7777;">▶ SLICE / RIGHT MIS-HIT</span>`;
        }
      }
    }
  }

  public showCelebration(
    totalStrokes: number,
    penaltyStrokes: number = 0,
    par: number = 4,
    courseProgress?: { holesPlayed: number; holeCount: number; totalStrokes: number; totalPar: number }
  ): void {
    const summary = summarizeRoundScore(totalStrokes, penaltyStrokes, par);

    const strokeText = document.getElementById('celeb-stroke-text');
    if (strokeText) {
      const penaltyNote = penaltyStrokes > 0 ? `, including ${penaltyStrokes} penalty` : '';
      strokeText.textContent = `Sophie holed out in ${totalStrokes} strokes${penaltyNote}.`;
    }
    this.celebrationResultElem.textContent = summary.resultName;
    this.celebrationScoreElem.innerHTML = `
      <div><span>PAR</span><strong>${summary.par}</strong></div>
      <div><span>SCORE</span><strong>${summary.totalStrokes}</strong></div>
      <div><span>TO PAR</span><strong>${summary.relativeLabel}</strong></div>
    `;
    this.celebrationProgressElem.style.display = courseProgress ? 'block' : 'none';
    if (courseProgress) {
      const course = summarizeRoundScore(courseProgress.totalStrokes, 0, courseProgress.totalPar);
      this.celebrationProgressElem.textContent = `COURSE ${course.relativeLabel} · ${courseProgress.holesPlayed}/${courseProgress.holeCount} HOLES`;
    }
    this.celebrationModal.style.display = 'flex';
  }

  public configureCompletionAction(label: string): void {
    this.celebrationActionBtn.textContent = label;
  }

  public showPenalty(headline: string, detail: string): void {
    this.penaltyBanner.innerHTML = `<strong>${headline}</strong><div>${detail}</div>`;
    this.penaltyBanner.style.display = 'block';
    window.setTimeout(() => { this.penaltyBanner.style.display = 'none'; }, 4000);
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

    Object.assign(this.penaltyBanner.style, {
      display: 'none', position: 'absolute', top: '90px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(48, 20, 6, 0.94)', border: '3px solid #ffaa33', color: '#ffe8bb',
      padding: '10px 20px', textAlign: 'center', fontFamily: "'Courier New', monospace", zIndex: '70'
    });
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <div class="hud-topbar">
        
        <div class="hud-scorecard">
          <div id="hud-title" style="font-weight: bold; font-size: 14px; color: #55ff55;">⛳ SOPHIE GOLF — HOLE 6</div>
          <div id="hud-subtitle" style="font-size: 11px; color: #aadbba;">Warragul Country Club · PAR 4 · 248m</div>
          <div style="display: flex; gap: 16px; margin-top: 4px; font-weight: bold;">
            <span id="hud-stroke" style="color: #ffff55; font-size: 15px;">STROKE 1</span>
            <span id="hud-dist" style="color: #77ffff; font-size: 15px;">248.0 m TO PIN</span>
          </div>
          <div style="display: flex; gap: 16px; margin-top: 2px; font-size: 12px;">
            <div id="hud-lie">LIE: <span style="color: #55ff55; font-weight: bold;">TEE (100%)</span></div>
            <div id="hud-wind" style="color: #bbffdd;">WIND: 4 m/s ↗</div>
          </div>
        </div>

        <div class="hud-actions">
          <button id="btn-hud-cam" class="retro-hud-btn">📷 VIEW: GOLF</button>
          <button id="btn-hud-replay" class="retro-hud-btn" style="border-color: #ffaa33; color: #ffddaa;">↻ REPLAY HOLE</button>
        </div>
      </div>

      <div class="hud-controls">
        <div style="font-weight: bold; font-size: 12px; color: #aaffaa; margin-bottom: 4px;">ACTIVE CLUB:</div>
        <div id="hud-club-name" style="font-size: 15px; font-weight: bold; color: #ffff55;">1W - Driver (1W)</div>
        <div id="hud-club-detail" style="font-size: 11px; color: #bbddbb; margin-bottom: 8px;">Carry: ~230m | Loft: 12°</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
          <button id="btn-club-prev" class="retro-control-btn" aria-label="Previous club">◄ CLUB</button>
          <button id="btn-club-next" class="retro-control-btn" aria-label="Next club">CLUB ►</button>
        </div>

        <div style="font-weight: bold; font-size: 12px; color: #aaffaa; margin-bottom: 4px;">AIM DIRECTION:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button id="btn-aim-left" class="retro-control-btn" aria-label="Aim left">◀ AIM</button>
          <button id="btn-aim-right" class="retro-control-btn" aria-label="Aim right">AIM ▶</button>
        </div>
      </div>

      <style>
        .hud-topbar {
          position: absolute;
          top: max(12px, env(safe-area-inset-top));
          left: 12px;
          right: 12px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          pointer-events: auto;
        }
        .hud-scorecard, .hud-controls {
          background: rgba(10, 24, 12, 0.92);
          border: 2px solid #44aa44;
          border-radius: 6px;
          color: #d5ffd5;
          font-family: 'Courier New', monospace;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        }
        .hud-scorecard { padding: 10px 16px; }
        .hud-actions { display: flex; gap: 8px; }
        .hud-controls {
          position: absolute;
          bottom: 16px;
          left: 16px;
          width: min(340px, calc(100vw - 32px));
          padding: 12px;
          pointer-events: auto;
        }
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
          touch-action: manipulation;
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
          min-height: 42px;
          touch-action: manipulation;
        }
        .retro-control-btn:hover {
          background: #2b572d;
          border-color: #ffff77;
        }
        @media (max-width: 700px) {
          .hud-topbar {
            top: max(6px, env(safe-area-inset-top));
            left: 6px;
            right: 6px;
            gap: 6px;
          }
          .hud-scorecard {
            min-width: 0;
            flex: 1;
            padding: 7px 9px;
          }
          #hud-title { font-size: 11px !important; }
          #hud-subtitle { font-size: 9px !important; }
          #hud-stroke, #hud-dist { font-size: 12px !important; }
          #hud-lie { font-size: 10px; }
          #hud-wind { display: none; }
          .hud-actions {
            width: 92px;
            flex-direction: column;
            gap: 5px;
          }
          .retro-hud-btn {
            min-height: 42px;
            padding: 5px 6px;
            font-size: 9px;
          }
          .hud-controls {
            left: 6px;
            bottom: calc(174px + env(safe-area-inset-bottom));
            width: calc(100vw - 12px);
            max-width: none;
            padding: 8px;
          }
          .hud-controls > div:first-child,
          #hud-club-detail,
          .hud-controls > div:nth-of-type(4) { display: none; }
          #hud-club-name {
            font-size: 12px !important;
            margin-bottom: 6px;
          }
          .retro-control-btn {
            min-height: 46px;
            font-size: 12px;
            font-weight: bold;
          }
          #sophie-swing-meter {
            left: 6px !important;
            right: 6px !important;
            bottom: max(6px, env(safe-area-inset-bottom)) !important;
          }
          #sophie-swing-meter > div {
            width: 100% !important;
            padding: 10px 12px !important;
          }
          #btn-trigger-swing {
            min-height: 48px;
            touch-action: manipulation;
          }
        }
      </style>
    `;

    this.strokeElem = this.container.querySelector('#hud-stroke')!;
    this.distElem = this.container.querySelector('#hud-dist')!;
    this.lieElem = this.container.querySelector('#hud-lie')!;
    this.windElem = this.container.querySelector('#hud-wind')!;
    this.clubNameElem = this.container.querySelector('#hud-club-name')!;
    this.clubDetailElem = this.container.querySelector('#hud-club-detail')!;
    this.cameraBtnElem = this.container.querySelector('#btn-hud-cam')!;
    this.headerTitleElem = this.container.querySelector('#hud-title')!;
    this.headerSubtitleElem = this.container.querySelector('#hud-subtitle')!;

    this.container.querySelector('#btn-hud-cam')?.addEventListener('click', () => this.onCameraToggle?.());
    this.container.querySelector('#btn-hud-replay')?.addEventListener('click', () => this.onResetLayout?.());

    this.container.querySelector('#btn-club-prev')?.addEventListener('click', () => this.onClubPrev?.());
    this.container.querySelector('#btn-club-next')?.addEventListener('click', () => this.onClubNext?.());
    this.container.querySelector('#btn-aim-left')?.addEventListener('click', () => this.onAimLeft?.());
    this.container.querySelector('#btn-aim-right')?.addEventListener('click', () => this.onAimRight?.());
  }

  private buildSwingMeterHTML(): void {
    this.swingMeterContainer.innerHTML = `
      <div style="background: rgba(10, 24, 12, 0.94); border: 3px solid #ffff44; border-radius: 8px; padding: 14px 18px; width: 340px; color: #ffffff; font-family: 'Courier New', monospace; box-shadow: 0 6px 20px rgba(0,0,0,0.7);">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: bold; font-size: 13px; color: #ffff55;">🎯 3-CLICK SWING METER</span>
          <span style="font-size: 10px; color: #aaffaa;">POWER & ACCURACY</span>
        </div>

        <div style="position: relative; width: 100%; height: 24px; background: #0a180b; border: 2px solid #55aa55; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
          <div id="meter-power-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #33bb33 0%, #ffff33 70%, #ff3333 100%); transition: none;"></div>
        </div>

        <div style="position: relative; width: 100%; height: 16px; background: #112211; border: 1px solid #448844; border-radius: 3px; margin-bottom: 10px;">
          <div style="position: absolute; left: 30%; width: 8px; height: 100%; background: #00ff00; opacity: 0.85;"></div>
          <div id="meter-acc-marker" style="position: absolute; left: 30%; top: -2px; width: 4px; height: 20px; background: #ffffff; border: 1px solid #000000; transform: translateX(-50%);"></div>
        </div>

        <div id="meter-status" style="font-size: 11px; text-align: center; margin-bottom: 10px; min-height: 16px;">
          <span style="color: #55ff55;">PRESS SPACE OR CLICK BUTTON BELOW</span>
        </div>

        <button id="btn-trigger-swing" style="width: 100%; background: #cc3333; border: 2px solid #ff7777; color: #ffffff; padding: 10px; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
          SWING!
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
        <h2 id="celeb-stroke-text" style="color: #77ffff; font-size: 18px; margin-bottom: 16px;">Sophie holed the ball in 4 strokes!</h2>
        <div id="celeb-score" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 auto 16px;">
          <div><span>PAR</span><strong>4</strong></div><div><span>SCORE</span><strong>4</strong></div><div><span>TO PAR</span><strong>E</strong></div>
        </div>
        <p id="celeb-course" style="font-size: 11px; color: #aaffaa; margin-bottom: 22px;">Warragul Country Club · Hole 6 · Par 4</p>
        <p id="celeb-progress" style="display:none; color:#ffe66d; font-size:11px;"></p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="btn-celeb-play-again" style="background: #22aa22; border: 2px solid #77ff77; color: #ffffff; padding: 12px 24px; font-family: inherit; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 6px;">↻ PLAY AGAIN</button>
          <button id="btn-celeb-title" style="background:#18331a; border:2px solid #77aa77; color:#ddffdd; font-family:inherit; font-weight:bold;">⌂ MAIN MENU</button>
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
    this.celebrationProgressElem = this.celebrationModal.querySelector('#celeb-progress')!;
    this.celebrationActionBtn = this.celebrationModal.querySelector('#btn-celeb-play-again')!;

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
