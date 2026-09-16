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

export type GolferSwingPhase = 'REST' | 'BACKSWING' | 'TOP_HOLD' | 'DOWNSWING' | 'FOLLOW_THROUGH';

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

    // Near life size. She was drawn at 2.45m, half again taller than a person,
    // which put her across the middle of the shot at address.
    const height = 1.85;
    const aspect = 0.559; // 553 / 989 native sprite aspect
    const width = height * aspect;
    const geometry = new PlaneGeometry(width, height);

    // Fixed GolferRoot anchor: shift geometry origin so feet contact ground exactly at y = 0
    geometry.translate(0, height / 2, 0);

    // Sprite frames need a DOM to decode into. Guarded the way the other
    // renderers are, so the golfer can be constructed headlessly — the swing
    // timing is worth testing without a browser.
    const loader = typeof document === 'undefined' ? null : new TextureLoader();
    const framePaths = [
      '/assets/sprites/frames/frame-00-address-1.png',
      '/assets/sprites/frames/frame-01-address-2-wiggle.png',
      '/assets/sprites/frames/frame-02-backswing-top.png',
      '/assets/sprites/frames/frame-03-downswing-impact.png',
      '/assets/sprites/frames/frame-04-follow-through.png'
    ];

    if (loader) {
      for (const p of framePaths) {
        const tex = loader.load(p, undefined, undefined, () => {
          // Fallback to rest sprite if frame not found
          const fallback = loader.load('/assets/sophie/sophie_rest.png');
          fallback.colorSpace = SRGBColorSpace;
          fallback.minFilter = NearestFilter;
          fallback.magFilter = NearestFilter;
          return fallback;
        });
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = NearestFilter;
        tex.magFilter = NearestFilter;
        this.frameTextures.push(tex);
      }
    }

    // Default rest material
    const baseTexture = this.frameTextures[0] ?? loader?.load('/assets/sophie/sophie_rest.png');
    this.material = new MeshBasicMaterial({
      map: baseTexture ?? null,
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
