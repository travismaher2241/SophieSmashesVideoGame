import { Vector3 } from 'three';
import { CameraMode } from '../camera/CameraController';
import { CandidateHole6Alignment } from '../course/CandidateHoleAlignment';
import { GeoTransform } from '../course/GeoTransform';
import { HoleConfig } from '../course/HoleData';
import { TerrainData } from '../course/TerrainData';
import { TerrainQuery } from '../course/TerrainQuery';
import { MouseTerrainHit } from '../debug/MouseRaycaster';

export class DebugOverlay {
  public container: HTMLElement;
  public scaleBarContainer: HTMLElement;
  public compassContainer: HTMLElement;

  private terrainData: TerrainData;
  private holeConfig: HoleConfig;
  private terrainQuery: TerrainQuery;
  private geoTransform: GeoTransform;
  private candidateAlignment?: CandidateHole6Alignment;

  // Callbacks for UI actions
  private onCameraModeChange?: (mode: CameraMode) => void;
  private onVerticalScaleChange?: (scale: number) => void;
  private onToggleGridLines?: (visible: boolean) => void;
  private onToggleCandidateReview?: (visible: boolean) => void;

  // Dynamic text elements
  private camPosElem!: HTMLElement;
  private mousePosElem!: HTMLElement;
  private currentModeElem!: HTMLElement;
  private currentScaleElem!: HTMLElement;
  private gridBtnElem!: HTMLElement;
  private candidateBtnElem!: HTMLElement;

  // Swing Telemetry elements
  private swingStateElem!: HTMLElement;
  private swingPowerElem!: HTMLElement;
  private swingAccErrElem!: HTMLElement;
  private swingInputCountElem!: HTMLElement;

  private gridLinesVisible: boolean = false;
  private candidateReviewVisible: boolean = true;

  constructor(
    terrainData: TerrainData,
    holeConfig: HoleConfig,
    terrainQuery: TerrainQuery,
    geoTransform: GeoTransform,
    callbacks: {
      onCameraModeChange?: (mode: CameraMode) => void;
      onVerticalScaleChange?: (scale: number) => void;
      onToggleGridLines?: (visible: boolean) => void;
      onToggleCandidateReview?: (visible: boolean) => void;
    },
    candidateAlignment?: CandidateHole6Alignment
  ) {
    this.terrainData = terrainData;
    this.holeConfig = holeConfig;
    this.terrainQuery = terrainQuery;
    this.geoTransform = geoTransform;
    this.candidateAlignment = candidateAlignment;

    this.onCameraModeChange = callbacks.onCameraModeChange;
    this.onVerticalScaleChange = callbacks.onVerticalScaleChange;
    this.onToggleGridLines = callbacks.onToggleGridLines;
    this.onToggleCandidateReview = callbacks.onToggleCandidateReview;

    this.container = document.createElement('div');
    this.scaleBarContainer = document.createElement('div');
    this.compassContainer = document.createElement('div');

    this.setupStyles();
    this.buildHTML();
    this.buildScaleBarHTML();
    this.buildCompassHTML();

    document.body.appendChild(this.container);
    document.body.appendChild(this.scaleBarContainer);
    document.body.appendChild(this.compassContainer);
  }

  public setVisible(visible: boolean): void {
    const display = visible ? 'block' : 'none';
    this.container.style.display = display;
    this.scaleBarContainer.style.display = display;
    this.compassContainer.style.display = display;
  }

  public updateCameraInfo(pos: Vector3, mode: CameraMode): void {
    if (this.camPosElem) {
      this.camPosElem.textContent = `X: ${pos.x.toFixed(1)}m | Y: ${pos.y.toFixed(1)}m | Z: ${pos.z.toFixed(1)}m`;
    }
    if (this.currentModeElem) {
      this.currentModeElem.textContent = mode;
    }
  }

  public updateSwingTelemetry(
    state: string,
    power: number,
    accuracyError: number,
    inputCount: number
  ): void {
    if (this.swingStateElem) {
      this.swingStateElem.textContent = state;
    }
    if (this.swingPowerElem) {
      this.swingPowerElem.textContent = power.toFixed(2);
    }
    if (this.swingAccErrElem) {
      const prefix = accuracyError > 0 ? '+' : '';
      this.swingAccErrElem.textContent = `${prefix}${accuracyError.toFixed(2)}`;
    }
    if (this.swingInputCountElem) {
      this.swingInputCountElem.textContent = String(inputCount);
    }
  }

  public updateMouseHitInfo(hit: MouseTerrainHit | null): void {
    if (!this.mousePosElem) return;

    if (!hit) {
      this.mousePosElem.innerHTML = `<span style="color: #aaaaaa;">Cursor off terrain mesh</span>`;
      return;
    }

    const queryResult = this.terrainQuery.queryTerrainHeight(hit.gridX, hit.gridZ);
    const normal = this.terrainQuery.getTerrainNormal(hit.gridX, hit.gridZ);
    const offsetElevation = queryResult.height;
    const absoluteElevation = this.terrainData.baseElevation + offsetElevation;
    const geo = this.geoTransform.getGeoCoordinates(hit.gridX, hit.gridZ, absoluteElevation);

    const statusStr = queryResult.isOutOfBounds ? ' <span style="color: #ff5555; font-weight: bold;">[OUT OF BOUNDS]</span>' : '';

    this.mousePosElem.innerHTML = `
      <div><b>Grid Cell:</b> Col ${geo.col} | Row ${geo.row}</div>
      <div><b>Local Position:</b> X: ${hit.gridX.toFixed(1)}m | Z: ${hit.gridZ.toFixed(1)}m</div>
      <div><b>Elevation Offset:</b> <b>+${offsetElevation.toFixed(2)} m</b> (above base ${this.terrainData.baseElevation.toFixed(2)}m)${statusStr}</div>
      <div><b>Absolute Elevation:</b> <b>${absoluteElevation.toFixed(2)} m</b> (above sea level)</div>
      <div style="margin-top: 4px; border-top: 1px dotted #337733; padding-top: 3px; color: #77ffff;">
        <div><b>EPSG:7855 Easting:</b> ${geo.eastingMGA55.toFixed(1)} m E</div>
        <div><b>EPSG:7855 Northing:</b> ${geo.northingOptionA.toFixed(1)} m N</div>
      </div>
      <div><b>Surface Normal:</b> (${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})</div>
    `;
  }

  public setVerticalScaleDisplay(scale: number): void {
    if (this.currentScaleElem) {
      this.currentScaleElem.textContent = scale === 1.0 ? '1.0× (Physically Accurate)' : `${scale}×`;
    }
  }

  private setupStyles(): void {
    this.container.style.position = 'absolute';
    this.container.style.top = '12px';
    this.container.style.left = '12px';
    this.container.style.padding = '14px 18px';
    this.container.style.backgroundColor = 'rgba(10, 24, 12, 0.94)';
    this.container.style.border = '2px solid #44aa44';
    this.container.style.borderRadius = '6px';
    this.container.style.color = '#d5ffd5';
    this.container.style.fontFamily = "'Courier New', Courier, monospace";
    this.container.style.fontSize = '11px';
    this.container.style.lineHeight = '1.45';
    this.container.style.maxWidth = '460px';
    this.container.style.maxHeight = '90vh';
    this.container.style.overflowY = 'auto';
    this.container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.7)';
    this.container.style.zIndex = '50';

    this.scaleBarContainer.style.position = 'absolute';
    this.scaleBarContainer.style.bottom = '16px';
    this.scaleBarContainer.style.left = '16px';
    this.scaleBarContainer.style.zIndex = '40';
    this.scaleBarContainer.style.pointerEvents = 'none';

    this.compassContainer.style.position = 'absolute';
    this.compassContainer.style.top = '16px';
    this.compassContainer.style.left = '50%';
    this.compassContainer.style.transform = 'translateX(-50%)';
    this.compassContainer.style.zIndex = '40';
    this.compassContainer.style.pointerEvents = 'none';
  }

  private buildHTML(): void {
    const meta = this.terrainData.meta;
    const cand = this.candidateAlignment;

    const candHTML = cand ? `
      <div style="margin-bottom: 8px; background: rgba(30, 45, 15, 0.7); border: 1px solid #ccaa44; border-radius: 4px; padding: 8px; color: #ffffcc;">
        <div style="font-weight: bold; color: #ffdd55; font-size: 12px; margin-bottom: 4px;">
          📍 HOLE 6 CANDIDATE ALIGNMENT (ESTIMATED):
        </div>
        <div><b>Tee (Estimated):</b> E ${cand.tee.sourcePosition.easting.toFixed(1)} | N ${cand.tee.sourcePosition.northing.toFixed(1)} (Local: ${cand.tee.localPosition.x}m, ${cand.tee.localPosition.z}m) @ ${cand.calculatedMetrics.teeElevationMetres.toFixed(2)}m</div>
        <div><b>Green (Estimated):</b> E ${cand.greenCentre.sourcePosition.easting.toFixed(1)} | N ${cand.greenCentre.sourcePosition.northing.toFixed(1)} (Local: ${cand.greenCentre.localPosition.x}m, ${cand.greenCentre.localPosition.z}m) @ ${cand.calculatedMetrics.greenElevationMetres.toFixed(2)}m</div>
        <div style="margin-top: 4px; border-top: 1px dashed #887722; padding-top: 3px;">
          <div><b>Calculated Plan Distance:</b> <span style="color: #55ffff; font-weight: bold;">${cand.calculatedMetrics.planDistanceMetres.toFixed(1)} m</span> (Official: ${cand.calculatedMetrics.officialDistanceMetres}m, Delta: ${cand.calculatedMetrics.distanceDeltaMetres.toFixed(1)}m)</div>
          <div><b>Elevation Difference:</b> <span style="color: #ffaa55; font-weight: bold;">+${cand.calculatedMetrics.elevationChangeMetres.toFixed(2)} m uphill</span></div>
          <div><b>Identified Bunkers:</b> ${cand.evidenceSummary.bunkersIdentified} Greenside Traps (h06-bunker-01, h06-bunker-02)</div>
          <div><b>Identified Path:</b> ${cand.evidenceSummary.pathIdentified}</div>
          <div style="font-size: 10px; color: #ffbb77; margin-top: 3px;"><i>Verification: ESTIMATED-FROM-OFFICIAL-MAP</i></div>
        </div>
      </div>
    ` : '';

    this.container.innerHTML = `
      <div style="font-weight: bold; font-size: 14px; color: #55ff55; margin-bottom: 6px; border-bottom: 1px solid #337733; padding-bottom: 4px;">
        ⛳ WARRAGUL HOLE 6 — ALIGNMENT & GIS REVIEW
      </div>

      <!-- F2 Swing State Machine Telemetry -->
      <div style="margin-bottom: 8px; background: rgba(20, 44, 26, 0.85); border: 1px solid #55dd77; border-radius: 4px; padding: 6px 10px; color: #e8ffe8;">
        <div style="color: #ffff55; font-weight: bold; margin-bottom: 3px; font-size: 12px;">📊 SWING TELEMETRY (F2 DEBUG):</div>
        <div><b>Swing State:</b> <span id="dbg-swing-state" style="color: #63b3ed; font-weight: bold;">READY</span></div>
        <div><b>Power:</b> <span id="dbg-swing-power" style="color: #f6e05e; font-weight: bold;">0.00</span></div>
        <div><b>Accuracy Error:</b> <span id="dbg-swing-acc-err" style="color: #68d391; font-weight: bold;">0.00</span></div>
        <div><b>Swing Input Count:</b> <span id="dbg-swing-input-count" style="color: #ffffff; font-weight: bold;">0</span> / 3</div>
      </div>

      <div style="margin-bottom: 8px;">
        <div><b>Course:</b> ${meta.courseName} (Hole ${meta.holeNumber}, Par ${this.holeConfig.par}, ${this.holeConfig.publishedLengthMetres}m)</div>
        <div><b>Source CRS:</b> ${meta.sourceCRS} (GDA2020 / MGA Zone 55)</div>
        <div><b>Raster Bounds:</b> E ${meta.sourceBoundsMGA55?.minEasting}..${meta.sourceBoundsMGA55?.maxEasting} | N ${meta.sourceBoundsMGA55?.minNorthing}..${meta.sourceBoundsMGA55?.maxNorthing}</div>
        <div><b>Sample-Centre Span:</b> ${this.terrainData.vertexExtentX.toFixed(0)}m × ${this.terrainData.vertexExtentZ.toFixed(0)}m (${meta.widthSamples}×${meta.heightSamples} @ ${meta.gridSpacingMetres}m)</div>
      </div>

      ${candHTML}

      <div style="margin-bottom: 8px; border-top: 1px solid #225522; padding-top: 6px;">
        <div><b>Camera View:</b> <span id="dbg-mode" style="color: #77ffff; font-weight: bold;">FREE</span></div>
        <div><b>Camera Pos:</b> <span id="dbg-cam-pos">Initializing...</span></div>
      </div>

      <div style="margin-bottom: 8px; border-top: 1px solid #225522; padding-top: 6px;">
        <div><b>Cursor GIS Readout:</b></div>
        <div id="dbg-mouse-pos" style="color: #ffff88; min-height: 70px;">Move mouse over terrain...</div>
      </div>

      <div style="border-top: 1px dashed #448844; padding-top: 8px;">
        <div style="margin-bottom: 6px; font-weight: bold; color: #aaffaa;">REVIEW CONTROLS:</div>
        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <button id="btn-cam-free" class="retro-btn">FREE</button>
          <button id="btn-cam-golf" class="retro-btn">GOLF</button>
          <button id="btn-cam-overhead" class="retro-btn">OVERHEAD</button>
        </div>

        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <button id="btn-toggle-cand" class="retro-btn" style="border-color: #ffaa33; color: #ffddaa;">Candidate Alignment (ON)</button>
          <button id="btn-toggle-grid" class="retro-btn">50m Grid (OFF)</button>
        </div>

        <div style="margin-bottom: 4px; font-weight: bold; color: #aaffaa;">
          VERTICAL SCALE: <span id="dbg-scale" style="color: #ff9955;">1.0× (Physically Accurate)</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="btn-scale-1" class="retro-btn">1.0× (Physically Accurate)</button>
          <button id="btn-scale-15" class="retro-btn">1.5×</button>
          <button id="btn-scale-2" class="retro-btn">2×</button>
        </div>
      </div>
    `;

    this.camPosElem = this.container.querySelector('#dbg-cam-pos')!;
    this.mousePosElem = this.container.querySelector('#dbg-mouse-pos')!;
    this.currentModeElem = this.container.querySelector('#dbg-mode')!;
    this.currentScaleElem = this.container.querySelector('#dbg-scale')!;
    this.gridBtnElem = this.container.querySelector('#btn-toggle-grid')!;
    this.candidateBtnElem = this.container.querySelector('#btn-toggle-cand')!;

    this.swingStateElem = this.container.querySelector('#dbg-swing-state')!;
    this.swingPowerElem = this.container.querySelector('#dbg-swing-power')!;
    this.swingAccErrElem = this.container.querySelector('#dbg-swing-acc-err')!;
    this.swingInputCountElem = this.container.querySelector('#dbg-swing-input-count')!;

    this.container.querySelector('#btn-cam-free')?.addEventListener('click', () => this.onCameraModeChange?.('FREE'));
    this.container.querySelector('#btn-cam-golf')?.addEventListener('click', () => this.onCameraModeChange?.('GOLF'));
    this.container.querySelector('#btn-cam-overhead')?.addEventListener('click', () => this.onCameraModeChange?.('OVERHEAD'));

    this.container.querySelector('#btn-scale-1')?.addEventListener('click', () => this.onVerticalScaleChange?.(1.0));
    this.container.querySelector('#btn-scale-15')?.addEventListener('click', () => this.onVerticalScaleChange?.(1.5));
    this.container.querySelector('#btn-scale-2')?.addEventListener('click', () => this.onVerticalScaleChange?.(2.0));

    this.gridBtnElem.addEventListener('click', () => {
      this.gridLinesVisible = !this.gridLinesVisible;
      this.gridBtnElem.textContent = `50m Grid (${this.gridLinesVisible ? 'ON' : 'OFF'})`;
      this.onToggleGridLines?.(this.gridLinesVisible);
    });

    this.candidateBtnElem?.addEventListener('click', () => {
      this.candidateReviewVisible = !this.candidateReviewVisible;
      this.candidateBtnElem.textContent = `Candidate Alignment (${this.candidateReviewVisible ? 'ON' : 'OFF'})`;
      this.onToggleCandidateReview?.(this.candidateReviewVisible);
    });
  }

  private buildScaleBarHTML(): void {
    this.scaleBarContainer.innerHTML = `
      <div style="background: rgba(10, 24, 12, 0.85); border: 1px solid #55aa55; border-radius: 4px; padding: 6px 12px; color: #ddffdd; font-family: monospace; font-size: 11px;">
        <div style="text-align: center; margin-bottom: 2px;">50 METRES (1:1 SCALE)</div>
        <div style="width: 100px; height: 6px; background: #55aa55; border: 1px solid #ffffff; position: relative;">
          <div style="position: absolute; left: 0; top: -3px; height: 12px; width: 2px; background: #ffffff;"></div>
          <div style="position: absolute; left: 50%; top: -3px; height: 12px; width: 2px; background: #ffffff;"></div>
          <div style="position: absolute; right: 0; top: -3px; height: 12px; width: 2px; background: #ffffff;"></div>
        </div>
      </div>
    `;
  }

  private buildCompassHTML(): void {
    this.compassContainer.innerHTML = `
      <div style="background: rgba(10, 24, 12, 0.88); border: 2px solid #55cc55; border-radius: 6px; padding: 6px 14px; color: #ddffdd; font-family: monospace; font-size: 11px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="font-weight: bold; font-size: 13px; color: #55ff55;">⬆ NORTH (EPSG:7855)</div>
        <div style="font-size: 10px; color: #aaffaa;">ROW 0 = NORTHING 5777580</div>
      </div>
    `;
  }
}
