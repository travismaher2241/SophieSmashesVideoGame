import { Vector3 } from 'three';
import { CameraController } from '../camera/CameraController';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { CandidateHole6Alignment, getCandidateHole6Alignment } from '../course/CandidateHoleAlignment';
import { GeoTransform } from '../course/GeoTransform';
import { HoleConfig, HoleData } from '../course/HoleData';
import { HoleTransform } from '../course/HoleTransform';
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
import { AlignmentReviewRenderer } from '../rendering/AlignmentReviewRenderer';
import { BallRenderer } from '../rendering/BallRenderer';
import { FlagRenderer } from '../rendering/FlagRenderer';
import { SceneManager } from '../rendering/SceneManager';
import { SurfaceMeshOverlay } from '../rendering/SurfaceMeshOverlay';
import { TerrainMeshBuilder } from '../rendering/TerrainMeshBuilder';
import { AnnotationTool } from '../ui/AnnotationTool';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GameHUD } from '../ui/GameHUD';
import { GameStateManager } from './GameState';

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
  private holeTransform?: HoleTransform;
  private surfaceQuery: SurfaceQuery;

  // Gameplay Core Systems
  private stateManager: GameStateManager;
  private clubManager: ClubManager;
  private swingMeter: SwingMeter;
  private ballPhysics?: BallPhysics;
  private sophieGolfer?: SophieGolfer;

  // Renderers & Visuals
  private ballRenderer?: BallRenderer;
  private flagRenderer?: FlagRenderer;
  private aimingGuideRenderer?: AimingGuideRenderer;
  private surfaceMeshOverlay?: SurfaceMeshOverlay;
  private alignmentGridOverlay?: AlignmentGridOverlay;
  private alignmentReviewRenderer?: AlignmentReviewRenderer;
  private candidateAlignment?: CandidateHole6Alignment;
  private candidateStore: CandidateAnnotations;
  private raycaster?: MouseRaycaster;

  // HUD & UI
  private gameHUD?: GameHUD;
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;

  // Hole State Variables
  private strokeCount: number = 1;
  private aimAngleRadians: number = 0;
  private cupPosition: Vector3 = new Vector3(348, 0, 150);
  private teePosition: Vector3 = new Vector3(100, 0, 150);
  private isDevMode: boolean = false;
  private isRunning: boolean = false;
  private lastFrameTime: number = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    this.stateManager = new GameStateManager();
    this.clubManager = new ClubManager();
    this.swingMeter = new SwingMeter();
    this.surfaceQuery = new SurfaceQuery();
    this.candidateStore = new CandidateAnnotations();
  }

  public async start(courseHolePath: string): Promise<void> {
    try {
      // 1. Load course DEM and Hole Data (fully metadata-driven)
      this.terrainData = await this.terrainLoader.load(courseHolePath);
      this.holeConfig = await HoleData.load(courseHolePath);

      // 2. Initialize Terrain Query, HoleTransform, and Physics
      this.terrainQuery = new TerrainQuery(this.terrainData);
      this.geoTransform = new GeoTransform(this.terrainData);
      this.holeTransform = new HoleTransform(this.terrainData.meta);
      this.ballPhysics = new BallPhysics(this.terrainQuery, this.surfaceQuery);

      // 3. Candidate Alignment Analysis for Developer Review
      this.candidateAlignment = getCandidateHole6Alignment(this.holeTransform);

      // 4. Load course surface polygons
      const courseSurfaces: SurfacePolygon[] = this.holeConfig.surfaces || [];
      this.surfaceQuery.setPolygons(courseSurfaces);

      // 5. Setup Tee and Cup Positions from Course Data
      if (this.holeConfig.tee) {
        this.teePosition.set(this.holeConfig.tee.x, 0, this.holeConfig.tee.z);
      }
      if (this.holeConfig.greenCentre) {
        this.cupPosition.set(this.holeConfig.greenCentre.x, 0, this.holeConfig.greenCentre.z);
      }

      const cupY = this.terrainQuery.getTerrainHeight(this.cupPosition.x, this.cupPosition.z, true);
      this.cupPosition.y = cupY;

      // 6. Initialize Camera Controller (Default: GOLF behind-player camera)
      this.cameraController = new CameraController(this.canvas, this.terrainData, this.terrainQuery);
      this.cameraController.setMode('GOLF');

      // 7. Build 3D Terrain Mesh & Surface Overlays
      this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
      const mesh = this.terrainMeshBuilder.getMesh();
      this.sceneManager.scene.add(mesh);

      this.surfaceMeshOverlay = new SurfaceMeshOverlay(this.terrainQuery);
      this.surfaceMeshOverlay.rebuild(courseSurfaces);
      this.sceneManager.scene.add(this.surfaceMeshOverlay.getGroup());

      // 8. Build Golf Objects (Sophie 2D Pixel-Art Golfer, Ball, Pin/Flag, Aim Line)
      this.sophieGolfer = new SophieGolfer();
      this.sceneManager.scene.add(this.sophieGolfer.getGroup());

      this.ballRenderer = new BallRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.ballRenderer.getGroup());

      this.flagRenderer = new FlagRenderer();
      this.flagRenderer.setPosition(this.cupPosition);
      this.sceneManager.scene.add(this.flagRenderer.getGroup());

      this.aimingGuideRenderer = new AimingGuideRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.aimingGuideRenderer.getGroup());

      // 9. Build Alignment Review Renderer (Candidate geometry overlay in F2 Dev Mode)
      this.alignmentReviewRenderer = new AlignmentReviewRenderer(this.terrainQuery, this.candidateAlignment);
      this.alignmentReviewRenderer.setVisible(false);
      this.sceneManager.scene.add(this.alignmentReviewRenderer.getGroup());

      // 10. Build Alignment Grid & Dev Raycaster (Hidden behind F2)
      this.alignmentGridOverlay = new AlignmentGridOverlay(this.terrainData, this.terrainQuery);
      this.alignmentGridOverlay.setGridVisible(false);
      this.sceneManager.scene.add(this.alignmentGridOverlay.getGroup());

      this.raycaster = new MouseRaycaster(this.canvas);

      // 11. Setup UI HUDs
      this.setupHUDs();
      this.setupKeyboardEvents();

      // 12. Start Round on the Tee
      this.initRoundOnTee();

      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      // 13. Start Render Loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.animate();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  private initRoundOnTee(): void {
    this.strokeCount = 1;
    this.ballPhysics!.setPosition(this.teePosition.x, this.teePosition.z);

    const dx = this.cupPosition.x - this.teePosition.x;
    const dz = this.cupPosition.z - this.teePosition.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const distToCup = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(distToCup);

    this.stateManager.setState('ADDRESS');
    this.cameraController?.setMode('GOLF');

    if (this.gameHUD && this.holeConfig) {
      this.gameHUD.configureHole(
        this.holeConfig.courseName || 'Warragul Country Club',
        this.holeConfig.holeNumber,
        this.holeConfig.par,
        Math.round(distToCup)
      );
      this.gameHUD.hideCelebration();
    }
  }

  private setupHUDs(): void {
    // 1. Primary Gameplay HUD
    this.gameHUD = new GameHUD({
      onAimLeft: () => this.adjustAim(-0.05),
      onAimRight: () => this.adjustAim(0.05),
      onClubPrev: () => this.selectPrevClub(),
      onClubNext: () => this.selectNextClub(),
      onSwingTrigger: () => this.triggerSwingMeter(),
      onCameraToggle: () => this.toggleCameraMode(),
      onResetLayout: () => this.initRoundOnTee(),
      onPlayAgain: () => this.initRoundOnTee()
    });

    // 2. Developer Debug Overlay (Hidden by default, toggled via F2)
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
        onToggleGridLines: (visible) => this.alignmentGridOverlay?.setGridVisible(visible),
        onToggleCandidateReview: (visible) => this.alignmentReviewRenderer?.setVisible(visible)
      },
      this.candidateAlignment
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

    this.updateDevModeVisibility();
  }

  private setupKeyboardEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        this.toggleDevMode();
        e.preventDefault();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        this.triggerSwingMeter();
        e.preventDefault();
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.adjustAim(-0.05);
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.adjustAim(0.05);
      } else if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        this.selectPrevClub();
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        this.selectNextClub();
      } else if (e.key === 'c' || e.key === 'C') {
        this.toggleCameraMode();
      }
    });

    this.canvas.addEventListener('click', () => {
      if (this.isDevMode && this.annotationTool?.getActiveMode() !== 'INSPECT') {
        const hit = this.raycaster?.getHit();
        if (hit && this.terrainQuery) {
          const elev = this.terrainQuery.getTerrainHeight(hit.gridX, hit.gridZ, true);
          this.annotationTool?.handleTerrainClick(hit.gridX, hit.gridZ, elev);
        }
      }
    });
  }

  private adjustAim(deltaRad: number): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    this.aimAngleRadians += deltaRad;
  }

  private selectNextClub(): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    const lie = this.ballPhysics?.getCurrentLie();

    if (lie?.type === 'GREEN') return;

    this.clubManager.selectNextClub();
    this.enforceClubRestrictions();
  }

  private selectPrevClub(): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    const lie = this.ballPhysics?.getCurrentLie();

    if (lie?.type === 'GREEN') return;

    this.clubManager.selectPrevClub();
    this.enforceClubRestrictions();
  }

  private enforceClubRestrictions(): void {
    const lie = this.ballPhysics?.getCurrentLie();
    if (lie?.type === 'BUNKER') {
      const current = this.clubManager.getCurrentClub();
      if (current.id !== 'wedge') {
        while (this.clubManager.getCurrentClub().id !== 'wedge') {
          this.clubManager.selectNextClub();
        }
      }
    } else if (lie?.type === 'GREEN') {
      while (!this.clubManager.getCurrentClub().isPutter) {
        this.clubManager.selectNextClub();
      }
    }
  }

  private toggleCameraMode(): void {
    if (!this.cameraController) return;
    const current = this.cameraController.getMode();
    this.cameraController.setMode(current === 'GOLF' ? 'OVERHEAD' : 'GOLF');
  }

  private toggleDevMode(): void {
    this.isDevMode = !this.isDevMode;
    this.updateDevModeVisibility();
    if (this.isDevMode) {
      this.cameraController?.setMode('OVERHEAD');
      this.alignmentReviewRenderer?.setVisible(true);
      this.alignmentGridOverlay?.setGridVisible(false);
    } else {
      this.cameraController?.setMode('GOLF');
      this.alignmentReviewRenderer?.setVisible(false);
      this.alignmentGridOverlay?.setGridVisible(false);
    }
  }

  private updateDevModeVisibility(): void {
    const devOverlayElem = (this.debugOverlay as any)?.container;
    const annToolElem = (this.annotationTool as any)?.container;
    const compassElem = (this.debugOverlay as any)?.compassContainer;
    const scaleBarElem = (this.debugOverlay as any)?.scaleBarContainer;

    if (devOverlayElem) devOverlayElem.style.display = this.isDevMode ? 'block' : 'none';
    if (annToolElem) annToolElem.style.display = this.isDevMode ? 'block' : 'none';
    if (compassElem) compassElem.style.display = this.isDevMode ? 'block' : 'none';
    if (scaleBarElem) scaleBarElem.style.display = this.isDevMode ? 'block' : 'none';
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
    const isSwinging = state === 'SWINGING';
    const isFlight = state === 'BALL_FLIGHT' || state === 'BALL_ROLLING';
    const isAddress = state === 'ADDRESS' || isSwinging;

    // 1. Raycaster in Dev Mode
    let mouseHit = null;
    if (this.isDevMode && this.raycaster && this.terrainMeshBuilder) {
      mouseHit = this.raycaster.update(
        this.cameraController.camera,
        this.terrainMeshBuilder.getMesh()
      );
    }

    // 2. Swing Meter Update
    if (isSwinging) {
      this.swingMeter.update(dt);
      if (this.swingMeter.getState() === 'COMPLETE' && this.ballPhysics?.state === 'REST') {
        this.executeSwing();
      }
    }

    // 3. Physics Simulation Update
    if (isFlight && this.ballPhysics) {
      const ballState = this.ballPhysics.update(dt, this.cupPosition);

      if (ballState === 'ROLLING') {
        this.stateManager.setState('BALL_ROLLING');
      } else if (ballState === 'HOLED') {
        this.stateManager.setState('HOLED');
        this.gameHUD?.showCelebration(this.strokeCount, this.holeConfig?.par || 4);
      } else if (ballState === 'REST') {
        this.onBallCameToRest();
      }
    }

    // 4. Camera View Update
    if (this.ballPhysics) {
      const lie = this.ballPhysics.getCurrentLie();
      const isPutting = lie.type === 'GREEN';

      if (isAddress && this.cameraController.getMode() === 'GOLF') {
        this.cameraController.updateGolfAddressView(this.ballPhysics.position, this.aimAngleRadians, isPutting);
      } else if (isFlight) {
        this.cameraController.updateBallFollowView(
          this.ballPhysics.position,
          this.ballPhysics.velocity,
          this.aimAngleRadians
        );
      } else {
        this.cameraController.update();
      }
    }

    // 5. Update Visual Game Objects
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
      this.sophieGolfer.setVisible(isAddress);
    }

    if (this.aimingGuideRenderer && this.ballPhysics) {
      const activeClub = this.clubManager.getCurrentClub();
      this.aimingGuideRenderer.update(this.ballPhysics.position, this.aimAngleRadians, activeClub);
      this.aimingGuideRenderer.setVisible(isAddress);
    }

    // 6. Update HUD
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

    // 7. Update Debug Overlay if visible
    if (this.isDevMode && this.debugOverlay) {
      this.debugOverlay.updateCameraInfo(this.cameraController.camera.position, this.cameraController.getMode());
      this.debugOverlay.updateMouseHitInfo(mouseHit);
    }

    // 8. Render 3D Scene at Native Resolution
    this.sceneManager.renderer.render(
      this.sceneManager.scene,
      this.cameraController.camera
    );
  };

  private onBallCameToRest(): void {
    if (!this.ballPhysics) return;

    this.strokeCount++;

    // Reorient aim towards cup
    const dx = this.cupPosition.x - this.ballPhysics.position.x;
    const dz = this.cupPosition.z - this.ballPhysics.position.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const remainingDist = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(remainingDist);
    this.enforceClubRestrictions();

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
