import { CameraController } from '../camera/CameraController';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { GeoTransform } from '../course/GeoTransform';
import { HoleConfig, HoleData } from '../course/HoleData';
import { TerrainData } from '../course/TerrainData';
import { TerrainLoader } from '../course/TerrainLoader';
import { TerrainQuery } from '../course/TerrainQuery';
import { MouseRaycaster } from '../debug/MouseRaycaster';
import { AlignmentGridOverlay } from '../rendering/AlignmentGridOverlay';
import { RetroRenderer } from '../rendering/RetroRenderer';
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
  private candidateStore: CandidateAnnotations;
  private alignmentGridOverlay?: AlignmentGridOverlay;

  private raycaster?: MouseRaycaster;
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;
  private retroRenderer: RetroRenderer;

  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    this.retroRenderer = new RetroRenderer({ enabled: false });
    this.candidateStore = new CandidateAnnotations();
  }

  public async start(courseHolePath: string): Promise<void> {
    try {
      // 1. Load course data
      this.terrainData = await this.terrainLoader.load(courseHolePath);
      this.holeConfig = await HoleData.load(courseHolePath);

      // 2. Initialize Terrain Query System & GeoTransform
      this.terrainQuery = new TerrainQuery(this.terrainData);
      this.geoTransform = new GeoTransform(this.terrainData);
      
      // Initialize Camera Controller with terrain data & query
      this.cameraController = new CameraController(this.canvas, this.terrainData, this.terrainQuery);

      // 3. Build 3D Terrain Mesh
      this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
      const mesh = this.terrainMeshBuilder.getMesh();
      this.sceneManager.scene.add(mesh);

      // 4. Alignment Grid & Markers Overlay
      this.alignmentGridOverlay = new AlignmentGridOverlay(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.alignmentGridOverlay.getGroup());

      // 5. Raycaster & UI Tools
      this.raycaster = new MouseRaycaster(this.canvas);
      
      this.debugOverlay = new DebugOverlay(
        this.terrainData,
        this.holeConfig,
        this.terrainQuery,
        this.geoTransform,
        {
          onCameraModeChange: (mode) => {
            this.cameraController?.setMode(mode);
          },
          onVerticalScaleChange: (scale) => {
            this.terrainMeshBuilder?.setVerticalScale(scale);
            this.cameraController?.setRenderVerticalScale(scale);
            this.debugOverlay?.setVerticalScaleDisplay(scale);
          },
          onToggleGridLines: (visible) => {
            this.alignmentGridOverlay?.setGridVisible(visible);
          }
        }
      );

      this.annotationTool = new AnnotationTool(
        this.candidateStore,
        this.terrainData,
        this.geoTransform,
        {
          onModeChange: () => {},
          onAnnotationsUpdated: () => {
            this.alignmentGridOverlay?.updateCandidateMarkers(this.candidateStore);
          }
        }
      );

      this.debugOverlay.setVerticalScaleDisplay(this.terrainMeshBuilder.getVerticalScale());

      // Bind canvas pointer click for placing candidate annotations
      this.canvas.addEventListener('click', () => {
        if (!this.raycaster || !this.terrainMeshBuilder || !this.annotationTool || !this.terrainQuery) return;
        
        // Only trigger placement if annotation tool mode is active and not INSPECT
        if (this.annotationTool.getActiveMode() === 'INSPECT') return;

        const hit = this.raycaster.getHit();
        if (hit) {
          const elev = this.terrainQuery.getTerrainHeight(hit.gridX, hit.gridZ);
          this.annotationTool.handleTerrainClick(hit.gridX, hit.gridZ, elev);
        }
      });

      // 6. Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }

      // 7. Start Render Loop
      this.isRunning = true;
      this.animate();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  private animate = (): void => {
    if (!this.isRunning || !this.cameraController) return;

    requestAnimationFrame(this.animate);

    // Update camera controller logic
    this.cameraController.update();

    // Raycast mouse onto terrain mesh
    if (this.raycaster && this.terrainMeshBuilder) {
      const hit = this.raycaster.update(
        this.cameraController.camera,
        this.terrainMeshBuilder.getMesh()
      );
      this.debugOverlay?.updateMouseHitInfo(hit);
    }

    // Update camera stats on overlay
    if (this.debugOverlay) {
      this.debugOverlay.updateCameraInfo(
        this.cameraController.camera.position,
        this.cameraController.getMode()
      );
    }

    // Render Scene
    this.retroRenderer.render(
      this.sceneManager.renderer,
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
