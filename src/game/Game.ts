import { Vector3 } from 'three';
import { CameraController } from '../camera/CameraController';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { GeoTransform } from '../course/GeoTransform';
import { CandidateHole6Alignment, getCandidateHole6Alignment } from '../course/CandidateHoleAlignment';
import { HoleConfig, HoleData } from '../course/HoleData';
import { HoleTransform } from '../course/HoleTransform';
import { SurfaceQuery, SurfacePolygon } from '../course/SurfaceQuery';
import { TerrainData } from '../course/TerrainData';
import { TerrainLoader } from '../course/TerrainLoader';
import { TerrainQuery } from '../course/TerrainQuery';
import { MouseRaycaster } from '../debug/MouseRaycaster';
import { PlaytestSurfaceGenerator } from '../debug/PlaytestSurfaceGenerator';
import { ClubManager } from '../golf/Club';
import { PenaltyRules } from '../golf/PenaltyRules';
import { SwingMeter } from '../golf/SwingMeter';
import { SophieGolfer } from '../golfer/SophieGolfer';
import { BallPhysics } from '../physics/BallPhysics';
import { AimingGuideRenderer } from '../rendering/AimingGuideRenderer';
import { AlignmentGridOverlay } from '../rendering/AlignmentGridOverlay';
import { AlignmentReviewRenderer } from '../rendering/AlignmentReviewRenderer';
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
import { TitleScreen } from '../ui/TitleScreen';
import { GameStateManager, GameStateType } from './GameState';
import { PlaytestLayoutConfig, PlaytestLayoutManager } from './PlaytestLayout';

export interface GameHoleSource {
  holePath: string;
  holeName: string;
}

export interface GameSource {
  terrainPath: string;
  courseName: string;
  courseSubtitle: string;
  totalPar: number;
  holes: GameHoleSource[];
  isResearchMode?: boolean;
}

export const SOPHIE_HILLS_CONFIG: GameSource = {
  terrainPath: '/courses/sophie-hills',
  courseName: 'Sophie Hills (Fictional)',
  courseSubtitle: 'Two-Hole Preview',
  totalPar: 7,
  holes: [
    { holePath: '/courses/sophie-hills/hole-01', holeName: 'Sunset Run' },
    { holePath: '/courses/sophie-hills/hole-02', holeName: 'Creekside Carry' }
  ]
};

export const WARRAGUL_RESEARCH_CONFIG: GameSource = {
  terrainPath: '/courses/warragul/hole-06',
  courseName: 'Warragul Country Club (Research Mode)',
  courseSubtitle: 'Hole 6 Alignment & GIS Study',
  totalPar: 4,
  holes: [
    { holePath: '/courses/warragul/hole-06', holeName: 'Hole 6 (Provisional)' }
  ],
  isResearchMode: true
};

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
  private penaltyRules?: PenaltyRules;
  private sophieGolfer?: SophieGolfer;

  // Renderers & Overlays
  private ballRenderer?: BallRenderer;
  private flagRenderer?: FlagRenderer;
  private aimingGuideRenderer?: AimingGuideRenderer;
  private surfaceMeshOverlay?: SurfaceMeshOverlay;
  private alignmentGridOverlay?: AlignmentGridOverlay;
  private alignmentReviewRenderer?: AlignmentReviewRenderer;
  private candidateAlignment?: CandidateHole6Alignment;
  private candidateStore: CandidateAnnotations;
  private raycaster?: MouseRaycaster;
  private retroRenderer: RetroRenderer;

  // UI Components
  private gameHUD?: GameHUD;
  private layoutHUD?: PlaytestLayoutHUD;
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;
  private titleScreen?: TitleScreen;

  // Gameplay State Variables
  private strokeCount: number = 0;
  private penaltyStrokes: number = 0;
  /** Guards against the same completed swing being played more than once. */
  private swingExecuted: boolean = false;
  /** Where the stroke currently in flight was played from, for stroke-and-distance relief. */
  private shotOrigin: { x: number; z: number } = { x: 0, z: 0 };
  private aimAngleRadians: number = 0; // 0 = facing +X
  private cupPosition: Vector3 = new Vector3();
  private lastFrameTime: number = performance.now();
  private isRunning: boolean = false;
  private source?: GameSource;
  private defaultSource?: GameSource;
  private configuredLayout: PlaytestLayoutConfig | null = null;
  private isPracticeMode: boolean = false;
  private isRoundActive: boolean = false;
  private holeIndex: number = 0;
  private completedHoleScores: Array<{ strokes: number; penaltyStrokes: number; par: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    this.retroRenderer = new RetroRenderer({ targetWidth: 426, targetHeight: 240, enabled: true });

    this.stateManager = new GameStateManager();
    this.clubManager = new ClubManager();
    this.swingMeter = new SwingMeter();
    this.surfaceQuery = new SurfaceQuery();
    this.candidateStore = new CandidateAnnotations();
  }

  public async start(source?: string | GameSource): Promise<void> {
    try {
      const parsedSource: GameSource = typeof source === 'string'
        ? {
            terrainPath: source,
            courseName: 'Warragul Country Club (Research Mode)',
            courseSubtitle: 'Playtest Layout',
            totalPar: 4,
            holes: [{ holePath: source, holeName: 'Playtest Layout' }],
            isResearchMode: true
          }
        : (source ?? SOPHIE_HILLS_CONFIG);

      if (parsedSource.holes.length === 0) {
        throw new Error('Sophie Golf needs at least one hole in the course playlist.');
      }

      this.defaultSource = parsedSource;
      await this.loadCourse(parsedSource, 0);

      this.setupHUDs();
      this.setupKeyboardEvents();

      // Check URL parameters for dev alignment mode (?debug=alignment)
      const urlParams = new URLSearchParams(window.location.search);
      const isDevUrl = urlParams.get('debug') === 'alignment';
      const isScorecardDebug = urlParams.get('debug') === 'scorecard';

      if (isDevUrl) {
        await this.enterResearchMode();
      } else if (this.configuredLayout) {
        this.initPlaytestLayout(this.configuredLayout);
        if (isScorecardDebug) {
          this.finishHoleForScorecard(this.holeConfig?.par ?? 4, 0);
        } else {
          this.isRoundActive = false;
          this.stateManager.setState('TITLE');
        }
      } else if (!this.playtestLayout) {
        this.stateManager.setState('LAYOUT_SELECTION');
      } else {
        this.initPlaytestLayout(this.playtestLayout);
      }

      // Hide loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      // Start Render Loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.animate();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  public async loadCourse(source: GameSource, holeIndex: number = 0): Promise<void> {
    this.source = source;
    this.holeIndex = holeIndex;

    // 1. Load course DEM data
    this.terrainData = await this.terrainLoader.load(source.terrainPath);
    this.holeConfig = await HoleData.load(source.holes[holeIndex].holePath);

    // 2. Initialize Terrain & Surface Query Systems
    this.terrainQuery = new TerrainQuery(this.terrainData);
    this.geoTransform = new GeoTransform(this.terrainData);
    this.ballPhysics = new BallPhysics(this.terrainQuery, this.surfaceQuery);
    this.penaltyRules = new PenaltyRules(this.terrainQuery, this.surfaceQuery);
    this.configuredLayout = this.getConfiguredLayout();

    // 3. Initialize / Update Camera Controller
    if (!this.cameraController) {
      this.cameraController = new CameraController(this.canvas, this.terrainData, this.terrainQuery);
    } else {
      this.cameraController.setTerrain(this.terrainData, this.terrainQuery);
    }

    // 4. Build 3D Terrain Mesh
    if (this.terrainMeshBuilder) {
      this.sceneManager.scene.remove(this.terrainMeshBuilder.getMesh());
    }
    this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
    this.sceneManager.scene.add(this.terrainMeshBuilder.getMesh());

    // 5. Build / Update Surface Overlays
    if (!this.surfaceMeshOverlay) {
      this.surfaceMeshOverlay = new SurfaceMeshOverlay(this.terrainQuery);
      this.sceneManager.scene.add(this.surfaceMeshOverlay.getGroup());
    } else {
      this.surfaceMeshOverlay.setTerrainQuery(this.terrainQuery);
    }

    // 6. Build / Update Game Objects
    if (!this.ballRenderer) {
      this.ballRenderer = new BallRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.ballRenderer.getGroup());
    } else {
      this.ballRenderer.setTerrainQuery(this.terrainQuery);
    }

    if (!this.flagRenderer) {
      this.flagRenderer = new FlagRenderer();
      this.sceneManager.scene.add(this.flagRenderer.getGroup());
    }

    if (!this.aimingGuideRenderer) {
      this.aimingGuideRenderer = new AimingGuideRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.aimingGuideRenderer.getGroup());
    } else {
      this.aimingGuideRenderer.setTerrainQuery(this.terrainQuery);
    }

    if (!this.sophieGolfer) {
      this.sophieGolfer = new SophieGolfer();
      this.sceneManager.scene.add(this.sophieGolfer.getGroup());
    }

    // 7. Raycaster
    if (!this.raycaster) {
      this.raycaster = new MouseRaycaster(this.canvas);
    }

    // 8. Research / Alignment tooling (ISOLATED: only if source is research mode)
    if (source.isResearchMode) {
      this.setupResearchTools();
    } else {
      this.teardownResearchTools();
    }

    this.titleScreen?.updateConfig({
      courseName: source.courseName,
      courseSubtitle: source.courseSubtitle,
      holeCount: source.holes.length,
      totalPar: source.totalPar
    });

    this.configureGameHUD();
  }

  private setupResearchTools(): void {
    if (!this.terrainData || !this.terrainQuery || !this.geoTransform || !this.holeConfig) return;

    const holeTransform = new HoleTransform(this.terrainData.meta);
    this.candidateAlignment = getCandidateHole6Alignment(holeTransform);

    if (!this.alignmentGridOverlay) {
      this.alignmentGridOverlay = new AlignmentGridOverlay(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.alignmentGridOverlay.getGroup());
    }

    if (!this.alignmentReviewRenderer) {
      this.alignmentReviewRenderer = new AlignmentReviewRenderer(this.terrainQuery, this.candidateAlignment);
      this.alignmentReviewRenderer.setVisible(false);
      this.sceneManager.scene.add(this.alignmentReviewRenderer.getGroup());
    }

    if (!this.debugOverlay) {
      this.debugOverlay = new DebugOverlay(
        this.terrainData,
        this.holeConfig,
        this.terrainQuery,
        this.geoTransform,
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
    }

    if (!this.annotationTool) {
      this.annotationTool = new AnnotationTool(
        this.candidateStore,
        this.terrainData,
        this.geoTransform,
        {
          onModeChange: () => {},
          onAnnotationsUpdated: () => this.alignmentGridOverlay?.updateCandidateMarkers(this.candidateStore)
        }
      );
    }
  }

  private teardownResearchTools(): void {
    this.alignmentGridOverlay?.setGridVisible(false);
    this.alignmentReviewRenderer?.setVisible(false);
    this.debugOverlay?.setVisible(false);
    this.annotationTool?.setVisible(false);
  }

  private initPlaytestLayout(layout: PlaytestLayoutConfig): void {
    // A layout restored from localStorage may predate the current terrain crop.
    if (!this.isWithinTerrain(layout.tee) || !this.isWithinTerrain(layout.hole)) {
      console.warn('Saved playtest layout falls outside the loaded terrain extent; asking for a new one.');
      this.resetLayout();
      return;
    }

    this.playtestLayout = layout;
    this.isRoundActive = true;

    const surfaces = this.resolveSurfaces(layout);
    this.surfaceQuery.setPolygons(surfaces);
    this.surfaceMeshOverlay?.rebuild(surfaces);

    // Cup position. Clamping is correct here: the layout is already bounds-checked,
    // and this is a render/placement lookup rather than a ball-in-play query.
    const cupY = this.terrainQuery!.getTerrainHeight(layout.hole.x, layout.hole.z, true);
    this.cupPosition.set(layout.hole.x, cupY, layout.hole.z);
    this.flagRenderer?.setPosition(this.cupPosition);

    // Ball position at Tee
    this.strokeCount = 0;
    this.penaltyStrokes = 0;
    this.shotOrigin = { x: layout.tee.x, z: layout.tee.z };
    this.ballPhysics!.setPosition(layout.tee.x, layout.tee.z);

    // Aim angle pointing from Tee directly to Hole
    const dx = layout.hole.x - layout.tee.x;
    const dz = layout.hole.z - layout.tee.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    // Auto-select club for distance
    const distToCup = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(distToCup);

    this.stateManager.setState('ADDRESS');
  }

  private getConfiguredLayout(): PlaytestLayoutConfig | null {
    const tee = this.holeConfig?.tee;
    const green = this.holeConfig?.greenCentre;
    if (!tee || !green || !this.terrainQuery) return null;

    const teeElevation = this.terrainQuery.getTerrainHeight(tee.x, tee.z, true);
    const greenElevation = this.terrainQuery.getTerrainHeight(green.x, green.z, true);
    return {
      tee: { x: tee.x, z: tee.z, elevation: teeElevation },
      hole: { x: green.x, z: green.z, elevation: greenElevation },
      distanceMetres: Math.round(Math.hypot(green.x - tee.x, green.z - tee.z)),
      isConfigured: true,
      savedAt: 'course-data'
    };
  }

  /**
   * Resolve the course surfaces for play.
   *
   * There is exactly one consumer path (§15): SurfaceQuery and SurfaceMeshOverlay are
   * handed SurfacePolygon[] and neither knows nor cares where it came from. Verified
   * geometry in hole.json always wins; the development placeholder only fills in while
   * Hole 6 is unsurveyed, and everything it produces is flagged provisional.
   */
  private resolveSurfaces(layout: PlaytestLayoutConfig): SurfacePolygon[] {
    const authored = this.holeConfig?.surfaces ?? [];
    if (!this.isPracticeMode && authored.length > 0) {
      return authored;
    }

    console.info(
      `[SOPHIE GOLF] ${this.holeConfig?.courseId}/${this.holeConfig?.holeId} has no traced surfaces in hole.json. ` +
      'Falling back to development placeholder geometry — lies reported here are not the real course.'
    );
    return PlaytestSurfaceGenerator.generate(layout.tee, layout.hole);
  }

  private isWithinTerrain(point: { x: number; z: number }): boolean {
    if (!this.terrainData) return false;
    return (
      point.x >= 0 && point.x <= this.terrainData.vertexExtentX &&
      point.z >= 0 && point.z <= this.terrainData.vertexExtentZ
    );
  }

  private setupHUDs(): void {
    // 1. Playable Game HUD
    this.gameHUD = new GameHUD({
      onAimLeft: () => this.adjustAim(-0.06),
      onAimRight: () => this.adjustAim(0.06),
      onClubPrev: () => this.selectPrevClub(),
      onClubNext: () => this.selectNextClub(),
      onSwingTrigger: () => this.triggerSwingMeter(),
      onCameraToggle: () => this.toggleCameraMode(),
      onResetLayout: () => this.handleMenuAction(),
      onDevModeToggle: () => void this.toggleDevAlignmentMode(),
      onPlayAgain: () => void this.handleScorecardAction(),
      onReturnToTitle: () => void this.returnToTitle()
    });

    this.configureGameHUD();

    this.titleScreen = new TitleScreen({
      courseName: this.source?.courseName ?? 'Sophie Hills (Fictional)',
      courseSubtitle: this.source?.courseSubtitle ?? 'Two-Hole Preview',
      holeCount: this.source?.holes.length ?? 2,
      totalPar: this.source?.totalPar ?? 7,
      onStart: () => void this.startConfiguredRound(),
      onOpenPractice: () => void this.enterResearchMode()
    });

    // 2. Playtest Layout HUD (used for research mode / provisional layout)
    this.layoutHUD = new PlaytestLayoutHUD(
      (tee, hole) => {
        const saved = PlaytestLayoutManager.save(tee, hole);
        this.initPlaytestLayout(saved);
        this.configureGameHUD();
        this.layoutHUD?.setVisible(false);
      },
      () => void this.returnToTitle()
    );

    // Listen to state changes.
    this.stateManager.subscribe((newState) => this.handleStateChange(newState));
    this.handleStateChange(this.stateManager.getState());
  }

  private handleStateChange(newState: GameStateType): void {
    const isGameplay = newState === 'ADDRESS' || newState === 'SWINGING' || newState === 'BALL_FLIGHT' || newState === 'BALL_ROLLING' || newState === 'HOLED';
    const isLayoutSel = newState === 'LAYOUT_SELECTION';
    const isDev = newState === 'DEV_ALIGNMENT';
    const isTitle = newState === 'TITLE';

    this.gameHUD?.setVisible(isGameplay);
    this.layoutHUD?.setVisible(isLayoutSel);
    this.titleScreen?.setVisible(isTitle);

    // Dev overlay & annotation tool visible ONLY in DEV_ALIGNMENT mode
    this.debugOverlay?.setVisible(isDev);
    this.annotationTool?.setVisible(isDev);
    this.alignmentReviewRenderer?.setVisible(isDev);

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
        void this.toggleDevAlignmentMode();
        e.preventDefault();
        return;
      }

      if (state === 'TITLE') {
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
          void this.startConfiguredRound();
          e.preventDefault();
        }
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

    // Canvas click event for Layout selection / Dev annotation
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

  private async startConfiguredRound(): Promise<void> {
    this.isPracticeMode = false;
    this.completedHoleScores = [];

    if (this.holeIndex !== 0) {
      await this.loadCourseHole(0);
    }

    if (!this.configuredLayout) return;
    this.configureGameHUD();
    this.initPlaytestLayout(this.configuredLayout);
  }

  private async loadCourseHole(index: number): Promise<void> {
    const holeSource = this.source?.holes[index];
    if (!holeSource) {
      throw new Error(`Cannot load Sophie Hills hole index ${index}: it is not in the course playlist.`);
    }

    this.holeConfig = await HoleData.load(holeSource.holePath);
    this.holeIndex = index;
    this.configuredLayout = this.getConfiguredLayout();
    this.playtestLayout = this.configuredLayout;
    this.configureGameHUD();
  }

  private async handleScorecardAction(): Promise<void> {
    this.gameHUD?.hideCelebration();

    if (this.isPracticeMode) {
      if (this.playtestLayout) this.initPlaytestLayout(this.playtestLayout);
      return;
    }

    const nextHoleIndex = this.holeIndex + 1;
    if (nextHoleIndex < (this.source?.holes.length ?? 0)) {
      await this.loadCourseHole(nextHoleIndex);
      if (this.configuredLayout) this.initPlaytestLayout(this.configuredLayout);
      return;
    }

    await this.startConfiguredRound();
  }

  private async enterResearchMode(): Promise<void> {
    try {
      this.isPracticeMode = true;
      this.isRoundActive = false;
      await this.loadCourse(WARRAGUL_RESEARCH_CONFIG, 0);
      PlaytestLayoutManager.clear();
      this.playtestLayout = null;
      this.layoutHUD?.resetSelection();
      this.configureGameHUD();
      this.stateManager.setState('DEV_ALIGNMENT');
    } catch (err) {
      console.error('Error entering Warragul Research Mode:', err);
      this.showErrorModal((err as Error).message || String(err));
    }
  }

  private handleMenuAction(): void {
    void this.returnToTitle();
  }

  private async returnToTitle(): Promise<void> {
    this.gameHUD?.hideCelebration();
    if (this.isPracticeMode || this.source?.isResearchMode) {
      this.isPracticeMode = false;
      this.isRoundActive = false;
      if (this.defaultSource) {
        await this.loadCourse(this.defaultSource, 0);
      }
    }
    this.isRoundActive = false;
    this.playtestLayout = this.configuredLayout;
    this.configureGameHUD();
    this.stateManager.setState('TITLE');
  }

  private configureGameHUD(): void {
    if (this.isPracticeMode || this.source?.isResearchMode) {
      this.gameHUD?.configureHole({
        courseName: 'Warragul Research Mode',
        holeName: 'Hole 6 (Provisional)',
        holeNumber: 6,
        par: 4,
        distanceMetres: this.playtestLayout?.distanceMetres ?? 248,
        menuLabel: '⌂ MAIN MENU'
      });
      return;
    }

    this.gameHUD?.configureHole({
      courseName: this.source?.courseName ?? 'Sophie Hills (Fictional)',
      holeName: this.getCurrentHoleName(),
      holeNumber: this.holeConfig?.holeNumber ?? 1,
      par: this.holeConfig?.par ?? 4,
      distanceMetres: this.holeConfig?.publishedLengthMetres ?? 0,
      menuLabel: '⌂ MAIN MENU'
    });
  }

  private getCurrentHoleName(): string {
    return this.source?.holes[this.holeIndex]?.holeName ?? 'Playtest Hole';
  }

  private resetLayout(): void {
    PlaytestLayoutManager.clear();
    this.playtestLayout = null;
    this.isRoundActive = false;
    this.layoutHUD?.resetSelection();
    this.configureGameHUD();
    this.stateManager.setState('LAYOUT_SELECTION');
  }

  private async toggleDevAlignmentMode(): Promise<void> {
    const current = this.stateManager.getState();
    if (current === 'DEV_ALIGNMENT') {
      if (!this.isRoundActive && !this.isPracticeMode) {
        await this.returnToTitle();
      } else if (this.playtestLayout) {
        this.stateManager.setState('ADDRESS');
      } else {
        this.stateManager.setState('LAYOUT_SELECTION');
      }
    } else {
      if (!this.source?.isResearchMode) {
        await this.enterResearchMode();
      } else {
        this.stateManager.setState('DEV_ALIGNMENT');
      }
    }
  }

  private triggerSwingMeter(): void {
    const state = this.stateManager.getState();

    if (state === 'ADDRESS') {
      this.stateManager.setState('SWINGING');
      this.swingMeter.reset();
      this.swingExecuted = false;
      this.swingMeter.trigger(); // Start power rising
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

    // A completed meter is reachable from two directions: the player's third input, and
    // the animate loop noticing the meter auto-completed because that input never came.
    // Both must resolve to exactly one stroke — re-entering here restarts Sophie's
    // backswing before it reaches impact, so the ball would never actually be struck.
    if (this.swingExecuted) return;
    this.swingExecuted = true;

    this.strokeCount++;

    // Remember where this stroke was played from, in case it needs replaying under
    // stroke-and-distance relief.
    this.shotOrigin = { x: this.ballPhysics.position.x, z: this.ballPhysics.position.z };

    // Trigger Sophie procedural swing animation
    this.sophieGolfer.startProceduralSwing(() => {
      const club = this.clubManager.getCurrentClub();

      // Launch ball physics
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

    // 1. Raycaster update
    let mouseHit = null;
    if (this.raycaster && this.terrainMeshBuilder) {
      mouseHit = this.raycaster.update(
        this.cameraController.camera,
        this.terrainMeshBuilder.getMesh()
      );
    }

    // 2. Physics & State Machine update
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
        const holeTotal = this.strokeCount + this.penaltyStrokes;
        this.finishHoleForScorecard(holeTotal, this.penaltyStrokes);
      } else if (ballState === 'REST') {
        this.onBallStoppedAtRest();
      }
    }

    // 3. Update Camera View
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

    // 4. Update 3D Object Renderers
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

    // 5. Update HUDs & Readouts
    if (this.gameHUD && this.ballPhysics) {
      const distToCup = Math.hypot(
        this.ballPhysics.position.x - this.cupPosition.x,
        this.ballPhysics.position.z - this.cupPosition.z
      );
      const currentLie = this.ballPhysics.getCurrentLie();

      this.gameHUD.updateHUD(
        this.strokeCount + this.penaltyStrokes,
        this.penaltyStrokes,
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

    // 6. Render Scene (via 2-pass pixel upscaling RetroRenderer)
    this.retroRenderer.render(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.cameraController.camera
    );
  };

  private onBallStoppedAtRest(): void {
    if (!this.ballPhysics) return;

    this.applyPenaltyRelief();

    const dx = this.cupPosition.x - this.ballPhysics.position.x;
    const dz = this.cupPosition.z - this.ballPhysics.position.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const remainingDist = Math.hypot(dx, dz);
    this.clubManager.autoSelectClubForDistance(remainingDist);

    this.stateManager.setState('ADDRESS');
  }

  private finishHoleForScorecard(holeTotal: number, penaltyStrokes: number): void {
    this.stateManager.setState('HOLED');
    this.isRoundActive = false;
    const holePar = this.isPracticeMode ? 4 : (this.holeConfig?.par ?? 4);

    if (this.isPracticeMode) {
      this.gameHUD?.configureCompletionAction('↻ PLAY AGAIN');
    } else {
      this.completedHoleScores[this.holeIndex] = {
        strokes: holeTotal,
        penaltyStrokes,
        par: holePar
      };
      const isFinalHole = this.holeIndex === (this.source?.holes.length ?? 1) - 1;
      this.gameHUD?.configureCompletionAction(isFinalHole ? '↻ PLAY COURSE AGAIN' : 'NEXT HOLE →');
    }

    const completedScores = this.completedHoleScores.filter(Boolean);
    const courseProgress = this.isPracticeMode ? undefined : {
      holesPlayed: completedScores.length,
      holeCount: this.source?.holes.length ?? 1,
      totalStrokes: completedScores.reduce((sum, score) => sum + score.strokes, 0),
      totalPar: completedScores.reduce((sum, score) => sum + score.par, 0)
    };
    this.gameHUD?.showCelebration(holeTotal, penaltyStrokes, holePar, courseProgress);
  }

  /**
   * Put the ball back in play if it came to rest somewhere the rules do not allow it
   * to be played from (§17, §18). Without this a ball in water, out of bounds, or off
   * the mapped terrain leaves the player with no legal move.
   */
  private applyPenaltyRelief(): void {
    if (!this.ballPhysics || !this.penaltyRules) return;

    const ruling = this.penaltyRules.evaluate(
      this.ballPhysics.getCurrentLie(),
      { x: this.ballPhysics.position.x, z: this.ballPhysics.position.z },
      this.shotOrigin,
      this.ballPhysics.leftTerrain
    );

    if (!ruling) return;

    this.penaltyStrokes += ruling.penaltyStrokes;
    this.ballPhysics.setPosition(ruling.dropPosition.x, ruling.dropPosition.z);
    this.gameHUD?.showPenalty(ruling.headline, ruling.detail);
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
