import { describeShotResult, ShotShape } from '../golf/ShotShape';
import { Scorecard } from '../game/Scorecard';
import { ShotType, shotTypeProfile } from '../golf/ShotType';
import {
  ABILITY_LABELS,
  Attribute,
  ATTRIBUTES,
  Discipline,
  DISCIPLINES,
  levelOf,
  MAX_LEVEL
} from '../game/Abilities';
import { Progress } from '../game/Progress';
import { LieInfo } from '../course/SurfaceQuery';
import { ClubConfig } from '../golf/Club';
import { SwingMeter } from '../golf/SwingMeter';
import { PuttMeter } from '../golf/PuttMeter';
import { summarizeRoundScore } from '../game/RoundScore';

export type ShotMode = 'FULL_SWING' | 'PUTTING';

export interface GameHUDHoleConfig {
  courseName: string;
  holeName: string;
  holeNumber: number;
  par: number;
  distanceMetres: number;
  menuLabel: string;
}

export class GameHUD {
  private shotShape: ShotShape = 'STRAIGHT';
  /** Non-null while the selector is offering chip/pitch/lob instead of shape. */
  private shotType: ShotType | null = null;
  private container: HTMLElement;
  private swingMeterContainer: HTMLElement;
  private puttMeterContainer: HTMLElement;
  private celebrationModal: HTMLElement;

  // Callbacks
  private onAimLeft?: () => void;
  private onShapeLeft?: () => void;
  private onShapeRight?: () => void;
  private onAimRight?: () => void;
  private onClubNext?: () => void;
  private onClubPrev?: () => void;
  private onSwingTrigger?: () => void;
  private onPuttTrigger?: () => void;
  private onCameraToggle?: () => void;
  private onReadGreenToggle?: () => void;
  private onResetLayout?: () => void;
  private onPlayAgain?: () => void;
  private onReturnToTitle?: () => void;
  private onTrain?: (discipline: Discipline, attribute: Attribute) => void;

  // Dynamic elements
  private strokeElem!: HTMLElement;
  private distElem!: HTMLElement;
  private lieElem!: HTMLElement;
  private windElem!: HTMLElement;
  private clubSelectorCapsule!: HTMLElement;
  private shapeCapsuleElem!: HTMLElement;
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
  private celebrationCardElem!: HTMLElement;
  private celebrationCardBody!: HTMLElement;
  private trainingElem!: HTMLElement;
  private trainingTitleElem!: HTMLElement;
  private trainingGridElem!: HTMLElement;
  private penaltyBanner!: HTMLElement;
  private flightElem!: HTMLElement;
  private flightValueElem!: HTMLElement;
  private flightDetailElem!: HTMLElement;
  private flightHideTimer: ReturnType<typeof setTimeout> | null = null;

  private meterPowerBar!: HTMLElement;
  private meterAccMarker!: HTMLElement;
  private meterStatusElem!: HTMLElement;
  private swingButtonElem!: HTMLButtonElement;
  private bottomBarElem!: HTMLElement;

  // Putt Meter elements
  private puttMeterBar!: HTMLElement;
  private puttMeterTargetMarker!: HTMLElement;
  private puttMeterReadout!: HTMLElement;
  private puttTargetElem!: HTMLElement;
  private puttMeterScaleElem!: HTMLElement;

  private shotMode: ShotMode = 'FULL_SWING';
  private isPuttingMode: boolean = false;
  private lastInputTime: number = 0;

  constructor(callbacks: {
    onAimLeft?: () => void;
    onShapeLeft?: () => void;
    onShapeRight?: () => void;
    onAimRight?: () => void;
    onClubNext?: () => void;
    onClubPrev?: () => void;
    onSwingTrigger?: () => void;
    onPuttTrigger?: () => void;
    onCameraToggle?: () => void;
    onReadGreenToggle?: () => void;
    onResetLayout?: () => void;
    onPlayAgain?: () => void;
    onDevModeToggle?: () => void;
    onReturnToTitle?: () => void;
    onTrain?: (discipline: Discipline, attribute: Attribute) => void;
  }) {
    this.onAimLeft = callbacks.onAimLeft;
    this.onShapeLeft = callbacks.onShapeLeft;
    this.onShapeRight = callbacks.onShapeRight;
    this.onAimRight = callbacks.onAimRight;
    this.onClubNext = callbacks.onClubNext;
    this.onClubPrev = callbacks.onClubPrev;
    this.onSwingTrigger = callbacks.onSwingTrigger;
    this.onPuttTrigger = callbacks.onPuttTrigger;
    this.onCameraToggle = callbacks.onCameraToggle;
    this.onReadGreenToggle = callbacks.onReadGreenToggle;
    this.onResetLayout = callbacks.onResetLayout;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onReturnToTitle = callbacks.onReturnToTitle;
    this.onTrain = callbacks.onTrain;

    this.container = document.createElement('div');
    this.swingMeterContainer = document.createElement('div');
    this.puttMeterContainer = document.createElement('div');
    this.container.id = 'sophie-game-hud';
    this.swingMeterContainer.id = 'sophie-swing-meter';
    this.puttMeterContainer.id = 'sophie-putt-meter';
    this.celebrationModal = document.createElement('div');
    this.penaltyBanner = document.createElement('div');

    this.setupStyles();
    this.buildHTML();
    this.buildSwingMeterHTML();
    this.buildPuttMeterHTML();
    this.buildCelebrationModalHTML();

    document.body.appendChild(this.container);
    document.body.appendChild(this.swingMeterContainer);
    document.body.appendChild(this.puttMeterContainer);
    document.body.appendChild(this.celebrationModal);
    document.body.appendChild(this.penaltyBanner);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.swingMeterContainer.style.display = 'none';
      this.puttMeterContainer.style.display = 'none';
    }
  }

  /** Show the shape the player has chosen. */
  public setShotShape(shape: ShotShape): void {
    this.shotShape = shape;
    this.repaintShotSelector();
  }

  /**
   * Put the shot-type choice in the selector, or hand it back to the shape.
   *
   * One control doing two jobs, because neither is any use where the other one
   * is: you work a ball left or right over two hundred metres, and you decide
   * how it lands over twenty. Two capsules would be one too many on a phone.
   */
  public setShotType(type: ShotType | null): void {
    this.shotType = type;
    this.repaintShotSelector();
  }

  private repaintShotSelector(): void {
    const name = this.container.querySelector('#hud-shape-name');
    const hint = this.container.querySelector('#hud-shape-hint');
    if (!name || !hint) return;

    if (this.shotType) {
      const profile = shotTypeProfile(this.shotType);
      name.textContent = profile.label;
      hint.textContent = `${profile.hint} · Q / E`;
      return;
    }

    name.textContent = this.shotShape;
    hint.textContent = 'SHAPE · Q / E';
  }

  /**
   * Show or hide the bag.
   *
   * Kept apart from the shot mode, because the two are different questions. The
   * mode says which stroke is being played; this says whether there is a choice
   * of club to be made. They agree on the green, where the putter is the only
   * club — but on the fringe you may putt or chip, and tying the selector to the
   * mode meant picking the putter there took the selector away with it.
   */
  public setClubSelectorVisible(visible: boolean): void {
    if (this.clubSelectorCapsule) {
      this.clubSelectorCapsule.style.display = visible ? 'flex' : 'none';
    }
  }

  public setShotMode(mode: ShotMode): void {
    this.shotMode = mode;
    const isPutting = mode === 'PUTTING';
    this.isPuttingMode = isPutting;

    // No shaping a putt: the ball never leaves the ground, so there is nothing to
    // bend. The control goes away on the green rather than sitting there showing
    // a draw the stroke will not play.
    if (this.shapeCapsuleElem) {
      this.shapeCapsuleElem.style.display = isPutting ? 'none' : 'flex';
    }
    if (this.bottomBarElem) {
      if (isPutting) {
        this.bottomBarElem.classList.add('putting-layout');
      } else {
        this.bottomBarElem.classList.remove('putting-layout');
      }
    }
    if (this.cameraBtnElem) {
      this.cameraBtnElem.textContent = isPutting ? 'READ GREEN' : 'VIEW';
    }
    if (this.swingButtonElem) {
      this.swingButtonElem.textContent = isPutting ? 'PUTT' : 'SWING';
    }

    // Strict mode isolation: hide opposing meter container immediately
    if (isPutting) {
      this.swingMeterContainer.style.display = 'none';
    } else {
      this.puttMeterContainer.style.display = 'none';
    }

    this.resetShotFeedback();
  }

  public setPuttingMode(isPutting: boolean): void {
    this.setShotMode(isPutting ? 'PUTTING' : 'FULL_SWING');
  }

  public resetShotFeedback(): void {
    if (this.meterStatusElem) {
      this.meterStatusElem.innerHTML = '<span>PRESS SPACE / CLICK TO SWING</span>';
    }
    if (this.swingButtonElem) {
      this.swingButtonElem.textContent = this.isPuttingMode ? 'PUTT' : 'SWING';
    }
    if (this.meterPowerBar) {
      this.meterPowerBar.style.width = '0%';
    }
    if (this.meterAccMarker) {
      this.meterAccMarker.style.left = '50%';
    }
    if (this.puttMeterBar) {
      this.puttMeterBar.style.width = '0%';
    }
    this.swingMeterContainer.style.display = 'none';
    this.puttMeterContainer.style.display = 'none';
  }

  public configureHole(config: GameHUDHoleConfig): void {
    if (this.headerTitleElem) {
      this.headerTitleElem.textContent = 'SOPHIE SMASHES';
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
    windStr: string = 'CALM'
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
      this.clubNameElem.textContent = club.displayName || club.name;
    }
    if (this.clubDetailElem) {
      this.clubDetailElem.textContent = club.isPutter
        ? 'Putting · 0° loft'
        : `${Math.round(club.carryMetres || club.maxDistanceMetres)}m carry · ` +
          `${Math.round(club.launchAngleDeg || club.loftDegrees)}° loft`;
    }
    if (this.cameraBtnElem && !this.isPuttingMode) {
      this.cameraBtnElem.textContent = `VIEW · ${cameraMode}`;
    }
  }

  public updateSwingMeter(swingMeter: SwingMeter): void {
    if (this.isPuttingMode) return;

    const state = swingMeter.getState();
    const power = swingMeter.getPowerValue();
    const marker = swingMeter.getAccuracyMarker();
    const result = swingMeter.getResult();

    if (state === 'READY') {
      this.swingMeterContainer.style.display = 'none';
      if (this.swingButtonElem) {
        this.swingButtonElem.textContent = 'SWING';
      }
      return;
    }

    this.swingMeterContainer.style.display = 'block';

    if (this.meterPowerBar) {
      this.meterPowerBar.style.width = `${Math.min(100, Math.max(0, power * 100))}%`;
    }

    if (this.meterAccMarker) {
      const leftPct = ((marker + 1.0) / 2.0) * 100;
      this.meterAccMarker.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    }

    if (this.meterStatusElem) {
      if (state === 'POWER_RUNNING') {
        const pct = Math.round(power * 100);
        this.meterStatusElem.innerHTML = `<span style="color: #ffff55; font-weight: bold;">POWER — TAP! (${pct}%)</span>`;
        if (this.swingButtonElem) {
          this.swingButtonElem.textContent = `POWER ${pct}%`;
        }
      } else if (state === 'ACCURACY_RUNNING') {
        this.meterStatusElem.innerHTML = `<span style="color: #63b3ed; font-weight: bold;">ACCURACY — TAP! (LOCK TIMING)</span>`;
        if (this.swingButtonElem) {
          this.swingButtonElem.textContent = 'STRIKE';
        }
      } else if (state === 'IMPACT' || state === 'COMPLETE') {
        if (result) {
          let badgeColor = '#55ffff';
          if (result.strikeQuality === 'PURE') badgeColor = '#55ffff';
          else if (result.strikeQuality === 'SLIGHT') badgeColor = '#68d391';
          else if (result.strikeQuality === 'NOTICEABLE') badgeColor = '#ecc94b';
          else badgeColor = '#fc8181';

          // Say what the ball is actually doing, not just how it was struck: a
          // pure strike on an intended draw is still a draw, and a mistimed one
          // may be something else entirely.
          const flight = describeShotResult(result, this.shotShape);
          const label = flight === 'STRAIGHT' ? result.feedbackText : `${result.feedbackText} · ${flight}`;

          this.meterStatusElem.innerHTML = `<span style="color: ${badgeColor}; font-weight: 900; font-size: 13px; letter-spacing: 1px;">${label}</span>`;
          if (this.swingButtonElem) {
            this.swingButtonElem.textContent = label;
          }
        }
      }
    }
  }

  public updatePuttMeter(puttMeter: PuttMeter): void {
    if (!this.isPuttingMode || this.shotMode !== 'PUTTING') {
      this.puttMeterContainer.style.display = 'none';
      return;
    }

    const state = puttMeter.getState();
    const ratio = puttMeter.getPaceRatio();
    const intendedDist = puttMeter.getIntendedDistance();
    const maxDist = puttMeter.getMaxMeterDistance();
    const targetDist = puttMeter.getTargetDistance();

    if (state === 'AIMING') {
      this.puttMeterContainer.style.display = 'none';
      if (this.swingButtonElem) {
        this.swingButtonElem.textContent = 'PUTT';
      }
      return;
    }

    this.puttMeterContainer.style.display = 'block';

    if (this.puttMeterBar) {
      this.puttMeterBar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
    }

    if (this.puttMeterTargetMarker) {
      const targetPct = (targetDist / maxDist) * 100;
      this.puttMeterTargetMarker.style.left = `${Math.min(100, Math.max(0, targetPct))}%`;
    }

    if (this.puttMeterReadout) {
      this.puttMeterReadout.textContent = `${intendedDist.toFixed(1)} m`;
    }

    if (this.puttTargetElem) {
      this.puttTargetElem.textContent = `PIN ${targetDist.toFixed(1)}m`;
    }

    if (this.puttMeterScaleElem) {
      const targetPct = Math.min(90, Math.max(10, (targetDist / maxDist) * 100));
      this.puttMeterScaleElem.innerHTML = `
        <span>0m</span>
        <span style="position: absolute; left: ${targetPct}%; transform: translateX(-50%); color: #68d391; font-weight: bold;">PIN ${targetDist.toFixed(1)}m</span>
        <span style="position: absolute; right: 0;">${maxDist.toFixed(0)}m</span>
      `;
    }

    if (this.swingButtonElem) {
      if (state === 'CHARGING') {
        this.swingButtonElem.textContent = 'STRIKE';
      } else {
        this.swingButtonElem.textContent = 'PUTT';
      }
    }
  }

  public showPuttingFeedback(distRemaining: number, isHoled: boolean, wasLipOut: boolean): void {
    if (!this.swingButtonElem) return;

    if (isHoled) {
      this.swingButtonElem.textContent = 'HOLED! ⛳';
      return;
    }

    if (wasLipOut) {
      this.swingButtonElem.textContent = 'LIP-OUT! ⚡';
      return;
    }

    if (distRemaining < 0.25) {
      this.swingButtonElem.textContent = 'GOOD PACE · TAP IN';
    } else {
      this.swingButtonElem.textContent = `${distRemaining.toFixed(1)}m REMAINING`;
    }
  }

  /**
   * Draw the card for the round so far.
   *
   * Every hole, not only the ones played: a card you can read forwards tells you
   * what is still coming, which is half of why anyone looks at one.
   */
  public showScorecard(card: Scorecard | null): void {
    if (!this.celebrationCardElem) return;

    if (!card || card.holes.length < 2) {
      this.celebrationCardElem.style.display = 'none';
      return;
    }

    // The total strokes sit under the par for the whole course, so a round in
    // progress reads as "24 against 35" unless the running score against par is
    // there beside it — which is the number a golfer actually wants.
    const relativeClass = card.relativeToPar < 0 ? 'is-under' : card.relativeToPar > 0 ? 'is-over' : 'is-level';

    // One block per nine, each with its own subtotal, then the round's total
    // underneath. Eighteen columns across will not fit a phone, and a printed
    // card does not lay them out that way either.
    const blocks = card.rows.map((row) => {
      const holeCells = row.holes
        .map((hole) => `<th${hole.isCurrent ? ' class="is-current"' : ''}>${hole.number}</th>`)
        .join('');
      const parCells = row.holes.map((hole) => `<th>${hole.par}</th>`).join('');
      const scoreCells = row.holes
        .map((hole) => {
          const classes = `score-${hole.result}${hole.isCurrent ? ' is-current' : ''}`;
          return `<td class="${classes}">${hole.strokes ?? '·'}</td>`;
        })
        .join('');
      const padding = '<th></th>'.repeat(Math.max(0, 9 - row.holes.length));

      return `
        <tr><td class="card-label">HOLE</td>${holeCells}${padding}<th class="card-total">${row.label}</th></tr>
        <tr><td class="card-label">PAR</td>${parCells}${padding}<th class="card-total">${row.par}</th></tr>
        <tr class="card-row-end">
          <td class="card-label">SCORE</td>${scoreCells}${padding}
          <td class="card-total">${row.holesPlayed > 0 ? row.strokes : '·'}</td>
        </tr>
      `;
    }).join('');

    const total = card.rows.length > 1
      ? `
        <tr class="card-grand">
          <td class="card-label">TOTAL</td>
          <td colspan="9">${card.holesPlayed} of ${card.holes.length} holes · par ${card.parTotal}</td>
          <td class="card-total">
            ${card.holesPlayed > 0 ? card.strokesPlayed : '·'}
            ${card.holesPlayed > 0 ? `<span class="card-total-rel ${relativeClass}">${card.relativeLabel}</span>` : ''}
          </td>
        </tr>`
      : `
        <tr class="card-grand">
          <td class="card-label"></td>
          <td colspan="9">par ${card.parTotal}</td>
          <td class="card-total">
            ${card.holesPlayed > 0 ? `<span class="card-total-rel ${relativeClass}">${card.relativeLabel}</span>` : ''}
          </td>
        </tr>`;

    this.celebrationCardBody.innerHTML = blocks + total;
    this.celebrationCardElem.style.display = 'block';
  }

  /**
   * The training board, after a finished round.
   *
   * Four disciplines, two tracks each, and however many sessions the round was
   * worth. Passing null puts it away — it belongs to the end of a round, not to
   * every hole.
   */
  public showTraining(progress: Progress | null, earnedThisRound = 0): void {
    if (!this.trainingElem) return;

    if (!progress) {
      this.trainingElem.style.display = 'none';
      return;
    }

    const spare = progress.sessionsAvailable;
    this.trainingTitleElem.textContent = spare > 0
      ? `TRAINING · ${spare} SESSION${spare === 1 ? '' : 'S'} TO SPEND` +
        (earnedThisRound > 0 ? ` · ${earnedThisRound} EARNED` : '')
      : 'TRAINING · NOTHING LEFT TO SPEND';

    const cell = (discipline: Discipline, attribute: Attribute) => {
      const level = levelOf(progress.abilities, discipline, attribute);
      const maxed = level >= MAX_LEVEL;
      const labels = ABILITY_LABELS[discipline];
      const what = attribute === 'POWER' ? labels.power : labels.accuracy;
      const pips = '●'.repeat(level) + '○'.repeat(MAX_LEVEL - level);

      return `<button class="train-btn${maxed ? ' is-maxed' : ''}"
        data-discipline="${discipline}" data-attribute="${attribute}"
        ${maxed || spare < 1 ? 'disabled' : ''} title="${what}">
        ${what}<span class="train-pips">${pips}</span>
      </button>`;
    };

    this.trainingGridElem.innerHTML = `
      <span></span>
      ${ATTRIBUTES.map((attribute) => `<span class="train-head">${attribute}</span>`).join('')}
      ${DISCIPLINES.map((discipline) => `
        <span class="train-discipline">${ABILITY_LABELS[discipline].name}</span>
        ${ATTRIBUTES.map((attribute) => cell(discipline, attribute)).join('')}
      `).join('')}
    `;

    this.trainingGridElem.querySelectorAll('.train-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const discipline = button.getAttribute('data-discipline') as Discipline;
        const attribute = button.getAttribute('data-attribute') as Attribute;
        this.onTrain?.(discipline, attribute);
      });
    });

    this.trainingElem.style.display = 'block';
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

  /**
   * How far the shot has gone, updated as it goes.
   *
   * `carryMetres` is null until the ball pitches, because until then the distance
   * on screen IS the carry. Once it lands the big number keeps counting with the
   * roll and the carry is held beside it, so both are there at the end.
   */
  public updateFlightDistance(travelledMetres: number, carryMetres: number | null): void {
    if (!this.flightElem) return;

    if (this.flightHideTimer !== null) {
      clearTimeout(this.flightHideTimer);
      this.flightHideTimer = null;
    }

    this.flightElem.classList.add('is-visible');
    this.flightValueElem.textContent = String(Math.round(travelledMetres));
    this.flightDetailElem.textContent = carryMetres === null
      ? 'CARRY'
      : `CARRY ${Math.round(carryMetres)} m`;
  }

  /**
   * Leave the finished number up for a moment before clearing it.
   *
   * The distance the shot went is the thing the player wants to read once it has
   * stopped, and clearing it the instant the ball settles is the one moment it
   * is no longer moving enough to read.
   */
  public settleFlightDistance(holdSeconds = 3.5): void {
    if (!this.flightElem || !this.flightElem.classList.contains('is-visible')) return;

    if (this.flightHideTimer !== null) clearTimeout(this.flightHideTimer);
    this.flightHideTimer = setTimeout(() => {
      this.flightElem.classList.remove('is-visible');
      this.flightHideTimer = null;
    }, holdSeconds * 1000);
  }

  public hideFlightDistance(): void {
    if (!this.flightElem) return;

    if (this.flightHideTimer !== null) {
      clearTimeout(this.flightHideTimer);
      this.flightHideTimer = null;
    }
    this.flightElem.classList.remove('is-visible');
  }

  public showPenalty(headline: string, detail: string): void {
    this.showBanner(headline, detail, 'PENALTY');
  }

  /**
   * A banner for something that happened to the shot.
   *
   * Two tones: a penalty, and something that merely went wrong. Finding a tree
   * costs no stroke, so it is not dressed as a ruling — but the player does need
   * telling, or a drive that stops at 74 metres looks like the game breaking
   * rather than a ball in the branches.
   */
  public showBanner(headline: string, detail: string, tone: 'PENALTY' | 'EVENT' = 'EVENT'): void {
    const penalty = tone === 'PENALTY';
    this.penaltyBanner.style.background = penalty ? 'rgba(48, 20, 6, 0.94)' : 'rgba(14, 34, 16, 0.94)';
    this.penaltyBanner.style.borderColor = penalty ? '#ffaa33' : '#7ec473';
    this.penaltyBanner.style.color = penalty ? '#ffe8bb' : '#d8f2d0';

    this.penaltyBanner.innerHTML = `<strong>${headline}</strong><div>${detail}</div>`;
    this.penaltyBanner.style.display = 'block';
    setTimeout(() => { this.penaltyBanner.style.display = 'none'; }, 4000);
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

    // Everything but how far up the screen they sit, which is a stylesheet rule
    // so it can move with the bottom bar on a narrow screen. Set inline it would
    // outrank the media query and the meter would sit behind the controls.
    for (const meter of [this.swingMeterContainer, this.puttMeterContainer]) {
      meter.style.position = 'absolute';
      meter.style.left = '50%';
      meter.style.transform = 'translateX(-50%)';
      meter.style.zIndex = '40';
      meter.style.pointerEvents = 'auto';
      meter.style.display = 'none';
    }

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
      // Below the top bar and the flight readout, both of which are taller on a
      // phone than they are on a desktop.
      display: 'none', position: 'absolute', top: '128px', left: '50%', transform: 'translateX(-50%)',
      maxWidth: 'calc(100% - 24px)',
      background: 'rgba(48, 20, 6, 0.94)', border: '2px solid #ffaa33', color: '#ffe8bb',
      padding: '8px 18px', textAlign: 'center', fontFamily: "'Courier New', monospace", zIndex: '70',
      borderRadius: '8px'
    });
  }

  private handleTriggerAction(e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const now = performance.now();
    if (now - this.lastInputTime < 60) return;
    this.lastInputTime = now;

    if (this.isPuttingMode) {
      this.onPuttTrigger?.();
    } else {
      this.onSwingTrigger?.();
    }
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <!-- Top Minimal Bar -->
      <div class="hud-topbar">
        <div class="hud-capsule hud-main-info">
          <div class="hud-hole-tag"><strong id="hud-hole-number">1</strong></div>
          <div class="hud-text-stack">
            <div id="hud-title">⛳ SOPHIE SMASHES</div>
            <div id="hud-subtitle">Sophie Hills · Hole 1 · PAR 4 · 234m</div>
          </div>
        </div>

        <div class="hud-capsule hud-shot-info">
          <span id="hud-stroke" class="hud-highlight">STROKE 1</span>
          <span id="hud-dist" class="hud-accent">234.0 m TO PIN</span>
          <span id="hud-wind">WIND CALM</span>
          <span id="hud-lie">LIE <strong style="color: #68d391;">TEE (100%)</strong></span>
        </div>

        <div class="hud-capsule hud-nav-actions">
          <button id="btn-hud-cam" class="hud-btn">VIEW</button>
          <button id="btn-hud-replay" class="hud-btn" style="color: #fbd38d;">MENU</button>
        </div>
      </div>

      <!-- Live distance while the ball is in the air -->
      <div class="hud-capsule hud-flight" id="hud-flight">
        <span id="hud-flight-value">0</span><span class="hud-flight-unit">m</span>
        <span id="hud-flight-detail">CARRY</span>
      </div>

      <!-- Bottom Responsive Bar -->
      <div class="hud-bottombar" id="hud-bottombar-container">
        <!-- Left Block: Club Selector (Hidden in Putting Mode) -->
        <div class="hud-capsule hud-club-selector" id="hud-club-capsule">
          <button id="btn-club-prev" class="hud-ctrl-btn" aria-label="Previous club">‹</button>
          <div class="hud-club-display">
            <div id="hud-club-name">DRIVER</div>
            <div id="hud-club-detail">230m carry · 11° loft</div>
          </div>
          <button id="btn-club-next" class="hud-ctrl-btn" aria-label="Next club">›</button>
        </div>

        <!-- Center Block: Aim Controls -->
        <div class="hud-capsule hud-aim-controls">
          <button id="btn-aim-left" class="hud-ctrl-btn" aria-label="Aim left">◀</button>
          <span class="hud-aim-label">AIM</span>
          <button id="btn-aim-right" class="hud-ctrl-btn" aria-label="Aim right">▶</button>
        </div>

        <!-- Shot shape: work the ball left or right -->
        <div class="hud-capsule hud-shape-controls" id="hud-shape-capsule">
          <button id="btn-shape-left" class="hud-ctrl-btn" aria-label="Shape draw">◀</button>
          <div class="hud-shape-readout">
            <div id="hud-shape-name">STRAIGHT</div>
            <div id="hud-shape-hint">SHAPE · Q / E</div>
          </div>
          <button id="btn-shape-right" class="hud-ctrl-btn" aria-label="Shape fade">▶</button>
        </div>

        <!-- Right Block: Swing / Putt Button -->
        <button id="btn-trigger-swing" class="hud-swing-btn" type="button">SWING</button>
      </div>

      <style>
        .hud-topbar {
          position: absolute;
          top: max(8px, env(safe-area-inset-top));
          left: max(8px, env(safe-area-inset-left));
          right: max(8px, env(safe-area-inset-right));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          pointer-events: auto;
          box-sizing: border-box;
          z-index: 35;
        }
        .hud-capsule {
          display: flex;
          align-items: center;
          background: rgba(10, 25, 18, 0.90);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          color: #f7fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
          padding: 4px 8px;
          font-size: 11px;
          box-sizing: border-box;
          min-width: 0;
        }
        .hud-hole-tag {
          background: #48bb78;
          color: #062414;
          font-weight: 900;
          font-size: 13px;
          padding: 1px 6px;
          border-radius: 4px;
          margin-right: 6px;
        }
        .hud-text-stack { display: flex; flex-direction: column; min-width: 0; }
        #hud-title { font-weight: 800; font-size: 11px; color: #fbd38d; white-space: nowrap; }
        #hud-subtitle { font-size: 9px; color: #cbd5e0; white-space: nowrap; }
        .hud-shot-info { gap: 10px; font-weight: 700; }
        .hud-highlight { color: #f6e05e; }
        .hud-accent { color: #63b3ed; }
        .hud-nav-actions { margin-left: auto; gap: 4px; padding: 3px 6px; }
        .hud-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e2e8f0;
          padding: 4px 8px;
          border-radius: 5px;
          font-weight: 700;
          font-size: 10px;
          cursor: pointer;
        }
        .hud-btn:hover { background: rgba(255, 255, 255, 0.2); }

        /* Responsive Bottom Bar with safe areas */
        .hud-bottombar {
          position: absolute;
          bottom: max(10px, env(safe-area-inset-bottom));
          left: max(8px, env(safe-area-inset-left));
          right: max(8px, env(safe-area-inset-right));
          margin: 0 auto;
          max-width: 760px;
          display: grid;
          grid-template-columns: 1.15fr 0.7fr 0.95fr 0.95fr;
          align-items: center;
          gap: 6px;
          pointer-events: auto;
          box-sizing: border-box;
          z-index: 35;
        }

        .hud-bottombar.putting-layout {
          grid-template-columns: 1fr 1.2fr;
          max-width: 440px;
        }

        .hud-club-selector {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px;
          min-width: 0;
        }
        .hud-ctrl-btn {
          background: rgba(255, 255, 255, 0.14);
          border: 0;
          color: white;
          font-weight: 800;
          font-size: 13px;
          padding: 5px 8px;
          border-radius: 5px;
          cursor: pointer;
          user-select: none;
          touch-action: manipulation;
          flex-shrink: 0;
        }
        .hud-ctrl-btn:hover { background: rgba(246, 224, 94, 0.3); color: #f6e05e; }
        .hud-club-display {
          text-align: center;
          flex: 1;
          min-width: 0;
          padding: 0 4px;
          overflow: hidden;
        }
        #hud-club-name {
          font-weight: 800;
          font-size: 11px;
          color: #fbd38d;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #hud-club-detail {
          font-size: 8.5px;
          color: #a0aec0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hud-aim-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px;
          min-width: 0;
        }
        .hud-shape-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px;
          min-width: 0;
          gap: 2px;
        }
        .hud-shape-readout {
          text-align: center;
          padding: 0 4px;
          min-width: 74px;
        }
        #hud-shape-name {
          font-size: 11px;
          font-weight: 800;
          color: #f6e05e;
          white-space: nowrap;
        }
        #hud-shape-hint {
          font-size: 8px;
          font-weight: 700;
          color: #8a97a8;
          white-space: nowrap;
        }
        .hud-aim-label {
          font-size: 9.5px;
          font-weight: 800;
          color: #cbd5e0;
          padding: 0 2px;
          white-space: nowrap;
        }

        .hud-swing-btn {
          background: linear-gradient(180deg, #48bb78, #2f855a);
          border: 1px solid #68d391;
          color: white;
          font-weight: 900;
          font-size: 13px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(47, 133, 90, 0.45);
          letter-spacing: 0.5px;
          user-select: none;
          touch-action: manipulation;
          text-align: center;
          width: 100%;
          box-sizing: border-box;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hud-swing-btn:hover { background: linear-gradient(180deg, #68d391, #38a169); }
        .hud-swing-btn:active { transform: scale(0.97); }

        /*
         * The shot, as it happens.
         *
         * Watching a ball fly with no number on it, you cannot tell 190 from 240
         * until it lands and the readout jumps to whatever is left to the pin.
         * This counts up with the ball, freezes on the carry when it pitches,
         * then settles on the total once it stops rolling.
         */
        /* Clear of the bottom bar, which is one row on a desktop and two on a
           phone. */
        #sophie-swing-meter, #sophie-putt-meter { bottom: 68px; }

        .hud-flight {
          position: absolute;
          top: 78px;
          left: 50%;
          transform: translateX(-50%);
          display: none;
          align-items: baseline;
          gap: 4px;
          padding: 5px 14px;
          font-variant-numeric: tabular-nums;
          z-index: 36;
        }
        .hud-flight.is-visible { display: flex; }
        #hud-flight-value {
          font-size: 26px;
          font-weight: 900;
          color: #f6e05e;
          letter-spacing: 1px;
          line-height: 1;
        }
        .hud-flight-unit {
          font-size: 13px;
          font-weight: 700;
          color: #f6e05e;
          opacity: 0.8;
        }
        #hud-flight-detail {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #a0d8b3;
          margin-left: 6px;
        }

        @media (max-width: 768px) {
          .hud-shot-info { font-size: 10px; gap: 6px; }
          #hud-subtitle { display: none; }
          .hud-bottombar {
            grid-template-columns: 1.1fr 0.65fr 0.9fr 0.9fr;
            gap: 4px;
          }
          .hud-bottombar.putting-layout {
            grid-template-columns: 1fr 1.2fr;
          }
          #hud-club-name { font-size: 10px; }
          #hud-club-detail { font-size: 8px; }
          .hud-swing-btn { font-size: 12px; padding: 7px 6px; }
        }

        /*
         * Phone-shaped screens.
         *
         * Four controls abreast is a desktop toolbar. At 400px each one gets
         * about 90px, which truncates the club to "230m car..." and leaves the
         * swing button lying across the shape control. So the row becomes two:
         * the settings you adjust along the top, and the button you actually
         * press across the bottom, where a thumb reaches it.
         *
         * The top bar splits the same way rather than wrapping by accident —
         * name and menu on one line, the shot's numbers on their own line under
         * it, wind included. Wind used to be dropped on small screens, which was
         * fair enough when it did nothing and is not now.
         */
        @media (max-width: 560px) {
          #sophie-swing-meter, #sophie-putt-meter { bottom: 108px; }

          /* Clear of the two-line top bar. */
          .hud-flight { top: 96px; }
          #hud-flight-value { font-size: 22px; }

          .hud-topbar { flex-wrap: wrap; gap: 4px; }
          .hud-main-info { order: 1; flex: 1 1 auto; min-width: 0; }
          .hud-nav-actions { order: 2; flex: 0 0 auto; }
          .hud-shot-info {
            order: 3;
            flex: 1 0 100%;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 2px 8px;
          }
          /* Each reading stays whole: a wind that needs two lines takes two
             lines, rather than breaking across "336.3 m TO / PIN". */
          .hud-shot-info > span { white-space: nowrap; }
          #hud-title { font-size: 11px; }

          .hud-bottombar {
            grid-template-columns: 1.25fr 0.7fr 1fr;
            grid-template-areas:
              "club aim shape"
              "swing swing swing";
            gap: 5px;
            max-width: none;
          }
          #hud-club-capsule { grid-area: club; }
          .hud-aim-controls { grid-area: aim; }
          #hud-shape-capsule { grid-area: shape; }
          #btn-trigger-swing { grid-area: swing; }

          .hud-bottombar.putting-layout {
            grid-template-columns: 1fr;
            grid-template-areas:
              "aim"
              "swing";
          }

          .hud-ctrl-btn { padding: 6px 8px; font-size: 12px; }
          #hud-club-name { font-size: 10px; }
          #hud-club-detail { font-size: 8px; }
          /* The one control that is pressed every shot, sized to be pressed. */
          .hud-swing-btn { font-size: 14px; padding: 11px 6px; }
        }

        @media (max-width: 360px) {
          .hud-shot-info { font-size: 9px; }
          #hud-club-detail { display: none; }
        }
      </style>
    `;

    this.strokeElem = this.container.querySelector('#hud-stroke')!;
    this.distElem = this.container.querySelector('#hud-dist')!;
    this.lieElem = this.container.querySelector('#hud-lie')!;
    this.windElem = this.container.querySelector('#hud-wind')!;
    this.clubSelectorCapsule = this.container.querySelector('#hud-club-capsule')!;
    this.shapeCapsuleElem = this.container.querySelector('#hud-shape-capsule')!;
    this.clubNameElem = this.container.querySelector('#hud-club-name')!;
    this.clubDetailElem = this.container.querySelector('#hud-club-detail')!;
    this.cameraBtnElem = this.container.querySelector('#btn-hud-cam')!;
    this.headerTitleElem = this.container.querySelector('#hud-title')!;
    this.headerSubtitleElem = this.container.querySelector('#hud-subtitle')!;
    this.swingButtonElem = this.container.querySelector('#btn-trigger-swing')!;
    this.bottomBarElem = this.container.querySelector('#hud-bottombar-container')!;
    this.flightElem = this.container.querySelector('#hud-flight')!;
    this.flightValueElem = this.container.querySelector('#hud-flight-value')!;
    this.flightDetailElem = this.container.querySelector('#hud-flight-detail')!;

    this.container.querySelector('#btn-hud-cam')?.addEventListener('click', () => {
      if (this.isPuttingMode) {
        this.onReadGreenToggle?.();
      } else {
        this.onCameraToggle?.();
      }
    });
    this.container.querySelector('#btn-hud-replay')?.addEventListener('click', () => this.onResetLayout?.());

    this.container.querySelector('#btn-club-prev')?.addEventListener('click', () => this.onClubPrev?.());
    this.container.querySelector('#btn-club-next')?.addEventListener('click', () => this.onClubNext?.());
    this.container.querySelector('#btn-aim-left')?.addEventListener('click', () => this.onAimLeft?.());
    this.container.querySelector('#btn-shape-left')?.addEventListener('click', () => this.onShapeLeft?.());
    this.container.querySelector('#btn-shape-right')?.addEventListener('click', () => this.onShapeRight?.());
    this.container.querySelector('#btn-aim-right')?.addEventListener('click', () => this.onAimRight?.());

    this.swingButtonElem.addEventListener('pointerdown', (e) => this.handleTriggerAction(e));
  }

  private buildSwingMeterHTML(): void {
    this.swingMeterContainer.innerHTML = `
      <div class="swing-popup-panel">
        <div class="swing-status-bar" id="meter-status">
          <span>PRESS SPACE / CLICK TO SWING</span>
        </div>
        <div class="meter-tracks">
          <div class="meter-track-label">POWER (CLICK 2)</div>
          <div class="power-track">
            <div id="meter-power-bar"></div>
            <span class="mark-50">50%</span>
            <span class="mark-100">100%</span>
          </div>

          <div class="meter-track-label">ACCURACY (CLICK 3)</div>
          <div class="accuracy-track">
            <div class="late-zone">LATE ▶</div>
            <div class="good-zone"></div>
            <div class="sweet-spot"></div>
            <div class="early-zone">◀ EARLY</div>
            <div class="center-line"></div>
            <div id="meter-acc-marker"></div>
          </div>
        </div>
      </div>
      <style>
        .swing-popup-panel {
          width: 320px;
          max-width: calc(100vw - 20px);
          box-sizing: border-box;
          background: rgba(8, 22, 14, 0.95);
          border: 2px solid #48bb78;
          border-radius: 10px;
          padding: 8px 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
          color: white;
          font-family: monospace;
          user-select: none;
          touch-action: manipulation;
        }
        .swing-status-bar {
          text-align: center;
          font-weight: 800;
          font-size: 12px;
          margin-bottom: 6px;
          color: #f6e05e;
          min-height: 16px;
        }
        .meter-track-label {
          font-size: 9px;
          font-weight: 700;
          color: #a0aec0;
          letter-spacing: 0.5px;
          margin-top: 2px;
        }
        .meter-tracks { display: flex; flex-direction: column; gap: 4px; }
        .power-track, .accuracy-track {
          height: 16px;
          background: #1a202c;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        #meter-power-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #48bb78 0%, #ecc94b 75%, #e53e3e 100%);
        }
        .mark-50 { position: absolute; left: 50%; top: 1px; font-size: 8px; color: #cbd5e0; transform: translateX(-50%); }
        .mark-100 { position: absolute; right: 4px; top: 1px; font-size: 8px; color: #cbd5e0; }

        .accuracy-track {
          display: flex;
          align-items: center;
        }
        .late-zone {
          position: absolute;
          left: 6px;
          font-size: 8px;
          color: #fc8181;
          font-weight: bold;
          z-index: 1;
        }
        .early-zone {
          position: absolute;
          right: 6px;
          font-size: 8px;
          color: #fc8181;
          font-weight: bold;
          z-index: 1;
        }
        .good-zone {
          position: absolute;
          left: 35%;
          width: 30%;
          height: 100%;
          background: rgba(72, 187, 120, 0.25);
        }
        .sweet-spot {
          position: absolute;
          left: 46%;
          width: 8%;
          height: 100%;
          background: #48bb78;
          border-radius: 2px;
          box-shadow: 0 0 6px rgba(72, 187, 120, 0.8);
        }
        .center-line {
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ffffff;
          transform: translateX(-50%);
          z-index: 2;
        }
        #meter-acc-marker {
          position: absolute;
          left: 100%;
          top: 0;
          width: 5px;
          height: 100%;
          background: #ffff00;
          border: 1px solid #ffffff;
          box-shadow: 0 0 6px #ffff00;
          transform: translateX(-50%);
          z-index: 3;
        }
      </style>
    `;

    this.meterPowerBar = this.swingMeterContainer.querySelector('#meter-power-bar')!;
    this.meterAccMarker = this.swingMeterContainer.querySelector('#meter-acc-marker')!;
    this.meterStatusElem = this.swingMeterContainer.querySelector('#meter-status')!;

    this.swingMeterContainer.addEventListener('pointerdown', (e) => this.handleTriggerAction(e));
  }

  private buildPuttMeterHTML(): void {
    this.puttMeterContainer.innerHTML = `
      <div class="putt-popup-panel">
        <div class="putt-header">
          <span class="putt-badge">PUTT PACE</span>
          <span class="putt-readout" id="putt-readout-text">0.0 m</span>
          <span class="putt-target" id="putt-target-text">PIN 5.0m</span>
        </div>
        <div class="putt-track-container">
          <div class="putt-track">
            <div id="putt-power-bar"></div>
            <div id="putt-target-marker"></div>
          </div>
          <div class="putt-scale" id="putt-scale-marks">
            <span>0m</span>
            <span style="color: #68d391; font-weight: bold;">PIN</span>
            <span>10m</span>
          </div>
        </div>
      </div>
      <style>
        .putt-popup-panel {
          width: 260px;
          max-width: calc(100vw - 20px);
          box-sizing: border-box;
          background: rgba(8, 22, 14, 0.95);
          border: 2px solid #55ffff;
          border-radius: 8px;
          padding: 6px 10px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
          color: white;
          font-family: monospace;
          user-select: none;
          touch-action: manipulation;
        }
        .putt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .putt-badge {
          background: #55ffff;
          color: #062414;
          font-weight: 900;
          font-size: 9.5px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .putt-readout {
          font-weight: 800;
          color: #f6e05e;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        .putt-target {
          font-size: 9.5px;
          color: #a0aec0;
          font-weight: bold;
        }
        .putt-track {
          height: 12px;
          background: #1a202c;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        #putt-power-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #48bb78 0%, #55ffff 75%, #fc8181 100%);
        }
        #putt-target-marker {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #f6e05e;
          box-shadow: 0 0 6px #f6e05e;
          transform: translateX(-50%);
          z-index: 2;
        }
        .putt-scale {
          display: flex;
          justify-content: space-between;
          position: relative;
          font-size: 8px;
          color: #a0aec0;
          margin-top: 2px;
        }
      </style>
    `;

    this.puttMeterBar = this.puttMeterContainer.querySelector('#putt-power-bar')!;
    this.puttMeterTargetMarker = this.puttMeterContainer.querySelector('#putt-target-marker')!;
    this.puttMeterReadout = this.puttMeterContainer.querySelector('#putt-readout-text')!;
    this.puttTargetElem = this.puttMeterContainer.querySelector('#putt-target-text')!;
    this.puttMeterScaleElem = this.puttMeterContainer.querySelector('#putt-scale-marks')!;

    this.puttMeterContainer.addEventListener('pointerdown', (e) => this.handleTriggerAction(e));
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
        <div id="celeb-card" style="display:none;">
          <div class="celeb-card-title">SCORECARD</div>
          <table id="celeb-card-table"><tbody></tbody></table>
        </div>
        <div id="celeb-training" style="display:none;">
          <div class="celeb-card-title" id="celeb-training-title">TRAINING</div>
          <div id="celeb-training-grid"></div>
        </div>
        <p id="celeb-course" style="font-size: 11px; color: #aaffaa; margin: 14px 0 18px;">Warragul Country Club · Hole 6 · Par 4</p>
        <p id="celeb-progress" style="display:none; color:#ffe66d; font-size:11px;"></p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="btn-celeb-play-again" style="background: #22aa22; border: 2px solid #77ff77; color: #ffffff; padding: 12px 24px; font-family: inherit; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 6px;">↻ PLAY AGAIN</button>
          <button id="btn-celeb-title" style="background:#18331a; border:2px solid #77aa77; color:#ddffdd; font-family:inherit; font-weight:bold;">⌂ MAIN MENU</button>
        </div>
        <style>
          .celeb-card-title {
            color: #8ee89b; font-size: 9px; letter-spacing: 3px; margin-bottom: 5px;
          }
          #celeb-card-table {
            width: 100%; border-collapse: collapse; font-family: inherit;
            font-variant-numeric: tabular-nums;
          }
          #celeb-card-table th, #celeb-card-table td {
            border: 1px solid #2f6b3a; padding: 3px 0; text-align: center; width: 10%;
          }
          #celeb-card-table th {
            color: #8fbe97; font-size: 9px; font-weight: 700;
          }
          #celeb-card-table td { font-size: 13px; font-weight: 800; color: #dff5e2; }
          #celeb-card-table .card-label {
            color: #8fbe97; font-size: 9px; font-weight: 700; width: 12%; text-align: right;
            padding-right: 5px; border: 0;
          }
          #celeb-card-table .card-total {
            background: #0b2410; color: #fff07a; line-height: 1.1;
          }
          #celeb-card-table .card-total-rel {
            display: block; font-size: 9px; font-weight: 700;
          }
          #celeb-card-table .is-under { color: #8bff8b; }
          #celeb-card-table .is-level { color: #dff5e2; }
          #celeb-card-table .is-over { color: #ffb36b; }
          /* Scored against par rather than in the abstract: the eye should find
             the birdies and the blow-ups without reading every number. */
          #celeb-card-table .score-EAGLE_OR_BETTER { color: #7df5ff; }
          #celeb-card-table .score-BIRDIE { color: #8bff8b; }
          #celeb-card-table .score-PAR { color: #ffffff; }
          #celeb-card-table .score-BOGEY { color: #ffe066; }
          #celeb-card-table .score-WORSE { color: #ff8a6b; }
          #celeb-card-table .score-UNPLAYED { color: #46704e; }
          #celeb-card-table .is-current { outline: 2px solid #55ff55; outline-offset: -2px; }
          #celeb-card-table .card-row-end td, #celeb-card-table .card-row-end th {
            border-bottom: 2px solid #2f6b3a;
          }
          #celeb-card-table .card-grand td {
            border: 0; padding-top: 5px; color: #8fbe97; font-size: 9px; font-weight: 700;
            letter-spacing: 1px;
          }
          #celeb-card-table .card-grand .card-total {
            background: #0b2410; color: #fff07a; font-size: 13px; font-weight: 800;
            border: 1px solid #2f6b3a;
          }

          #celeb-training { margin-top: 14px; }
          #celeb-training-grid {
            display: grid; grid-template-columns: auto 1fr 1fr; gap: 4px; align-items: center;
          }
          .train-discipline {
            color: #dff5e2; font-size: 10px; font-weight: 800; letter-spacing: 1px;
            text-align: right; padding-right: 6px;
          }
          .train-head { color: #8fbe97; font-size: 9px; letter-spacing: 2px; }
          .train-btn {
            background: #113019; border: 1px solid #2f6b3a; color: #dff5e2;
            font-family: inherit; font-size: 10px; font-weight: 700; padding: 5px 4px;
            border-radius: 4px; cursor: pointer; text-align: center; line-height: 1.35;
          }
          .train-btn .train-pips { display: block; letter-spacing: 2px; color: #fff07a; font-size: 11px; }
          .train-btn:enabled:hover { background: #1c5028; border-color: #55ff55; }
          .train-btn:disabled { opacity: 0.45; cursor: default; }
          .train-btn.is-maxed { border-color: #55ff55; color: #8bff8b; }

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
    this.celebrationCardElem = this.celebrationModal.querySelector('#celeb-card')!;
    this.celebrationCardBody = this.celebrationModal.querySelector('#celeb-card-table tbody')!;
    this.trainingElem = this.celebrationModal.querySelector('#celeb-training')!;
    this.trainingTitleElem = this.celebrationModal.querySelector('#celeb-training-title')!;
    this.trainingGridElem = this.celebrationModal.querySelector('#celeb-training-grid')!;
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
