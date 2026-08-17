import { Vector2D } from '../game/PlaytestLayout';

export type LayoutSelectionStep = 'SELECT_TEE' | 'SELECT_HOLE' | 'CONFIRM';

export class PlaytestLayoutHUD {
  private container: HTMLElement;
  private currentStep: LayoutSelectionStep = 'SELECT_TEE';

  private tempTee: Vector2D | null = null;
  private tempHole: Vector2D | null = null;

  private onConfirmLayout?: (tee: Vector2D, hole: Vector2D) => void;
  private onBackToTitle?: () => void;

  private stepInstructionElem!: HTMLElement;
  private distanceElem!: HTMLElement;
  private confirmBtn!: HTMLButtonElement;

  constructor(
    onConfirmLayout: (tee: Vector2D, hole: Vector2D) => void,
    onBackToTitle?: () => void
  ) {
    this.onConfirmLayout = onConfirmLayout;
    this.onBackToTitle = onBackToTitle;

    this.container = document.createElement('div');
    this.setupStyles();
    this.buildHTML();
    document.body.appendChild(this.container);
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public getCurrentStep(): LayoutSelectionStep {
    return this.currentStep;
  }

  public getTempTee(): Vector2D | null {
    return this.tempTee;
  }

  public getTempHole(): Vector2D | null {
    return this.tempHole;
  }

  public resetSelection(): void {
    this.currentStep = 'SELECT_TEE';
    this.tempTee = null;
    this.tempHole = null;
    this.updateUI();
  }

  public handleTerrainClick(x: number, z: number, elevation: number): void {
    const pt: Vector2D = {
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      elevation: Math.round(elevation * 100) / 100
    };

    if (this.currentStep === 'SELECT_TEE') {
      this.tempTee = pt;
      this.currentStep = 'SELECT_HOLE';
    } else if (this.currentStep === 'SELECT_HOLE') {
      this.tempHole = pt;
      this.currentStep = 'CONFIRM';
    }

    this.updateUI();
  }

  private updateUI(): void {
    if (this.currentStep === 'SELECT_TEE') {
      this.stepInstructionElem.innerHTML = `Step 1: Click on the terrain map to place the <span style="color: #ff5555; font-weight: bold;">PLAYTEST TEE</span>`;
      this.distanceElem.textContent = `Distance: -- m`;
      this.confirmBtn.disabled = true;
      this.confirmBtn.style.opacity = '0.5';
    } else if (this.currentStep === 'SELECT_HOLE') {
      this.stepInstructionElem.innerHTML = `Step 2: Click on the terrain map to place the <span style="color: #55ff55; font-weight: bold;">PLAYTEST CUP</span>`;
      this.distanceElem.textContent = `Tee set at (${this.tempTee?.x}m, ${this.tempTee?.z}m)`;
      this.confirmBtn.disabled = true;
      this.confirmBtn.style.opacity = '0.5';
    } else if (this.currentStep === 'CONFIRM' && this.tempTee && this.tempHole) {
      const dist = Math.round(Math.hypot(this.tempHole.x - this.tempTee.x, this.tempHole.z - this.tempTee.z) * 10) / 10;
      this.stepInstructionElem.innerHTML = `Step 3: Layout configured! Ready to play.`;
      this.distanceElem.innerHTML = `<b>MEASURED HOLE DISTANCE: <span style="color: #ffff55;">${dist} METRES</span></b>`;
      this.confirmBtn.disabled = false;
      this.confirmBtn.style.opacity = '1.0';
    }
  }

  private setupStyles(): void {
    this.container.style.position = 'absolute';
    this.container.style.top = '16px';
    this.container.style.left = '50%';
    this.container.style.transform = 'translateX(-50%)';
    this.container.style.backgroundColor = 'rgba(10, 24, 12, 0.94)';
    this.container.style.border = '3px solid #ffaa33';
    this.container.style.borderRadius = '8px';
    this.container.style.padding = '18px 24px';
    this.container.style.color = '#ffffff';
    this.container.style.fontFamily = "'Courier New', Courier, monospace";
    this.container.style.textAlign = 'center';
    this.container.style.zIndex = '60';
    this.container.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
    this.container.style.maxWidth = '520px';
  }

  private buildHTML(): void {
    this.container.innerHTML = `
      <div style="font-weight: bold; font-size: 16px; color: #ffaa33; margin-bottom: 6px;">
        ⛳ SETUP PLAYTEST LAYOUT — WARRAGUL HOLE 6
      </div>

      <div style="font-size: 11px; color: #ffcc77; background: rgba(60, 30, 0, 0.5); padding: 6px 10px; border-radius: 4px; margin-bottom: 12px;">
        <b>PLAYTEST LAYOUT — NOT SURVEYED</b><br/>
        Authoritative hole coordinates are not in hole.json. Set your playtest tee and pin.
      </div>

      <div id="layout-step-instruction" style="font-size: 13px; color: #ddffdd; margin-bottom: 8px;">
        Step 1: Click on the terrain map to place the <span style="color: #ff5555; font-weight: bold;">PLAYTEST TEE</span>
      </div>

      <div id="layout-distance-text" style="font-size: 14px; color: #77ffff; margin-bottom: 14px;">
        Distance: -- m
      </div>

      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="btn-layout-confirm" style="background: #22aa22; border: 2px solid #77ff77; color: #ffffff; padding: 10px 18px; font-family: inherit; font-size: 13px; font-weight: bold; cursor: pointer; border-radius: 5px; opacity: 0.5;" disabled>
          ⛳ PLAY THIS LAYOUT
        </button>
        <button id="btn-layout-reset" style="background: #441111; border: 1px solid #ff5555; color: #ffcccc; padding: 10px 14px; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 5px;">
          Reset Selection
        </button>
        <button id="btn-layout-back" style="background: #18271b; border: 1px solid #88aa88; color: #ddffdd; padding: 10px 14px; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 5px;">
          Main Menu
        </button>
      </div>
    `;

    this.stepInstructionElem = this.container.querySelector('#layout-step-instruction')!;
    this.distanceElem = this.container.querySelector('#layout-distance-text')!;
    this.confirmBtn = this.container.querySelector('#btn-layout-confirm')!;

    this.container.querySelector('#btn-layout-reset')?.addEventListener('click', () => this.resetSelection());
    this.container.querySelector('#btn-layout-back')?.addEventListener('click', () => this.onBackToTitle?.());
    
    this.confirmBtn.addEventListener('click', () => {
      if (this.tempTee && this.tempHole) {
        this.onConfirmLayout?.(this.tempTee, this.tempHole);
      }
    });
  }
}
