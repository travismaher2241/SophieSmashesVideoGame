import {
  Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from 'three';
import { SwingStyle } from '../golf/Club';

export type GolferSwingPhase = 'REST' | 'BACKSWING' | 'TOP_HOLD' | 'DOWNSWING' | 'FOLLOW_THROUGH';

/**
 * A set of swing frames, and the shape of the canvas they were drawn on.
 *
 * Every frame within a set shares one size and one origin, so the frames can be
 * swapped on a single plane without the golfer changing size or shifting about.
 * `aspect` is that canvas's width over its height; `figureHeightFraction` is how
 * much of it the golfer actually fills, which is what sizes her in the world.
 */
interface FrameSetSpec {
  directory: string;
  aspect: number;
  figureHeightFraction: number;
}

const FRAME_SETS: Record<SwingStyle, FrameSetSpec> = {
  // Rear-view artwork, 556x760 and 511x760, the golfer filling ~95% of the height.
  DRIVER: { directory: '/assets/sprites/driver', aspect: 556 / 760, figureHeightFraction: 0.95 },
  IRON: { directory: '/assets/sprites/iron', aspect: 511 / 760, figureHeightFraction: 0.96 },
  // The original front-on frames, still used for putting until it has its own art.
  PUTT: { directory: '/assets/sprites/frames', aspect: 553 / 989, figureHeightFraction: 1 }
};

const FRAME_FILES = [
  'frame-00-address-1.png',
  'frame-01-address-2-wiggle.png',
  'frame-02-backswing-top.png',
  'frame-03-downswing-impact.png',
  'frame-04-follow-through.png'
];

export class SophieGolfer {
  // Swing timings, in seconds. Back slowly, pause at the top, down quickly —
  // the contrast is what makes five frames read as a golf swing.
  private static readonly BACKSWING_SECONDS = 0.5;
  private static readonly TOP_HOLD_SECONDS = 0.12;
  private static readonly DOWNSWING_SECONDS = 0.14;
  private static readonly FOLLOW_THROUGH_SECONDS = 0.75;

  /**
   * The sprite frames, by the pose they show.
   *
   * The swing runs ADDRESS_2 -> BACKSWING_TOP -> DOWNSWING_IMPACT ->
   * FOLLOW_THROUGH. ADDRESS_1 is only ever seen at rest, where the two address
   * poses alternate.
   */
  private static readonly FRAME = {
    ADDRESS_1: 0,
    ADDRESS_2: 1,
    BACKSWING_TOP: 2,
    DOWNSWING_IMPACT: 3,
    FOLLOW_THROUGH: 4
  } as const;

  /** How tall the golfer herself stands, in metres. */
  private static readonly FIGURE_HEIGHT_METRES = 1.85;

  /** How long each address pose is held while waiting, in seconds. */
  private static readonly IDLE_POSE_SECONDS = 0.85;

  /** Fraction of the backswing spent still at address before the club goes back. */
  private static readonly BACKSWING_SETUP_FRACTION = 0.42;

  /** The sprite frame each phase settles on. */
  private static readonly PHASE_FRAMES: Record<GolferSwingPhase, number> = {
    REST: SophieGolfer.FRAME.ADDRESS_1,
    BACKSWING: SophieGolfer.FRAME.ADDRESS_2,
    TOP_HOLD: SophieGolfer.FRAME.BACKSWING_TOP,
    DOWNSWING: SophieGolfer.FRAME.DOWNSWING_IMPACT,
    FOLLOW_THROUGH: SophieGolfer.FRAME.FOLLOW_THROUGH
  };

  /** Total time from the third click to the ball leaving the clubface. */
  public static readonly TIME_TO_IMPACT_SECONDS =
    SophieGolfer.BACKSWING_SECONDS + SophieGolfer.TOP_HOLD_SECONDS + SophieGolfer.DOWNSWING_SECONDS;

  private group: Group;
  private spriteMesh: Mesh;
  private shadowMesh: Mesh;
  private material: MeshBasicMaterial;

  private frameTextures: Texture[] = [];
  private frameSets: Map<SwingStyle, Texture[]> = new Map();
  private swingStyle: SwingStyle = 'DRIVER';
  private currentPhase: GolferSwingPhase = 'REST';
  /** Seconds elapsed in the current swing phase. */
  private phaseSeconds: number = 0;
  private idleTimer: number = 0;
  /** Which frame is showing. Tracked separately from the texture, which needs a DOM. */
  private frameIndex: number = 0;
  private onImpactCallback?: () => void;

  private basePosition: Vector3 = new Vector3();

  constructor() {
    this.group = new Group();

    // A unit plane, scaled to whichever frame set is loaded. The sets are drawn
    // on differently shaped canvases, so a fixed-size plane would stretch one of
    // them. Origin at the bottom edge, which is where her feet are.
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);

    this.material = new MeshBasicMaterial({
      map: null,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: true
    });

    this.spriteMesh = new Mesh(geometry, this.material);
    this.group.add(this.spriteMesh);

    // Ground contact drop shadow under feet
    const shadowGeo = new RingGeometry(0.04, 0.55, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x051a05,
      transparent: true,
      opacity: 0.55
    });
    this.shadowMesh = new Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.set(0, 0.015, 0);
    this.group.add(this.shadowMesh);

    this.setSwingStyle('DRIVER');
  }

  public getGroup(): Group {
    return this.group;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Position Sophie at address stance relative to golf ball position and aim direction.
   * Placed to the left of the ball and slightly back so ball and aim line are unobstructed.
   */
  public updateStance(ballPos: Vector3, terrainY: number, aimAngleRad: number): void {
    // Stands beside the ball on the far side of the target line, where a golfer
    // actually stands, rather than behind it in the camera's eyeline.
    const leftAngle = aimAngleRad - Math.PI / 2;
    const offsetX = Math.cos(leftAngle) * 0.66 - Math.cos(aimAngleRad) * 0.06;
    const offsetZ = Math.sin(leftAngle) * 0.66 - Math.sin(aimAngleRad) * 0.06;

    this.basePosition.set(ballPos.x + offsetX, terrainY, ballPos.z + offsetZ);
    this.group.position.copy(this.basePosition);
  }

  /**
   * Play the swing.
   *
   * The three clicks choose power and accuracy; they do not pose the golfer.
   * Previously each click snapped her to a frame and the third launched the ball
   * on the same tick, so there was no swing to watch — the ball simply left. Now
   * the input finishes first and the whole stroke plays out from address through
   * impact to follow-through, with `onImpact` fired at the moment the club
   * reaches the ball rather than at the moment of the click.
   */
  public playSwing(onImpact: () => void): void {
    this.currentPhase = 'BACKSWING';
    this.phaseSeconds = 0;
    this.onImpactCallback = onImpact;
    this.setFrame(SophieGolfer.FRAME.ADDRESS_2);
  }

  /** True while a stroke is playing, so callers can wait for it to finish. */
  public isSwinging(): boolean {
    return this.currentPhase !== 'REST';
  }

  /**
   * Strike immediately, without the wind-up.
   *
   * Used by putting, which has its own two-click pace meter and no backswing
   * worth animating from the full-swing frames.
   */
  public strikeImpact(onImpact: () => void): void {
    this.setFrame(SophieGolfer.FRAME.DOWNSWING_IMPACT);
    this.currentPhase = 'FOLLOW_THROUGH';
    this.phaseSeconds = 0;
    this.onImpactCallback = undefined;
    onImpact();
  }

  /**
   * Reset golfer sprite to address rest pose.
   */
  public resetPose(): void {
    this.currentPhase = 'REST';
    this.phaseSeconds = 0;
    this.idleTimer = 0;
    this.onImpactCallback = undefined;
    this.setFrame(SophieGolfer.FRAME.ADDRESS_1);
  }

  private setFrame(index: number): void {
    // Recorded whether or not a texture is loaded, so the pose can be read back
    // without a browser — the frames need a DOM to decode into.
    this.frameIndex = index;

    if (this.frameTextures[index]) {
      this.material.map = this.frameTextures[index];
      this.material.needsUpdate = true;
    }
  }

  /** The pose currently showing, as an index into the frame set. */
  public getFrameIndex(): number {
    return this.frameIndex;
  }

  /** Which swing artwork is loaded. */
  public getSwingStyle(): SwingStyle {
    return this.swingStyle;
  }

  /**
   * Switch to the artwork for a swing style.
   *
   * Sets are loaded the first time they are asked for, so a round never pays to
   * decode the iron frames before an iron is taken out of the bag. The plane is
   * reshaped to the set's canvas, because they are not all drawn the same shape
   * and stretching one to fit the other's plane is immediately visible.
   */
  public setSwingStyle(style: SwingStyle): void {
    if (style === this.swingStyle && this.frameTextures.length > 0) return;

    this.swingStyle = style;
    this.frameTextures = this.loadFrameSet(style);

    const spec = FRAME_SETS[style];
    // Height is the golfer, not the canvas: the canvas has a little headroom
    // above her, and the sets differ in how much.
    const canvasHeight = SophieGolfer.FIGURE_HEIGHT_METRES / spec.figureHeightFraction;
    this.spriteMesh.scale.set(canvasHeight * spec.aspect, canvasHeight, 1);

    this.setFrame(this.frameIndex);
  }

  private loadFrameSet(style: SwingStyle): Texture[] {
    const cached = this.frameSets.get(style);
    if (cached) return cached;

    // Frames need a DOM to decode into. Guarded the way the other renderers are,
    // so the golfer can be constructed headlessly — the swing timing is worth
    // testing without a browser.
    if (typeof document === 'undefined') {
      this.frameSets.set(style, []);
      return [];
    }

    const loader = new TextureLoader();
    const spec = FRAME_SETS[style];
    const textures = FRAME_FILES.map((file) => {
      const texture = loader.load(`${spec.directory}/${file}`);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      return texture;
    });

    this.frameSets.set(style, textures);
    return textures;
  }

  public updateAnimation(dt: number, camera: Camera): void {
    // Horizontal camera-facing billboarding: yaw towards camera while keeping vertical axis completely upright
    const dx = camera.position.x - this.group.position.x;
    const dz = camera.position.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);

    // Ensure the sprite billboard remains upright with feet grounded (no whole-sprite tipping/leaning)
    this.spriteMesh.rotation.set(0, 0, 0);
    this.spriteMesh.position.set(0, 0, 0);

    if (this.currentPhase === 'REST') {
      // Waiting on the player: settle between the two address poses so she is
      // alive over the ball rather than frozen.
      this.idleTimer += dt;
      const onSecondPose = Math.floor(this.idleTimer / SophieGolfer.IDLE_POSE_SECONDS) % 2 === 1;
      this.setFrame(onSecondPose ? SophieGolfer.FRAME.ADDRESS_2 : SophieGolfer.FRAME.ADDRESS_1);
      return;
    }

    this.phaseSeconds += dt;

    switch (this.currentPhase) {
      case 'BACKSWING': {
        // Set at address, then the top of the backswing, so the club reads as
        // travelling back rather than teleporting there.
        const progress = this.phaseSeconds / SophieGolfer.BACKSWING_SECONDS;
        this.setFrame(
          progress < SophieGolfer.BACKSWING_SETUP_FRACTION
            ? SophieGolfer.FRAME.ADDRESS_2
            : SophieGolfer.FRAME.BACKSWING_TOP
        );

        if (this.phaseSeconds >= SophieGolfer.BACKSWING_SECONDS) {
          this.advanceTo('TOP_HOLD');
        }
        break;
      }

      case 'TOP_HOLD': {
        // A beat at the top, which is what makes the downswing feel quick.
        this.setFrame(SophieGolfer.FRAME.BACKSWING_TOP);
        if (this.phaseSeconds >= SophieGolfer.TOP_HOLD_SECONDS) {
          this.advanceTo('DOWNSWING');
        }
        break;
      }

      case 'DOWNSWING': {
        this.setFrame(SophieGolfer.FRAME.DOWNSWING_IMPACT);
        if (this.phaseSeconds >= SophieGolfer.DOWNSWING_SECONDS) {
          // Impact: the ball leaves here, at the bottom of the swing.
          const onImpact = this.onImpactCallback;
          this.onImpactCallback = undefined;
          this.advanceTo('FOLLOW_THROUGH');
          onImpact?.();
        }
        break;
      }

      case 'FOLLOW_THROUGH': {
        this.setFrame(SophieGolfer.FRAME.FOLLOW_THROUGH);
        if (this.phaseSeconds >= SophieGolfer.FOLLOW_THROUGH_SECONDS) {
          this.currentPhase = 'REST';
          this.phaseSeconds = 0;
          this.idleTimer = 0;
          this.setFrame(SophieGolfer.FRAME.ADDRESS_1);
        }
        break;
      }
    }
  }

  /**
   * Move to the next phase and show its pose on the same tick.
   *
   * Setting the frame here rather than waiting for the next update keeps the
   * sprite and the phase in step; otherwise each transition spends a frame
   * showing the previous pose.
   */
  private advanceTo(phase: GolferSwingPhase): void {
    this.currentPhase = phase;
    this.phaseSeconds = 0;
    this.setFrame(SophieGolfer.PHASE_FRAMES[phase]);
  }
}
