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
      this.headerTitleElem.textContent = 'SOPHIE GOLF';
    }
    if (this.headerSubtitleElem) {
      this.headerSubtitleElem.textContent = `${config.courseName} · ${config.holeName} · PAR ${config.par} · ${config.distanceMetres}m`;
    }
    const holeNumberElem = this.container.querySelector('#hud-hole-number');
    if (holeNumberElem) holeNumberElem.textContent = String(config.holeNumber);
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
      this.windElem.textContent = `WIND  ${windStr}`;
    }
    if (this.lieElem) {
      const pct = Math.round(lie.distanceMultiplier * 100);
      let color = '#55ff55';
      if (lie.type === 'ROUGH' || lie.type === 'DEEP_ROUGH') color = '#ffcc44';
      if (lie.type === 'BUNKER') color = '#ffaa33';
      if (lie.type === 'GREEN') color = '#55ffff';
      this.lieElem.innerHTML = `LIE  <span style="color: ${color}; font-weight: 800;">${lie.name.toUpperCase()} · ${pct}%</span>`;
    }
    if (this.clubNameElem) {
      this.clubNameElem.textContent = `${club.code} · ${club.name.toUpperCase()}`;
    }
    if (this.clubDetailElem) {
      this.clubDetailElem.textContent = `${club.maxDistanceMetres}m carry · ${club.loftDegrees}° loft`;
    }
    if (this.cameraBtnElem) {
      this.cameraBtnElem.textContent = `VIEW · ${cameraMode}`;
    }
  }

  public updateSwingMeter(swingMeter: SwingMeter): void {
    const state = swingMeter.getState();
    const power = swingMeter.getPowerValue();
    const acc = swingMeter.getAccuracyValue();

    // Contextual expansion: only display swing meter panel when swinging
    if (state === 'IDLE') {
      this.swingMeterContainer.style.display = 'none';
    } else {
      this.swingMeterContainer.style.display = 'block';
    }

    if (this.meterPowerBar) {
      this.meterPowerBar.style.width = `${Math.min(100, Math.max(0, power * 100))}%`;
    }

    if (this.meterAccMarker) {
      const leftPct = ((acc + 0.5) / 1.5) * 100;
      this.meterAccMarker.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    }

    if (this.meterStatusElem) {
      if (state === 'POWER_RISING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffff55;">SET POWER! (${Math.round(power * 100)}%)</span>`;
      } else if (state === 'ACCURACY_FALLING') {
        this.meterStatusElem.innerHTML = `<span style="color: #ffaa33;">STRIKE SWEET SPOT! (ACCURACY)</span>`;
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
    this.swingMeterContainer.style.bottom = '78px';
    this.swingMeterContainer.style.left = '50%';
    this.swingMeterContainer.style.transform = 'translateX(-50%)';
    this.swingMeterContainer.style.zIndex = '40';
    this.swingMeterContainer.style.pointerEvents = 'auto';
    this.swingMeterContainer.style.display = 'none'; // Contextual: hidden by default until swing begins

    this.celebrationModal.style.display = 'none';
    this.celebrationModal.style.position = 'absolute';
    this.celebrationModal.style.top = '0';
    this.celebrationModal.style.left = '0';
    this.celebrationModal.style.width = '100%';
    this.celebrationModal.style.height = '100%';
    this.celebrationModal.style.backgroundColor = 'rgba(0, 20, 0, 0.88)';
    this.celebrationModal.style.justifyContent = 'center';
    this.celebrationModal.style.alignItems = 'center';
    this.celebrationModal.style.zIndex = '100';

    Object.assign(this.penaltyBanner.style, {
      display: 'none', position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(48, 20, 6, 0.94)', border: '2px solid #ffaa33', color: '#ffe8bb',
      padding: '8px 18px', textAlign: 'center', fontFamily: "'Courier New', monospace", zIndex: '70',
      borderRadius: '8px'
    });
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <!-- Top Minimal Bar -->
      <div class="hud-topbar">
        <div class="hud-capsule hud-main-info">
          <div class="hud-hole-tag"><strong id="hud-hole-number">1</strong></div>
          <div class="hud-text-stack">
            <div id="hud-title">⛳ SOPHIE GOLF — HOLE 1</div>
            <div id="hud-subtitle">Sophie Hills (Fictional) — Sunset Run · PAR 4 · 234m</div>
          </div>
        </div>

        <div class="hud-capsule hud-shot-info">
          <span id="hud-stroke" class="hud-highlight">STROKE 1</span>
          <span id="hud-dist" class="hud-accent">234.0 m TO PIN</span>
          <span id="hud-wind">WIND 4 m/s ↗</span>
          <span id="hud-lie">LIE <strong style="color: #68d391;">TEE (100%)</strong></span>
        </div>

        <div class="hud-capsule hud-nav-actions">
          <button id="btn-hud-cam" class="hud-btn">VIEW</button>
          <button id="btn-hud-replay" class="hud-btn" style="color: #fbd38d;">MENU</button>
        </div>
      </div>

      <!-- Bottom Minimal Bar -->
      <div class="hud-bottombar">
        <div class="hud-capsule hud-club-selector">
          <button id="btn-club-prev" class="hud-ctrl-btn" aria-label="Previous club">‹</button>
          <div class="hud-club-display">
            <div id="hud-club-name">1W · DRIVER</div>
            <div id="hud-club-detail">230m · 12° loft</div>
          </div>
          <button id="btn-club-next" class="hud-ctrl-btn" aria-label="Next club">›</button>
        </div>

        <div class="hud-capsule hud-aim-controls">
          <button id="btn-aim-left" class="hud-ctrl-btn" aria-label="Aim left">◀ AIM</button>
          <span style="font-size: 10px; color: #a0aec0; padding: 0 4px;">A / D</span>
          <button id="btn-aim-right" class="hud-ctrl-btn" aria-label="Aim right">AIM ▶</button>
        </div>

        <button id="btn-trigger-swing" class="hud-swing-btn">⛳ SWING <span style="font-size: 10px; opacity: 0.8;">(SPACE)</span></button>
      </div>

      <style>
        .hud-topbar {
          position: absolute;
          top: max(10px, env(safe-area-inset-top));
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: auto;
        }
        .hud-capsule {
          display: flex;
          align-items: center;
          background: rgba(10, 25, 18, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          color: #f7fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
          padding: 6px 12px;
          font-size: 11px;
        }
        .hud-hole-tag {
          background: #48bb78;
          color: #062414;
          font-weight: 900;
          font-size: 14px;
          padding: 2px 8px;
          border-radius: 4px;
          margin-right: 8px;
        }
        .hud-text-stack { display: flex; flex-direction: column; }
        #hud-title { font-weight: 800; font-size: 12px; color: #fbd38d; }
        #hud-subtitle { font-size: 10px; color: #cbd5e0; }
        .hud-shot-info { gap: 14px; font-weight: 700; }
        .hud-highlight { color: #f6e05e; }
        .hud-accent { color: #63b3ed; }
        .hud-nav-actions { margin-left: auto; gap: 6px; padding: 4px 6px; }
        .hud-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0;
          padding: 5px 10px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 10px;
          cursor: pointer;
        }
        .hud-btn:hover { background: rgba(255, 255, 255, 0.2); }

        .hud-bottombar {
          position: absolute;
          bottom: max(12px, env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: auto;
          max-width: calc(100vw - 24px);
        }
        .hud-club-selector { padding: 4px 6px; }
        .hud-ctrl-btn {
          background: rgba(255, 255, 255, 0.12);
          border: 0;
          color: white;
          font-weight: 800;
          font-size: 14px;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .hud-ctrl-btn:hover { background: rgba(246, 224, 94, 0.3); color: #f6e05e; }
        .hud-club-display { text-align: center; min-width: 110px; padding: 0 8px; }
        #hud-club-name { font-weight: 800; font-size: 13px; color: #fbd38d; }
        #hud-club-detail { font-size: 9px; color: #a0aec0; }
        .hud-aim-controls { padding: 4px 6px; }
        .hud-swing-btn {
          background: linear-gradient(180deg, #48bb78, #2f855a);
          border: 1px solid #68d391;
          color: white;
          font-weight: 900;
          font-size: 14px;
          padding: 10px 22px;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(47, 133, 90, 0.45);
          letter-spacing: 0.5px;
        }
        .hud-swing-btn:hover { background: linear-gradient(180deg, #68d391, #38a169); }

        @media (max-width: 768px) {
          .hud-topbar { flex-wrap: wrap; gap: 4px; }
          .hud-shot-info { font-size: 10px; gap: 8px; }
          #hud-subtitle { display: none; }
          .hud-bottombar { gap: 4px; }
          .hud-club-display { min-width: 90px; }
          .hud-swing-btn { padding: 8px 14px; font-size: 12px; }
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
    this.container.querySelector('#btn-trigger-swing')?.addEventListener('click', () => this.onSwingTrigger?.());
  }

  private buildSwingMeterHTML(): void {
    this.swingMeterContainer.innerHTML = `
      <div class="swing-popup-panel">
        <div class="swing-status-bar" id="meter-status">
          <span>PRESS SPACE / CLICK TO SWING</span>
        </div>
        <div class="meter-tracks">
          <div class="power-track">
            <div id="meter-power-bar"></div>
            <span class="mark-50">50%</span>
            <span class="mark-100">100%</span>
          </div>
          <div class="accuracy-track">
            <div class="sweet-spot"></div>
            <div id="meter-acc-marker"></div>
          </div>
        </div>
      </div>
      <style>
        .swing-popup-panel {
          width: 320px;
          background: rgba(8, 22, 14, 0.95);
          border: 2px solid #48bb78;
          border-radius: 10px;
          padding: 8px 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
          color: white;
          font-family: monospace;
        }
        .swing-status-bar {
          text-align: center;
          font-weight: 800;
          font-size: 11px;
          margin-bottom: 6px;
          color: #f6e05e;
          min-height: 14px;
        }
        .meter-tracks { display: flex; flex-direction: column; gap: 4px; }
        .power-track, .accuracy-track {
          height: 14px;
          background: #1a202c;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        #meter-power-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #48bb78, #ecc94b, #e53e3e);
          transition: width 0.02s linear;
        }
        .mark-50 { position: absolute; left: 50%; top: 0; font-size: 8px; color: #a0aec0; transform: translateX(-50%); }
        .mark-100 { position: absolute; right: 4px; top: 0; font-size: 8px; color: #a0aec0; }
        .sweet-spot {
          position: absolute;
          left: calc(33.3% - 4px);
          width: 14px;
          height: 100%;
          background: #48bb78;
          border-radius: 2px;
        }
        #meter-acc-marker {
          position: absolute;
          left: 0%;
          top: 0;
          width: 4px;
          height: 100%;
          background: #ffffff;
          box-shadow: 0 0 4px #ffffff;
          transform: translateX(-50%);
        }
      </style>
    `;

    this.meterPowerBar = this.swingMeterContainer.querySelector('#meter-power-bar')!;
    this.meterAccMarker = this.swingMeterContainer.querySelector('#meter-acc-marker')!;
    this.meterStatusElem = this.swingMeterContainer.querySelector('#meter-status')!;
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
