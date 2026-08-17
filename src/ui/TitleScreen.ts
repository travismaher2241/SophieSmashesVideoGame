export interface TitleScreenOptions {
  courseName: string;
  courseSubtitle: string;
  holeCount: number;
  totalPar: number;
  onStart: () => void;
  onOpenPractice: () => void;
}

export class TitleScreen {
  private readonly container: HTMLElement;

  constructor(options: TitleScreenOptions) {
    this.container = document.createElement('div');
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Sophie Golf title screen');
    this.container.innerHTML = `
      <div class="title-card">
        <div class="title-kicker">A 16-BIT GOLF STORY</div>
        <h1>SOPHIE<br/><span>GOLF</span></h1>
        <div class="title-divider"></div>
        <div class="title-course">${options.courseName}</div>
        <div class="title-hole">${options.courseSubtitle}</div>
        <div class="title-stats">
          <span>${options.holeCount} HOLES</span>
          <span>PAR ${options.totalPar}</span>
          <span>PREVIEW</span>
        </div>
        <button id="btn-title-start" class="title-primary">START ROUND</button>
        <button id="btn-title-practice" class="title-secondary">WARRAGUL RESEARCH MODE</button>
        <div class="title-controls">SPACE: SWING &nbsp; A/D: AIM &nbsp; W/S: CLUB &nbsp; M: VIEW</div>
        <div class="title-note">Sophie Hills is fictional. Warragul course data remains separate until verified.</div>
      </div>
      <style>
        .title-card {
          width: min(520px, calc(100vw - 32px));
          padding: 30px 34px 26px;
          border: 4px solid #f5d94f;
          border-radius: 10px;
          background: linear-gradient(180deg, rgba(8, 30, 17, 0.97), rgba(4, 16, 10, 0.98));
          box-shadow: 0 0 0 5px #173b22, 0 18px 60px rgba(0, 0, 0, 0.72);
          text-align: center;
          color: #e8ffe8;
          font-family: 'Courier New', monospace;
        }
        .title-kicker { color: #8bdaa0; font-size: 11px; letter-spacing: 4px; font-weight: bold; }
        .title-card h1 { margin: 8px 0 0; color: #fff6a0; font-size: clamp(42px, 8vw, 72px); line-height: 0.78; letter-spacing: 8px; text-shadow: 4px 4px 0 #285b31; }
        .title-card h1 span { color: #65f276; }
        .title-divider { height: 3px; margin: 22px auto 14px; max-width: 310px; background: linear-gradient(90deg, transparent, #f5d94f, transparent); }
        .title-course { color: #65f276; font-size: 20px; font-weight: bold; letter-spacing: 2px; }
        .title-hole { margin-top: 3px; color: #d8f3dc; font-size: 13px; letter-spacing: 3px; }
        .title-stats { display: flex; justify-content: center; gap: 10px; margin: 16px 0 20px; }
        .title-stats span { min-width: 82px; padding: 7px 9px; border: 1px solid #4f9d61; background: #0e2b18; color: #f9e86d; font-size: 12px; font-weight: bold; }
        .title-primary, .title-secondary { width: 100%; font: bold 15px 'Courier New', monospace; cursor: pointer; border-radius: 4px; }
        .title-primary { padding: 13px; border: 3px solid #b4ff9a; background: #269b3c; color: white; box-shadow: 0 4px 0 #0b4c1a; }
        .title-primary:hover { background: #38bd50; transform: translateY(-1px); }
        .title-secondary { margin-top: 10px; padding: 9px; border: 1px solid #678f70; background: #14281a; color: #b7cfbd; font-size: 11px; }
        .title-controls { margin-top: 18px; color: #9bc8a5; font-size: 10px; line-height: 1.6; }
        .title-note { margin-top: 8px; color: #d1a66b; font-size: 9px; line-height: 1.4; }
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
    this.container.querySelector('#btn-title-practice')?.addEventListener('click', options.onOpenPractice);
    document.body.appendChild(this.container);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }
}
