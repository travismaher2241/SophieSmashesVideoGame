import { CameraController } from '../camera/CameraController';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { GeoTransform } from '../course/GeoTransform';
import { HoleConfig, HoleData } from '../course/HoleData';
import { TerrainData } from '../course/TerrainData';
import { TerrainLoader } from '../course/TerrainLoader';
import { TerrainQuery } from '../course/TerrainQuery';
import { MouseRaycaster } from '../debug/MouseRaycaster';
import { AlignmentGridOverlay } from '../rendering/AlignmentGridOverlay';
import { SceneManager } from '../rendering/SceneManager';
import { TerrainMeshBuilder } from '../rendering/TerrainMeshBuilder';
import { AnnotationTool } from '../ui/AnnotationTool';
import { DebugOverlay } from '../ui/DebugOverlay';

export class Game {
  private canvas: HTMLCanvasElement;
  private sceneManager: SceneManager;
  private cameraController?: CameraController;
  private terrainLoader: typeof TerrainLoader = TerrainLoader;

  private terrainData?: TerrainData;
  private holeConfig?: HoleConfig;
  private terrainMeshBuilder?: TerrainMeshBuilder;
  private terrainQuery?: TerrainQuery;
  private geoTransform?: GeoTransform;

  // Renderers & Overlays for Phase 0 Terrain Alignment
  private alignmentGridOverlay?: AlignmentGridOverlay;
  private candidateStore: CandidateAnnotations;
  private raycaster?: MouseRaycaster;

  // UI Components for Phase 0
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;

  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    this.candidateStore = new CandidateAnnotations();
  }

  public async start(courseHolePath: string): Promise<void> {
    try {
      // 1. Fully metadata-driven course DEM loading
      this.terrainData = await this.terrainLoader.load(courseHolePath);
      this.holeConfig = await HoleData.load(courseHolePath);

      // 2. Initialize Terrain Query System & GeoTransform
      this.terrainQuery = new TerrainQuery(this.terrainData);
      this.geoTransform = new GeoTransform(this.terrainData);

      // 3. Initialize Camera Controller
      this.cameraController = new CameraController(this.canvas, this.terrainData, this.terrainQuery);
      this.cameraController.setMode('FREE');

      // 4. Build 3D Terrain Mesh (Native 1:1 Scale)
      this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
      const mesh = this.terrainMeshBuilder.getMesh();
      this.sceneManager.scene.add(mesh);

      // 5. Build 50m Alignment Grid Overlay
      this.alignmentGridOverlay = new AlignmentGridOverlay(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.alignmentGridOverlay.getGroup());

      // 6. Raycaster & UI HUDs for Phase 0
      this.raycaster = new MouseRaycaster(this.canvas);
      this.setupHUDs();
      this.setupEvents();

      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      // 7. Start Render Loop at Native Display Resolution
      this.isRunning = true;
      this.animate();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  private setupHUDs(): void {
    // 1. Developer Debug Overlay (Phase 0 Primary Experience)
    this.debugOverlay = new DebugOverlay(
      this.terrainData!,
      this.holeConfig!,
      this.terrainQuery!,
      this.geoTransform!,
      {
        onCameraModeChange: (mode) => this.cameraController?.setMode(mode),
        onVerticalScaleChange: (scale) => {
          this.terrainMeshBuilder?.setVerticalScale(scale);
          this.cameraController?.setRenderVerticalScale(scale);
          this.debugOverlay?.setVerticalScaleDisplay(scale);
        },
        onToggleGridLines: (visible) => this.alignmentGridOverlay?.setGridVisible(visible)
      }
    );

    // 2. Candidate Annotation Tool
    this.annotationTool = new AnnotationTool(
      this.candidateStore,
      this.terrainData!,
      this.geoTransform!,
      {
        onModeChange: () => {},
        onAnnotationsUpdated: () => this.alignmentGridOverlay?.updateCandidateMarkers(this.candidateStore)
      }
    );
  }

  private setupEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') {
        this.cameraController?.setMode('FREE');
      } else if (e.key === '2') {
        this.cameraController?.setMode('GOLF');
      } else if (e.key === '3') {
        this.cameraController?.setMode('OVERHEAD');
      }
    });

    this.canvas.addEventListener('click', () => {
      const hit = this.raycaster?.getHit();
      if (!hit || !this.terrainQuery) return;

      const elev = this.terrainQuery.getTerrainHeight(hit.gridX, hit.gridZ, true);
      if (this.annotationTool?.getActiveMode() !== 'INSPECT') {
        this.annotationTool?.handleTerrainClick(hit.gridX, hit.gridZ, elev);
      }
    });
  }

  private animate = (): void => {
    if (!this.isRunning || !this.cameraController) return;

    requestAnimationFrame(this.animate);

    // 1. Raycaster update
    let mouseHit = null;
    if (this.raycaster && this.terrainMeshBuilder) {
      mouseHit = this.raycaster.update(
        this.cameraController.camera,
        this.terrainMeshBuilder.getMesh()
      );
    }

    // 2. Update Camera Controller
    this.cameraController.update();

    // 3. Update Debug Overlay
    if (this.debugOverlay) {
      this.debugOverlay.updateCameraInfo(this.cameraController.camera.position, this.cameraController.getMode());
      this.debugOverlay.updateMouseHitInfo(mouseHit);
    }

    // 4. Render Scene at Native Screen Resolution
    this.sceneManager.renderer.render(
      this.sceneManager.scene,
      this.cameraController.camera
    );
  };

  private showErrorModal(message: string): void {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';

    const modal = document.getElementById('error-modal');
    const msgElem = document.getElementById('error-message');
    if (modal && msgElem) {
      msgElem.innerText = message;
      modal.style.display = 'block';
    }
  }
}
