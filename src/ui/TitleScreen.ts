import { TeeBoxId } from '../game/RoundSetup';

/** One tee the course can be played from, as the title screen offers it. */
export interface TeeChoice {
  id: TeeBoxId;
  name: string;
  /** Length of the opening hole from this tee, as a sample of what it changes. */
  lengthMetres: number;
}

export interface TitleScreenOptions {
  courseName: string;
  courseSubtitle: string;
  holeCount: number;
  totalPar: number;
  onStart: () => void;
  onOpenPractice?: () => void;
  onTeeChange?: (choice: TeeBoxId) => void;
}

export class TitleScreen {
  private readonly container: HTMLElement;
  private readonly onTeeChange?: (choice: TeeBoxId) => void;

  constructor(options: TitleScreenOptions) {
    this.onTeeChange = options.onTeeChange;
    this.container = document.createElement('div');
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Sophie Smashes title screen');
    this.container.innerHTML = `
      <div class="title-card">
        <div class="title-kicker">A 16-BIT GOLF STORY</div>
        <h1>SOPHIE<br/><span class="title-smashes">SMASHES</span></h1>
        <div class="title-divider"></div>
        <div class="title-course">${options.courseName}</div>
        <div class="title-hole">${options.courseSubtitle}</div>
        <div class="title-stats">
          <span>${options.holeCount} HOLES</span>
          <span>PAR ${options.totalPar}</span>
        </div>
        <div class="title-tees" id="title-tees"></div>
        <button id="btn-title-start" class="title-primary">START ROUND</button>
        <div class="title-controls">SPACE: SWING &nbsp; A/D: AIM &nbsp; W/S: CLUB &nbsp; M: VIEW</div>
      </div>
      <style>
        .title-card {
          width: min(480px, calc(100vw - 32px));
          padding: 32px 34px 28px;
          border: 4px solid #f5d94f;
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(8, 30, 17, 0.97), rgba(4, 16, 10, 0.98));
          box-shadow: 0 0 0 5px #173b22, 0 18px 60px rgba(0, 0, 0, 0.72);
          text-align: center;
          color: #e8ffe8;
          font-family: 'Courier New', monospace;
        }
        .title-kicker { color: #8bdaa0; font-size: 11px; letter-spacing: 4px; font-weight: bold; }
        .title-card h1 {
          margin: 8px 0 0;
          color: #fff6a0;
          font-size: clamp(38px, 7.5vw, 64px);
          line-height: 0.85;
          letter-spacing: 6px;
          text-shadow: 4px 4px 0 #285b31;
        }
        .title-card h1 span.title-smashes {
          color: #fbd34d;
          text-shadow: 4px 4px 0 #854d0e, 0 0 16px rgba(251, 211, 77, 0.4);
          letter-spacing: 7px;
          display: inline-block;
          margin-top: 4px;
        }
        .title-divider { height: 3px; margin: 20px auto 14px; max-width: 300px; background: linear-gradient(90deg, transparent, #f5d94f, transparent); }
        .title-course { color: #65f276; font-size: 20px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
        .title-hole { margin-top: 3px; color: #d8f3dc; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; }
        .title-stats { display: flex; justify-content: center; gap: 14px; margin: 18px 0 22px; }
        .title-stats span { min-width: 100px; padding: 8px 12px; border: 2px solid #4f9d61; background: #0e2b18; color: #f9e86d; font-size: 13px; font-weight: bold; letter-spacing: 1px; border-radius: 4px; }
        .title-tees { display: flex; gap: 6px; margin-bottom: 14px; }
        .title-tees:empty { display: none; }
        .title-tee {
          flex: 1; padding: 8px 4px; border: 2px solid #3f7d52; border-radius: 4px;
          background: #0b2413; color: #bfe6c7; cursor: pointer;
          font: bold 11px 'Courier New', monospace; letter-spacing: 1px;
        }
        .title-tee small { display: block; margin-top: 3px; font-weight: normal; font-size: 10px; color: #8bbf99; }
        .title-tee:hover { border-color: #6fc084; color: #eafff0; }
        .title-tee.is-chosen { border-color: #f5d94f; background: #1d3d21; color: #ffef9f; }
        .title-tee.is-chosen small { color: #d9c86a; }
        .title-primary { width: 100%; font: bold 16px 'Courier New', monospace; cursor: pointer; border-radius: 6px; padding: 14px; border: 3px solid #b4ff9a; background: #269b3c; color: white; box-shadow: 0 4px 0 #0b4c1a; letter-spacing: 2px; }
        .title-primary:hover { background: #38bd50; transform: translateY(-1px); }
        .title-primary:active { transform: translateY(2px); box-shadow: 0 2px 0 #0b4c1a; }
        .title-controls { margin-top: 18px; color: #9bc8a5; font-size: 10px; line-height: 1.6; }
        @media (max-width: 620px) {
          .title-card { padding: 24px 18px 20px; }
          .title-controls { display: none; }
        }
      </style>
    `;

    this.container.style.position = 'absolute';
    this.container.style.inset = '0';
    this.container.style.display = 'none';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.padding = '16px';
    this.container.style.background = 'radial-gradient(circle at 50% 45%, rgba(15, 70, 31, 0.42), rgba(2, 10, 6, 0.88))';
    this.container.style.zIndex = '120';

    this.container.querySelector('#btn-title-start')?.addEventListener('click', options.onStart);
    document.body.appendChild(this.container);
  }

  /**
   * Offer the tees, with the chosen one marked.
   *
   * The length shown is the opening hole's, not the course's: it is there to
   * say what the choice does, and the first hole is the one the player is about
   * to stand on. A course offering a single tee shows no buttons at all.
   */
  public setTeeChoice(chosen: TeeBoxId, choices: TeeChoice[]): void {
    const tees = this.container.querySelector('#title-tees');
    if (!tees) return;

    if (choices.length < 2) {
      tees.innerHTML = '';
      return;
    }

    tees.innerHTML = choices
      .map((choice) => `
        <button class="title-tee${choice.id === chosen ? ' is-chosen' : ''}" data-tee="${choice.id}">
          ${choice.name.replace(' TEE', '')}<small>1st · ${choice.lengthMetres}m</small>
        </button>
      `)
      .join('');

    tees.querySelectorAll('.title-tee').forEach((button) => {
      button.addEventListener('click', () => {
        this.onTeeChange?.(button.getAttribute('data-tee') as TeeBoxId);
      });
    });
  }

  public updateConfig(options: Partial<TitleScreenOptions>): void {
    if (options.courseName) {
      const courseElem = this.container.querySelector('.title-course');
      if (courseElem) courseElem.textContent = options.courseName;
    }
    if (options.courseSubtitle) {
      const holeElem = this.container.querySelector('.title-hole');
      if (holeElem) holeElem.textContent = options.courseSubtitle;
    }
    if (options.holeCount !== undefined || options.totalPar !== undefined) {
      const statsElem = this.container.querySelector('.title-stats');
      if (statsElem) {
        statsElem.innerHTML = `
          <span>${options.holeCount ?? 9} HOLES</span>
          <span>PAR ${options.totalPar ?? 35}</span>
        `;
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }
}

