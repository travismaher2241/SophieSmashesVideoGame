import { Vector3 } from 'three';
import { CameraMode } from '../camera/CameraController';
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

  // Callbacks for UI actions
  private onCameraModeChange?: (mode: CameraMode) => void;
  private onVerticalScaleChange?: (scale: number) => void;
  private onToggleGridLines?: (visible: boolean) => void;

  // Dynamic text elements
  private camPosElem!: HTMLElement;
  private mousePosElem!: HTMLElement;
  private currentModeElem!: HTMLElement;
  private currentScaleElem!: HTMLElement;
  private gridBtnElem!: HTMLElement;

  private gridLinesVisible: boolean = true;

  constructor(
    terrainData: TerrainData,
    holeConfig: HoleConfig,
    terrainQuery: TerrainQuery,
    geoTransform: GeoTransform,
    callbacks: {
      onCameraModeChange?: (mode: CameraMode) => void;
      onVerticalScaleChange?: (scale: number) => void;
      onToggleGridLines?: (visible: boolean) => void;
    }
  ) {
    this.terrainData = terrainData;
    this.holeConfig = holeConfig;
    this.terrainQuery = terrainQuery;
    this.geoTransform = geoTransform;

    this.onCameraModeChange = callbacks.onCameraModeChange;
    this.onVerticalScaleChange = callbacks.onVerticalScaleChange;
    this.onToggleGridLines = callbacks.onToggleGridLines;

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

  /** Show or hide the developer panel, scale bar and compass together. */
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
        <div><b>Northing (Option A - Row 0 North):</b> ${geo.northingOptionA.toFixed(1)} m N</div>
        <div><b>Northing (Option B - Row 0 South):</b> ${geo.northingOptionB.toFixed(1)} m N</div>
        <div style="font-size: 10px; color: #ff9977;">⚠️ Row-to-Northing orientation UNVERIFIED</div>
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
    this.container.style.backgroundColor = 'rgba(10, 24, 12, 0.9)';
    this.container.style.border = '2px solid #44aa44';
    this.container.style.borderRadius = '6px';
    this.container.style.color = '#d5ffd5';
    this.container.style.fontFamily = "'Courier New', Courier, monospace";
    this.container.style.fontSize = '12px';
    this.container.style.lineHeight = '1.45';
    this.container.style.maxWidth = '420px';
    this.container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.6)';
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
    const teeText = this.holeConfig.tee
      ? `X: ${this.holeConfig.tee.x}m, Z: ${this.holeConfig.tee.z}m`
      : 'TEE — NOT VERIFIED';
    const greenText = this.holeConfig.greenCentre
      ? `X: ${this.holeConfig.greenCentre.x}m, Z: ${this.holeConfig.greenCentre.z}m`
      : 'GREEN — NOT VERIFIED';

    this.container.innerHTML = `
      <div style="font-weight: bold; font-size: 15px; color: #55ff55; margin-bottom: 6px; border-bottom: 1px solid #337733; padding-bottom: 4px;">
        ⛳ SOPHIE GOLF — TERRAIN ALIGNMENT TOOL
      </div>

      <div style="margin-bottom: 8px;">
        <div><b>Course:</b> ${meta.courseName}</div>
        <div><b>Hole:</b> ${meta.holeNumber} (Par ${this.holeConfig.par}, ${this.holeConfig.publishedLengthMetres}m)</div>
        <div><b>CRS:</b> ${meta.sourceCRS}</div>
        <div><b>Source Bounds:</b> E ${meta.sourceBoundsMGA55 ? `${meta.sourceBoundsMGA55.minEasting}..${meta.sourceBoundsMGA55.maxEasting}` : 'N/A'} | N ${meta.sourceBoundsMGA55 ? `${meta.sourceBoundsMGA55.minNorthing}..${meta.sourceBoundsMGA55.maxNorthing}` : 'N/A'}</div>
      </div>

      <div style="margin-bottom: 8px; background: rgba(0, 40, 0, 0.4); padding: 6px; border-left: 3px solid #55cc55;">
        <div><b>Grid Samples:</b> ${meta.widthSamples} × ${meta.heightSamples} (${meta.gridSpacingMetres}m spacing)</div>
        <div><b>Vertex Span:</b> ${this.terrainData.vertexExtentX.toFixed(0)}m × ${this.terrainData.vertexExtentZ.toFixed(0)}m</div>
        <div><b>Cell Extent:</b> ${this.terrainData.cellExtentX.toFixed(0)}m × ${this.terrainData.cellExtentZ.toFixed(0)}m</div>
        <div><b>Base Elevation:</b> ${meta.baseElevationMetres.toFixed(2)}m</div>
        <div><b>Max Elevation:</b> ${meta.maxElevationMetres.toFixed(2)}m</div>
      </div>

      <div style="margin-bottom: 8px; color: #ffdd77;">
        <div><b>Verified Tee:</b> ${teeText}</div>
        <div><b>Verified Green:</b> ${greenText}</div>
      </div>

      <div style="margin-bottom: 8px; border-top: 1px solid #225522; padding-top: 6px;">
        <div><b>Camera Mode:</b> <span id="dbg-mode" style="color: #77ffff; font-weight: bold;">FREE</span></div>
        <div><b>Camera Pos:</b> <span id="dbg-cam-pos">Initializing...</span></div>
      </div>

      <div style="margin-bottom: 10px; border-top: 1px solid #225522; padding-top: 6px;">
        <div><b>Cursor GIS Readout:</b></div>
        <div id="dbg-mouse-pos" style="color: #ffff88; min-height: 80px;">Move mouse over terrain...</div>
      </div>

      <div style="border-top: 1px dashed #448844; padding-top: 8px;">
        <div style="margin-bottom: 6px; font-weight: bold; color: #aaffaa;">CAMERA VIEW:</div>
        <div style="display: flex; gap: 6px; margin-bottom: 8px;">
          <button id="btn-cam-free" class="retro-btn">FREE</button>
          <button id="btn-cam-golf" class="retro-btn">GOLF</button>
          <button id="btn-cam-overhead" class="retro-btn">OVERHEAD</button>
        </div>

        <div style="margin-bottom: 6px; font-weight: bold; color: #aaffaa;">
          ALIGNMENT GRID & SCALE:
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 8px;">
          <button id="btn-toggle-grid" class="retro-btn">Toggle 50m Grid (ON)</button>
        </div>

        <div style="margin-bottom: 6px; font-weight: bold; color: #aaffaa;">
          VERTICAL SCALE: <span id="dbg-scale" style="color: #ff9955;">1.0× (Physically Accurate)</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="btn-scale-1" class="retro-btn">1.0× (Physically Accurate)</button>
          <button id="btn-scale-15" class="retro-btn">1.5× Inspection</button>
          <button id="btn-scale-2" class="retro-btn">2× Inspection</button>
        </div>
      </div>
    `;

    this.camPosElem = this.container.querySelector('#dbg-cam-pos')!;
    this.mousePosElem = this.container.querySelector('#dbg-mouse-pos')!;
    this.currentModeElem = this.container.querySelector('#dbg-mode')!;
    this.currentScaleElem = this.container.querySelector('#dbg-scale')!;
    this.gridBtnElem = this.container.querySelector('#btn-toggle-grid')!;

    this.container.querySelector('#btn-cam-free')?.addEventListener('click', () => this.onCameraModeChange?.('FREE'));
    this.container.querySelector('#btn-cam-golf')?.addEventListener('click', () => this.onCameraModeChange?.('GOLF'));
    this.container.querySelector('#btn-cam-overhead')?.addEventListener('click', () => this.onCameraModeChange?.('OVERHEAD'));

    this.container.querySelector('#btn-scale-1')?.addEventListener('click', () => this.onVerticalScaleChange?.(1.0));
    this.container.querySelector('#btn-scale-15')?.addEventListener('click', () => this.onVerticalScaleChange?.(1.5));
    this.container.querySelector('#btn-scale-2')?.addEventListener('click', () => this.onVerticalScaleChange?.(2.0));

    this.gridBtnElem.addEventListener('click', () => {
      this.gridLinesVisible = !this.gridLinesVisible;
      this.gridBtnElem.textContent = `Toggle 50m Grid (${this.gridLinesVisible ? 'ON' : 'OFF'})`;
      this.onToggleGridLines?.(this.gridLinesVisible);
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
      <div style="background: rgba(10, 24, 12, 0.88); border: 2px solid #ffaa33; border-radius: 6px; padding: 6px 14px; color: #ffddaa; font-family: monospace; font-size: 11px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="font-weight: bold; font-size: 13px; color: #ffaa33;">⬆ PROVISIONAL NORTH</div>
        <div style="font-size: 10px; color: #ff8888;">ROW ORIENTATION UNVERIFIED</div>
      </div>
    `;
  }
}
