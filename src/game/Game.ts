import { Vector3 } from 'three';
import { CameraController } from '../camera/CameraController';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { GeoTransform } from '../course/GeoTransform';
import { HoleConfig, HoleData } from '../course/HoleData';
import { SurfaceQuery, SurfacePolygon } from '../course/SurfaceQuery';
import { TerrainData } from '../course/TerrainData';
import { TerrainLoader } from '../course/TerrainLoader';
import { TerrainQuery } from '../course/TerrainQuery';
import { MouseRaycaster } from '../debug/MouseRaycaster';
import { ClubManager } from '../golf/Club';
import { SwingMeter } from '../golf/SwingMeter';
import { SophieGolfer } from '../golfer/SophieGolfer';
import { BallPhysics } from '../physics/BallPhysics';
import { AimingGuideRenderer } from '../rendering/AimingGuideRenderer';
import { AlignmentGridOverlay } from '../rendering/AlignmentGridOverlay';
import { BallRenderer } from '../rendering/BallRenderer';
import { FlagRenderer } from '../rendering/FlagRenderer';
import { RetroRenderer } from '../rendering/RetroRenderer';
import { SceneManager } from '../rendering/SceneManager';
import { SurfaceMeshOverlay } from '../rendering/SurfaceMeshOverlay';
import { TerrainMeshBuilder } from '../rendering/TerrainMeshBuilder';
import { AnnotationTool } from '../ui/AnnotationTool';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GameHUD } from '../ui/GameHUD';
import { PlaytestLayoutHUD } from '../ui/PlaytestLayoutHUD';
import { GameStateManager, GameStateType } from './GameState';
import { PlaytestLayoutConfig, PlaytestLayoutManager } from './PlaytestLayout';

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
  private surfaceQuery: SurfaceQuery;
  
  // Systems
  private stateManager: GameStateManager;
  private playtestLayout: PlaytestLayoutConfig | null = null;
  private clubManager: ClubManager;
  private swingMeter: SwingMeter;
  private ballPhysics?: BallPhysics;
  private sophieGolfer?: SophieGolfer;

  // Renderers & Overlays
  private ballRenderer?: BallRenderer;
  private flagRenderer?: FlagRenderer;
  private aimingGuideRenderer?: AimingGuideRenderer;
  private surfaceMeshOverlay?: SurfaceMeshOverlay;
  private alignmentGridOverlay?: AlignmentGridOverlay;
  private candidateStore: CandidateAnnotations;
  private raycaster?: MouseRaycaster;
  private retroRenderer: RetroRenderer;

  // UI Components
  private gameHUD?: GameHUD;
  private layoutHUD?: PlaytestLayoutHUD;
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;

  // Gameplay State Variables
  private strokeCount: number = 0;
  private aimAngleRadians: number = 0;
  private cupPosition: Vector3 = new Vector3();
  private lastFrameTime: number = performance.now();
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    // RetroRenderer preserved for later phases, disabled by default for Phase 0 native resolution
    this.retroRenderer = new RetroRenderer({ targetWidth: 426, targetHeight: 240, enabled: false });
    
    this.stateManager = new GameStateManager();
    this.clubManager = new ClubManager();
    this.swingMeter = new SwingMeter();
    this.surfaceQuery = new SurfaceQuery();
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
      this.ballPhysics = new BallPhysics(this.terrainQuery, this.surfaceQuery);

      // 3. Initialize Camera Controller
      this.cameraController = new CameraController(this.canvas, this.terrainData, this.terrainQuery);

      // 4. Build 3D Terrain Mesh & Surface Overlays
      this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
      const mesh = this.terrainMeshBuilder.getMesh();
      this.sceneManager.scene.add(mesh);

      this.surfaceMeshOverlay = new SurfaceMeshOverlay(this.terrainQuery);
      this.sceneManager.scene.add(this.surfaceMeshOverlay.getGroup());

      // 5. Build Game Objects
      this.ballRenderer = new BallRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.ballRenderer.getGroup());

      this.flagRenderer = new FlagRenderer();
      this.sceneManager.scene.add(this.flagRenderer.getGroup());

      this.aimingGuideRenderer = new AimingGuideRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.aimingGuideRenderer.getGroup());

      this.sophieGolfer = new SophieGolfer();
      this.sceneManager.scene.add(this.sophieGolfer.getGroup());

      // 6. Build Alignment Grid Overlay
      this.alignmentGridOverlay = new AlignmentGridOverlay(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.alignmentGridOverlay.getGroup());

      // 7. Raycaster & UI HUDs
      this.raycaster = new MouseRaycaster(this.canvas);
      
      this.setupHUDs();
      this.setupKeyboardEvents();

      // 8. Phase 0 Primary Experience: Default directly to DEV_ALIGNMENT (Terrain Alignment Viewer)
      this.playtestLayout = PlaytestLayoutManager.load();
      if (this.playtestLayout) {
        const playtestSurfaces: SurfacePolygon[] = HoleData.generatePlaytestSurfaces(this.playtestLayout.tee, this.playtestLayout.hole);
        this.surfaceQuery.setPolygons(playtestSurfaces);
        this.surfaceMeshOverlay?.rebuild(playtestSurfaces);
      }

      this.stateManager.setState('DEV_ALIGNMENT');

      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      // 9. Start Render Loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.animate();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  private initPlaytestLayout(layout: PlaytestLayoutConfig): void {
    this.playtestLayout = layout;

    const playtestSurfaces: SurfacePolygon[] = HoleData.generatePlaytestSurfaces(layout.tee, layout.hole);
    this.surfaceQuery.setPolygons(playtestSurfaces);
    this.surfaceMeshOverlay?.rebuild(playtestSurfaces);

    const cupY = this.terrainQuery!.getTerrainHeight(layout.hole.x, layout.hole.z, true);
    this.cupPosition.set(layout.hole.x, cupY, layout.hole.z);
    this.flagRenderer?.setPosition(this.cupPosition);

    this.strokeCount = 0;
    this.ballPhysics!.setPosition(layout.tee.x, layout.tee.z);

    const dx = layout.hole.x - layout.tee.x;
    const dz = layout.hole.z - layout.tee.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const distToCup = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(distToCup);

    this.stateManager.setState('ADDRESS');
  }

  private setupHUDs(): void {
    this.gameHUD = new GameHUD({
      onAimLeft: () => this.adjustAim(-0.06),
      onAimRight: () => this.adjustAim(0.06),
      onClubPrev: () => this.selectPrevClub(),
      onClubNext: () => this.selectNextClub(),
      onSwingTrigger: () => this.triggerSwingMeter(),
      onCameraToggle: () => this.toggleCameraMode(),
      onResetLayout: () => this.resetLayout(),
      onDevModeToggle: () => this.toggleDevAlignmentMode(),
      onPlayAgain: () => {
        if (this.playtestLayout) {
          this.initPlaytestLayout(this.playtestLayout);
        }
      }
    });

    this.layoutHUD = new PlaytestLayoutHUD((tee, hole) => {
      const saved = PlaytestLayoutManager.save(tee, hole);
      this.initPlaytestLayout(saved);
      this.layoutHUD?.setVisible(false);
    });

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

    this.annotationTool = new AnnotationTool(
      this.candidateStore,
      this.terrainData!,
      this.geoTransform!,
      {
        onModeChange: () => {},
        onAnnotationsUpdated: () => this.alignmentGridOverlay?.updateCandidateMarkers(this.candidateStore)
      }
    );

    this.stateManager.subscribe((newState) => this.handleStateChange(newState));
  }

  private handleStateChange(newState: GameStateType): void {
    const isGameplay = newState === 'ADDRESS' || newState === 'SWINGING' || newState === 'BALL_FLIGHT' || newState === 'BALL_ROLLING' || newState === 'HOLED';
    const isLayoutSel = newState === 'LAYOUT_SELECTION';
    const isDev = newState === 'DEV_ALIGNMENT';

    this.gameHUD?.setVisible(isGameplay);
    this.layoutHUD?.setVisible(isLayoutSel);
    
    // In Phase 0, native resolution is used in DEV_ALIGNMENT mode
    this.retroRenderer.setEnabled(isGameplay);

    const devOverlayElem = (this.debugOverlay as any)?.container;
    const annToolElem = (this.annotationTool as any)?.container;
    const compassElem = (this.debugOverlay as any)?.compassContainer;
    
    if (devOverlayElem) devOverlayElem.style.display = isDev ? 'block' : 'none';
    if (annToolElem) annToolElem.style.display = isDev ? 'block' : 'none';
    if (compassElem) compassElem.style.display = isDev ? 'block' : 'none';

    if (isLayoutSel) {
      this.cameraController?.setMode('OVERHEAD');
    } else if (isGameplay && (newState === 'ADDRESS' || newState === 'SWINGING')) {
      this.cameraController?.setMode('GOLF');
    } else if (isDev) {
      this.cameraController?.setMode('FREE');
    }
  }

  private setupKeyboardEvents(): void {
    window.addEventListener('keydown', (e) => {
      const state = this.stateManager.getState();

      if (e.key === 'F2') {
        this.toggleDevAlignmentMode();
        e.preventDefault();
        return;
      }

      if (state === 'LAYOUT_SELECTION') return;

      if (e.key === ' ' || e.code === 'Space') {
        this.triggerSwingMeter();
        e.preventDefault();
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.adjustAim(-0.06);
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.adjustAim(0.06);
      } else if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        this.selectPrevClub();
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        this.selectNextClub();
      } else if (e.key === 'm' || e.key === 'M') {
        this.toggleCameraMode();
      }
    });

    this.canvas.addEventListener('click', () => {
      const state = this.stateManager.getState();
      const hit = this.raycaster?.getHit();
      if (!hit || !this.terrainQuery) return;

      const elev = this.terrainQuery.getTerrainHeight(hit.gridX, hit.gridZ, true);

      if (state === 'LAYOUT_SELECTION') {
        this.layoutHUD?.handleTerrainClick(hit.gridX, hit.gridZ, elev);
      } else if (state === 'DEV_ALIGNMENT' && this.annotationTool?.getActiveMode() !== 'INSPECT') {
        this.annotationTool?.handleTerrainClick(hit.gridX, hit.gridZ, elev);
      }
    });
  }

  private adjustAim(deltaRad: number): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    this.aimAngleRadians += deltaRad;
  }

  private selectNextClub(): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    this.clubManager.selectNextClub();
  }

  private selectPrevClub(): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    this.clubManager.selectPrevClub();
  }

  private toggleCameraMode(): void {
    if (!this.cameraController) return;
    const current = this.cameraController.getMode();
    this.cameraController.setMode(current === 'GOLF' ? 'OVERHEAD' : 'GOLF');
  }

  private resetLayout(): void {
    PlaytestLayoutManager.clear();
    this.playtestLayout = null;
    this.layoutHUD?.resetSelection();
    this.stateManager.setState('LAYOUT_SELECTION');
  }

  private toggleDevAlignmentMode(): void {
    const current = this.stateManager.getState();
    if (current === 'DEV_ALIGNMENT') {
      if (this.playtestLayout) {
        this.stateManager.setState('ADDRESS');
      } else {
        this.stateManager.setState('LAYOUT_SELECTION');
      }
    } else {
      this.stateManager.setState('DEV_ALIGNMENT');
    }
  }

  private triggerSwingMeter(): void {
    const state = this.stateManager.getState();

    if (state === 'ADDRESS') {
      this.stateManager.setState('SWINGING');
      this.swingMeter.reset();
      this.swingMeter.trigger();
    } else if (state === 'SWINGING') {
      const meterState = this.swingMeter.trigger();
      if (meterState === 'COMPLETE') {
        this.executeSwing();
      }
    }
  }

  private executeSwing(): void {
    const swingResult = this.swingMeter.getResult();
    if (!swingResult || !this.sophieGolfer || !this.ballPhysics) return;

    this.strokeCount++;

    this.sophieGolfer.startProceduralSwing(() => {
      const club = this.clubManager.getCurrentClub();
      this.ballPhysics!.launch(club, swingResult, this.aimAngleRadians);
      this.stateManager.setState('BALL_FLIGHT');
    });
  }

  private animate = (): void => {
    if (!this.isRunning || !this.cameraController) return;

    requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    const state = this.stateManager.getState();

    let mouseHit = null;
    if (this.raycaster && this.terrainMeshBuilder) {
      mouseHit = this.raycaster.update(
        this.cameraController.camera,
        this.terrainMeshBuilder.getMesh()
      );
    }

    if (state === 'SWINGING') {
      this.swingMeter.update(dt);
      if (this.swingMeter.getState() === 'COMPLETE' && this.ballPhysics?.state === 'REST') {
        this.executeSwing();
      }
    } else if (state === 'BALL_FLIGHT' || state === 'BALL_ROLLING') {
      const ballState = this.ballPhysics!.update(dt, this.cupPosition);

      if (ballState === 'ROLLING') {
        this.stateManager.setState('BALL_ROLLING');
      } else if (ballState === 'HOLED') {
        this.stateManager.setState('HOLED');
        this.gameHUD?.showCelebration(this.strokeCount);
      } else if (ballState === 'REST') {
        this.onBallStoppedAtRest();
      }
    }

    if (state === 'ADDRESS' || state === 'SWINGING') {
      if (this.cameraController.getMode() === 'GOLF') {
        this.cameraController.updateGolfAddressView(this.ballPhysics!.position, this.aimAngleRadians);
      } else {
        this.cameraController.update();
      }
    } else if (state === 'BALL_FLIGHT' || state === 'BALL_ROLLING') {
      this.cameraController.updateBallFollowView(
        this.ballPhysics!.position,
        this.ballPhysics!.velocity,
        this.aimAngleRadians
      );
    } else {
      this.cameraController.update();
    }

    if (this.ballRenderer && this.ballPhysics) {
      this.ballRenderer.update(this.ballPhysics.position);
    }

    if (this.flagRenderer) {
      this.flagRenderer.update(this.cameraController.camera.position);
    }

    if (this.sophieGolfer && this.terrainQuery && this.ballPhysics) {
      const terrainY = this.terrainQuery.getTerrainHeight(this.ballPhysics.position.x, this.ballPhysics.position.z, true);
      this.sophieGolfer.updateStance(this.ballPhysics.position, terrainY, this.aimAngleRadians);
      this.sophieGolfer.updateAnimation(dt, this.cameraController.camera);
      this.sophieGolfer.setVisible(state === 'ADDRESS' || state === 'SWINGING');
    }

    if (this.aimingGuideRenderer && this.ballPhysics) {
      const activeClub = this.clubManager.getCurrentClub();
      this.aimingGuideRenderer.update(this.ballPhysics.position, this.aimAngleRadians, activeClub);
      this.aimingGuideRenderer.setVisible(state === 'ADDRESS' || state === 'SWINGING');
    }

    if (this.gameHUD && this.ballPhysics) {
      const distToCup = Math.hypot(
        this.ballPhysics.position.x - this.cupPosition.x,
        this.ballPhysics.position.z - this.cupPosition.z
      );
      const currentLie = this.ballPhysics.getCurrentLie();

      this.gameHUD.updateHUD(
        this.strokeCount,
        distToCup,
        this.clubManager.getCurrentClub(),
        currentLie,
        this.cameraController.getMode()
      );
      this.gameHUD.updateSwingMeter(this.swingMeter);
    }

    if (state === 'DEV_ALIGNMENT' && this.debugOverlay) {
      this.debugOverlay.updateCameraInfo(this.cameraController.camera.position, this.cameraController.getMode());
      this.debugOverlay.updateMouseHitInfo(mouseHit);
    }

    this.retroRenderer.render(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.cameraController.camera
    );
  };

  private onBallStoppedAtRest(): void {
    if (!this.ballPhysics) return;

    const dx = this.cupPosition.x - this.ballPhysics.position.x;
    const dz = this.cupPosition.z - this.ballPhysics.position.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const remainingDist = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(remainingDist);

    this.stateManager.setState('ADDRESS');
  }

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
