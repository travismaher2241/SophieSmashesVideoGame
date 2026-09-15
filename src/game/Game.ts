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
import { PuttMeter, PuttResult } from '../golf/PuttMeter';
import { SophieGolfer } from '../golfer/SophieGolfer';
import { BallPhysics } from '../physics/BallPhysics';
import { PuttingPhysics } from '../physics/PuttingPhysics';
import { AimingGuideRenderer } from '../rendering/AimingGuideRenderer';
import { AlignmentGridOverlay } from '../rendering/AlignmentGridOverlay';
import { AlignmentReviewRenderer } from '../rendering/AlignmentReviewRenderer';
import { BallRenderer } from '../rendering/BallRenderer';
import { CourseEnvironment } from '../rendering/CourseEnvironment';
import { FlagRenderer } from '../rendering/FlagRenderer';
import { GreenBreakRenderer } from '../rendering/GreenBreakRenderer';
import { RetroRenderer } from '../rendering/RetroRenderer';
import { SceneManager } from '../rendering/SceneManager';
import { SurfaceMeshOverlay } from '../rendering/SurfaceMeshOverlay';
import { TerrainMeshBuilder } from '../rendering/TerrainMeshBuilder';
import { TreeRenderer } from '../rendering/TreeRenderer';
import { AnnotationTool } from '../ui/AnnotationTool';
import { DebugOverlay } from '../ui/DebugOverlay';
import { GameHUD, ShotMode } from '../ui/GameHUD';
import { PlaytestLayoutHUD } from '../ui/PlaytestLayoutHUD';
import { TitleScreen } from '../ui/TitleScreen';
import { GameStateManager, GameStateType } from './GameState';
import { PlaytestLayoutConfig, PlaytestLayoutManager } from './PlaytestLayout';

export interface GameHoleSource {
  holePath: string;
  holeName: string;
  /**
   * Terrain directory for this hole, overriding the course-level one.
   *
   * Holes authored at true scale need more room than a shared course-wide
   * heightfield can give them, and a hole traced from real ground needs its own
   * elevation rather than a neighbour's. A hole with its own terrain owns its
   * coordinate space: its polygons are local to that field, not to the course.
   */
  terrainPath?: string;
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
  courseName: 'Sophie Hills',
  courseSubtitle: 'Front Nine',
  totalPar: 35,
  holes: [
    // Hole 1 is authored at true scale on its own heightfield; the rest still share
    // the course-wide field until they are rebuilt the same way.
    {
      holePath: '/courses/sophie-hills/hole-01',
      holeName: 'Clubhouse Climb',
      terrainPath: '/courses/sophie-hills/hole-01'
    },
    { holePath: '/courses/sophie-hills/hole-02', holeName: 'Creekside Carry' },
    { holePath: '/courses/sophie-hills/hole-03', holeName: 'Wattle Bend' },
    { holePath: '/courses/sophie-hills/hole-04', holeName: 'Long Paddock' },
    { holePath: '/courses/sophie-hills/hole-05', holeName: 'Gumtree Rise' },
    { holePath: '/courses/sophie-hills/hole-06', holeName: 'Billabong' },
    { holePath: '/courses/sophie-hills/hole-07', holeName: 'Ridge Runner' },
    { holePath: '/courses/sophie-hills/hole-08', holeName: 'Sandbelt Turn' },
    { holePath: '/courses/sophie-hills/hole-09', holeName: 'Homeward Bound' }
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
  private puttMeter: PuttMeter;
  private ballPhysics?: BallPhysics;
  private puttingPhysics?: PuttingPhysics;
  private penaltyRules?: PenaltyRules;
  private sophieGolfer?: SophieGolfer;

  // Renderers & Overlays
  private ballRenderer?: BallRenderer;
  private flagRenderer?: FlagRenderer;
  private aimingGuideRenderer?: AimingGuideRenderer;
  private greenBreakRenderer?: GreenBreakRenderer;
  private surfaceMeshOverlay?: SurfaceMeshOverlay;
  private alignmentGridOverlay?: AlignmentGridOverlay;
  private alignmentReviewRenderer?: AlignmentReviewRenderer;
  private candidateAlignment?: CandidateHole6Alignment;
  private candidateStore: CandidateAnnotations;
  private raycaster?: MouseRaycaster;
  private retroRenderer: RetroRenderer;
  private courseEnvironment?: CourseEnvironment;
  private treeRenderer?: TreeRenderer;

  // UI Components
  private gameHUD?: GameHUD;
  private layoutHUD?: PlaytestLayoutHUD;
  private debugOverlay?: DebugOverlay;
  private annotationTool?: AnnotationTool;
  private titleScreen?: TitleScreen;

  // Gameplay State Variables
  private strokeCount: number = 0;
  private penaltyStrokes: number = 0;
  private shotMode: ShotMode = 'FULL_SWING';
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
  /** Terrain directory currently loaded, so hole changes only reload it when it differs. */
  private loadedTerrainPath?: string;
  private completedHoleScores: Array<{ strokes: number; penaltyStrokes: number; par: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.sceneManager = new SceneManager(this.canvas);
    // Retain a lightly pixel-art-directed image without turning a large display into giant blocks.
    this.retroRenderer = new RetroRenderer({ targetWidth: 1280, targetHeight: 720, enabled: true });

    this.stateManager = new GameStateManager();
    this.clubManager = new ClubManager();
    this.swingMeter = new SwingMeter();
    this.puttMeter = new PuttMeter();
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
        throw new Error('Sophie Smashes needs at least one hole in the course playlist.');
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
    const terrainPath = Game.resolveTerrainPath(source, holeIndex);
    this.terrainData = await this.terrainLoader.load(terrainPath);
    this.loadedTerrainPath = terrainPath;
    this.holeConfig = await HoleData.load(source.holes[holeIndex].holePath);

    // 2. Initialize Terrain & Surface Query Systems
    this.terrainQuery = new TerrainQuery(this.terrainData);
    this.geoTransform = new GeoTransform(this.terrainData);
    this.ballPhysics = new BallPhysics(this.terrainQuery, this.surfaceQuery);
    this.puttingPhysics = new PuttingPhysics(this.terrainQuery);
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

    if (this.courseEnvironment) {
      this.sceneManager.scene.remove(this.courseEnvironment.getGroup());
    }
    if (!source.isResearchMode) {
      this.courseEnvironment = new CourseEnvironment(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.courseEnvironment.getGroup());
    } else {
      this.courseEnvironment = undefined;
    }

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

    if (!this.treeRenderer) {
      this.treeRenderer = new TreeRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.treeRenderer.getGroup());
    } else {
      this.treeRenderer.setTerrainQuery(this.terrainQuery);
    }

    if (!this.greenBreakRenderer) {
      this.greenBreakRenderer = new GreenBreakRenderer(this.terrainQuery);
      this.sceneManager.scene.add(this.greenBreakRenderer.getGroup());
    } else {
      this.greenBreakRenderer.setTerrainQuery(this.terrainQuery);
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

    if (!this.debugOverlay && this.terrainData && this.holeConfig && this.terrainQuery && this.geoTransform) {
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
      this.debugOverlay.setVisible(this.isDebugOverlayVisible);
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
    this.cameraController?.setOverheadHole(layout.tee, layout.hole);

    const surfaces = this.resolveSurfaces(layout);
    this.surfaceQuery.setPolygons(surfaces);
    this.surfaceMeshOverlay?.rebuild(surfaces);

    // Authored trees where the hole supplies them, procedural corridor framing otherwise.
    this.treeRenderer?.populateCourseTrees(
      { x: layout.tee.x, z: layout.tee.z },
      { x: layout.hole.x, z: layout.hole.z },
      this.holeConfig?.trees
    );

    // Cup position. Clamping is correct here: the layout is already bounds-checked,
    // and this is a render/placement lookup rather than a ball-in-play query.
    const cupY = this.terrainQuery!.getTerrainHeight(layout.hole.x, layout.hole.z, true);
    this.cupPosition.set(layout.hole.x, cupY, layout.hole.z);
    this.flagRenderer?.setPosition(this.cupPosition);

    // Ball position at Tee
    this.strokeCount = 0;
    this.penaltyStrokes = 0;
    this.swingExecuted = false;
    this.swingMeter.reset();
    this.sophieGolfer?.resetPose();
    this.ballRenderer?.clearTracer();
    this.shotOrigin = { x: layout.tee.x, z: layout.tee.z };
    this.ballPhysics!.setPosition(layout.tee.x, layout.tee.z);

    // Aim angle pointing from Tee directly to Hole
    const dx = layout.hole.x - layout.tee.x;
    const dz = layout.hole.z - layout.tee.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    // Auto-select club for distance
    const distToCup = Math.hypot(dx, dz);
    const isOnGreen = this.ballPhysics?.getCurrentLie().type === 'GREEN';
    this.clubManager.autoSelectClubForDistance(distToCup, isOnGreen);
    const club = this.clubManager.getCurrentClub();
    this.shotMode = (isOnGreen || club.isPutter) ? 'PUTTING' : 'FULL_SWING';

    this.gameHUD?.setShotMode(this.shotMode);
    this.flagRenderer?.setPuttingMode(this.shotMode === 'PUTTING');

    if (this.shotMode === 'PUTTING') {
      this.greenBreakRenderer?.generateGrid(this.ballPhysics!.position, this.cupPosition);
      this.puttMeter.reset(distToCup);
    } else {
      this.greenBreakRenderer?.setVisible(false);
    }

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
      `[SOPHIE SMASHES] ${this.holeConfig?.courseId}/${this.holeConfig?.holeId} has no traced surfaces in hole.json. ` +
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
      onPuttTrigger: () => this.handlePuttAction(),
      onCameraToggle: () => this.toggleCameraMode(),
      onReadGreenToggle: () => this.toggleGreenBreakView(),
      onResetLayout: () => this.handleMenuAction(),
      onDevModeToggle: () => void this.toggleDevAlignmentMode(),
      onPlayAgain: () => void this.handleScorecardAction(),
      onReturnToTitle: () => void this.returnToTitle()
    });

    this.configureGameHUD();

    this.titleScreen = new TitleScreen({
      courseName: this.source?.courseName ?? 'Sophie Hills',
      courseSubtitle: this.source?.courseSubtitle ?? 'Front Nine',
      holeCount: this.source?.holes.length ?? 9,
      totalPar: this.source?.totalPar ?? 35,
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

    // Dev overlay & annotation tool
    this.annotationTool?.setVisible(isDev);
    this.alignmentReviewRenderer?.setVisible(isDev);
    this.debugOverlay?.setVisible(isDev || this.isDebugOverlayVisible);

    if (isLayoutSel) {
      this.cameraController?.setMode('OVERHEAD');
      this.treeRenderer?.setVisible(false);
      this.sceneManager.setOverheadMode(true);
    } else if (isGameplay && (newState === 'ADDRESS' || newState === 'SWINGING')) {
      this.cameraController?.setMode('GOLF');
      this.treeRenderer?.setVisible(true);
      this.sceneManager.setOverheadMode(false);
    } else if (isDev) {
      this.cameraController?.setMode('FREE');
    }
  }

  private isDebugOverlayVisible: boolean = false;

  private toggleDevMode(): void {
    if (!this.debugOverlay) return;
    this.isDebugOverlayVisible = !this.isDebugOverlayVisible;
    this.debugOverlay.setVisible(this.isDebugOverlayVisible);
  }

  private setupKeyboardEvents(): void {
    window.addEventListener('keydown', (e) => {
      const state = this.stateManager.getState();

      if (e.key === 'F2') {
        this.toggleDevMode();
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
        if (e.repeat) return;
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
    if (this.ballPhysics?.getCurrentLie().type === 'GREEN') return; // Locked to Putter on green
    this.clubManager.selectNextClub();
    const club = this.clubManager.getCurrentClub();
    this.shotMode = club.isPutter ? 'PUTTING' : 'FULL_SWING';
    this.gameHUD?.setShotMode(this.shotMode);
  }

  private selectPrevClub(): void {
    if (this.stateManager.getState() !== 'ADDRESS') return;
    if (this.ballPhysics?.getCurrentLie().type === 'GREEN') return; // Locked to Putter on green
    this.clubManager.selectPrevClub();
    const club = this.clubManager.getCurrentClub();
    this.shotMode = club.isPutter ? 'PUTTING' : 'FULL_SWING';
    this.gameHUD?.setShotMode(this.shotMode);
  }

  private toggleCameraMode(): void {
    if (!this.cameraController) return;
    const current = this.cameraController.getMode();
    const next = current === 'GOLF' ? 'OVERHEAD' : 'GOLF';
    this.cameraController.setMode(next);
    this.treeRenderer?.setVisible(next !== 'OVERHEAD');
    this.sceneManager.setOverheadMode(next === 'OVERHEAD');
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

  /** Terrain directory a hole plays on: its own if it declares one, else the course's. */
  public static resolveTerrainPath(source: GameSource, holeIndex: number): string {
    return source.holes[holeIndex]?.terrainPath ?? source.terrainPath;
  }

  /**
   * Swap in a different heightfield mid-round.
   *
   * The TerrainQuery instance is reused rather than replaced: every renderer and
   * physics system holds a reference to it, so mutating it in place keeps them
   * all pointing at the new terrain without a second round of wiring.
   */
  private async applyTerrain(terrainPath: string): Promise<void> {
    if (!this.terrainQuery || !this.geoTransform) {
      throw new Error('Cannot swap terrain before the course has been loaded.');
    }

    this.terrainData = await this.terrainLoader.load(terrainPath);
    this.loadedTerrainPath = terrainPath;

    this.terrainQuery.setTerrainData(this.terrainData);
    this.geoTransform.setTerrainData(this.terrainData);
    this.cameraController?.setTerrain(this.terrainData, this.terrainQuery);

    if (this.terrainMeshBuilder) {
      this.sceneManager.scene.remove(this.terrainMeshBuilder.getMesh());
    }
    this.terrainMeshBuilder = new TerrainMeshBuilder(this.terrainData);
    this.sceneManager.scene.add(this.terrainMeshBuilder.getMesh());

    if (this.courseEnvironment) {
      this.sceneManager.scene.remove(this.courseEnvironment.getGroup());
      this.courseEnvironment = undefined;
    }
    if (!this.source?.isResearchMode) {
      this.courseEnvironment = new CourseEnvironment(this.terrainData, this.terrainQuery);
      this.sceneManager.scene.add(this.courseEnvironment.getGroup());
    }
  }

  private async loadCourseHole(index: number): Promise<void> {
    const holeSource = this.source?.holes[index];
    if (!holeSource || !this.source) {
      throw new Error(`Cannot load Sophie Hills hole index ${index}: it is not in the course playlist.`);
    }

    const terrainPath = Game.resolveTerrainPath(this.source, index);
    if (terrainPath !== this.loadedTerrainPath) {
      await this.applyTerrain(terrainPath);
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
      courseName: this.source?.courseName ?? 'Sophie Hills',
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
    if (this.shotMode === 'PUTTING') {
      this.handlePuttAction();
      return;
    }

    const state = this.stateManager.getState();

    if (state === 'ADDRESS') {
      this.stateManager.setState('SWINGING');
      this.swingMeter.reset();
      this.swingExecuted = false;
      this.sophieGolfer?.resetPose();
      this.sophieGolfer?.startBackswing();
      this.swingMeter.trigger(); // Click 1: READY -> POWER_RUNNING
    } else if (state === 'SWINGING') {
      const prevMeterState = this.swingMeter.getState();
      const newMeterState = this.swingMeter.trigger();

      if (prevMeterState === 'POWER_RUNNING' && newMeterState === 'ACCURACY_RUNNING') {
        // Click 2: Locked power -> Golfer transitions to downswing
        this.sophieGolfer?.startDownswing();
      } else if (newMeterState === 'IMPACT' || newMeterState === 'COMPLETE') {
        // Click 3: Locked accuracy -> Strike impact and launch ball
        this.executeSwing();
      }
    }
  }

  private handlePuttAction(): void {
    const state = this.stateManager.getState();
    if (state === 'ADDRESS') {
      this.stateManager.setState('SWINGING');
      this.swingExecuted = false;
      this.sophieGolfer?.resetPose();
      const distToCup = Math.hypot(
        this.cupPosition.x - this.ballPhysics!.position.x,
        this.cupPosition.z - this.ballPhysics!.position.z
      );
      this.puttMeter.reset(distToCup);
      this.puttMeter.triggerPuttAction(); // Begins CHARGING
      this.gameHUD?.updatePuttMeter(this.puttMeter);
    } else if (state === 'SWINGING') {
      const res = this.puttMeter.triggerPuttAction(); // Locks pace and completes
      if (res) {
        this.executePutt(res);
      }
    }
  }

  private executePutt(puttResult: PuttResult): void {
    if (!this.sophieGolfer || !this.ballPhysics || !this.puttingPhysics) return;
    if (this.swingExecuted) return;
    this.swingExecuted = true;

    this.strokeCount++;
    this.ballRenderer?.clearTracer();
    this.shotOrigin = { x: this.ballPhysics.position.x, z: this.ballPhysics.position.z };

    this.puttingPhysics.setPosition(this.ballPhysics.position.x, this.ballPhysics.position.z);
    this.puttingPhysics.launchPutt(puttResult.intendedDistanceMetres, this.aimAngleRadians);

    this.sophieGolfer.strikeImpact(() => {
      this.ballPhysics!.position.copy(this.puttingPhysics!.position);
      this.ballPhysics!.velocity.copy(this.puttingPhysics!.velocity);
      this.stateManager.setState('BALL_ROLLING');
    });
  }

  private toggleGreenBreakView(): void {
    if (!this.greenBreakRenderer) return;
    const isVisible = this.greenBreakRenderer.toggle();
    if (isVisible && this.ballPhysics) {
      this.greenBreakRenderer.generateGrid(this.ballPhysics.position, this.cupPosition);
    }
  }

  private executeSwing(): void {
    const swingResult = this.swingMeter.getResult();
    if (!swingResult || !this.sophieGolfer || !this.ballPhysics) return;

    if (this.swingExecuted) return;
    this.swingExecuted = true;

    this.strokeCount++;
    this.ballRenderer?.clearTracer();

    // Remember where this stroke was played from, in case it needs replaying under
    // stroke-and-distance relief.
    this.shotOrigin = { x: this.ballPhysics.position.x, z: this.ballPhysics.position.z };

    // Trigger Sophie impact strike and ball launch
    this.sophieGolfer.strikeImpact(() => {
      const club = this.clubManager.getCurrentClub();

      // Launch ball physics
      this.ballPhysics!.launch(club, swingResult, this.aimAngleRadians);
      this.swingMeter.complete();
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
    const isOnGreen = this.ballPhysics?.getCurrentLie().type === 'GREEN';

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
      if (this.shotMode === 'PUTTING') {
        this.puttMeter.update(dt);
        this.gameHUD?.updatePuttMeter(this.puttMeter);
      } else {
        const prevMeterState = this.swingMeter.getState();
        this.swingMeter.update(dt);
        const newMeterState = this.swingMeter.getState();
        this.gameHUD?.updateSwingMeter(this.swingMeter);

        if (prevMeterState === 'POWER_RUNNING' && newMeterState === 'ACCURACY_RUNNING') {
          this.sophieGolfer?.startDownswing();
        }

        if ((newMeterState === 'IMPACT' || newMeterState === 'COMPLETE') && this.ballPhysics?.state === 'REST') {
          this.executeSwing();
        }
      }
    } else if (state === 'BALL_FLIGHT' || state === 'BALL_ROLLING') {
      if (this.puttingPhysics && this.puttingPhysics.state === 'ROLLING') {
        const pState = this.puttingPhysics.update(dt, this.cupPosition);
        this.ballPhysics!.position.copy(this.puttingPhysics.position);
        this.ballPhysics!.velocity.copy(this.puttingPhysics.velocity);

        if (pState === 'HOLED') {
          const holeTotal = this.strokeCount + this.penaltyStrokes;
          this.gameHUD?.showPuttingFeedback(0, true, false);
          this.finishHoleForScorecard(holeTotal, this.penaltyStrokes);
        } else if (pState === 'REST') {
          const distRemaining = Math.hypot(
            this.ballPhysics!.position.x - this.cupPosition.x,
            this.ballPhysics!.position.z - this.cupPosition.z
          );
          this.gameHUD?.showPuttingFeedback(distRemaining, false, this.puttingPhysics.wasLipOut);
          this.onBallStoppedAtRest();
        }
      } else {
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
    }

    // 3. Update Camera View
    if (state === 'ADDRESS' || state === 'SWINGING') {
      if (this.cameraController.getMode() === 'GOLF') {
        this.cameraController.updateGolfAddressView(this.ballPhysics!.position, this.aimAngleRadians, isOnGreen);
      } else {
        this.cameraController.update();
      }
    } else if (state === 'BALL_FLIGHT' || state === 'BALL_ROLLING') {
      this.cameraController.updateBallFollowView(
        this.ballPhysics!.position,
        this.ballPhysics!.velocity,
        this.aimAngleRadians,
        isOnGreen
      );
    } else {
      this.cameraController.update();
    }

    // 4. Update 3D Object Renderers
    if (this.ballRenderer && this.ballPhysics) {
      const isTee = this.ballPhysics.getCurrentLie().type === 'TEE';
      this.ballRenderer.update(this.ballPhysics.position, this.cameraController?.camera, isTee);
      if (state === 'BALL_FLIGHT' || state === 'BALL_ROLLING') {
        this.ballRenderer.addTracerPoint(this.ballPhysics.position);
      }
    }

    if (this.flagRenderer) {
      this.flagRenderer.update(this.cameraController.camera.position);
    }

    if (this.treeRenderer) {
      this.treeRenderer.update(this.cameraController.camera.position);
    }

    if (this.greenBreakRenderer) {
      this.greenBreakRenderer.update(dt);
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
    }

    if (this.debugOverlay) {
      if (state === 'DEV_ALIGNMENT') {
        this.debugOverlay.updateCameraInfo(this.cameraController.camera.position, this.cameraController.getMode());
        this.debugOverlay.updateMouseHitInfo(mouseHit);
      }
      this.debugOverlay.updateSwingTelemetry(
        this.swingMeter.getState(),
        this.swingMeter.getPowerValue(),
        this.swingMeter.getAccuracyError(),
        this.swingMeter.getInputCount()
      );
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

    this.swingExecuted = false;
    this.swingMeter.reset();
    this.sophieGolfer?.resetPose();
    this.ballRenderer?.clearTracer();

    const dx = this.cupPosition.x - this.ballPhysics.position.x;
    const dz = this.cupPosition.z - this.ballPhysics.position.z;
    this.aimAngleRadians = Math.atan2(dz, dx);

    const remainingDist = Math.hypot(dx, dz);
    const isOnGreen = this.ballPhysics.getCurrentLie().type === 'GREEN';
    this.clubManager.autoSelectClubForDistance(remainingDist, isOnGreen);
    const club = this.clubManager.getCurrentClub();
    this.shotMode = (isOnGreen || club.isPutter) ? 'PUTTING' : 'FULL_SWING';

    this.gameHUD?.setShotMode(this.shotMode);
    this.flagRenderer?.setPuttingMode(this.shotMode === 'PUTTING');

    if (this.shotMode === 'PUTTING') {
      this.greenBreakRenderer?.generateGrid(this.ballPhysics.position, this.cupPosition);
      this.puttMeter.reset(remainingDist);
    } else {
      this.greenBreakRenderer?.setVisible(false);
    }

    if (this.sophieGolfer && this.terrainQuery) {
      const terrainY = this.terrainQuery.getTerrainHeight(this.ballPhysics.position.x, this.ballPhysics.position.z, true);
      this.sophieGolfer.updateStance(this.ballPhysics.position, terrainY, this.aimAngleRadians);
      this.sophieGolfer.setVisible(true);
    }

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
