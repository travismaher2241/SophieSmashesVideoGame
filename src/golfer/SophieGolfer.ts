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
  private group: Group;
  private spriteMesh: Mesh;
  private shadowMesh: Mesh;
  private material: MeshBasicMaterial;

  private frameTextures: Texture[] = [];
  private currentPhase: GolferSwingPhase = 'REST';
  private swingProgress: number = 0; // 0 to 1
  private idleTimer: number = 0;
  private onImpactCallback?: () => void;

  private basePosition: Vector3 = new Vector3();

  constructor() {
    this.group = new Group();

    // 16-bit golf game scale (Height: 2.45m for 25-35% screen height in address view)
    const height = 2.45;
    const aspect = 0.559; // 553 / 989 native sprite aspect
    const width = height * aspect;
    const geometry = new PlaneGeometry(width, height);

    // Fixed GolferRoot anchor: shift geometry origin so feet contact ground exactly at y = 0
    geometry.translate(0, height / 2, 0);

    const loader = new TextureLoader();
    const framePaths = [
      '/assets/sprites/frames/frame-00-address-1.png',
      '/assets/sprites/frames/frame-01-address-2-wiggle.png',
      '/assets/sprites/frames/frame-02-backswing-top.png',
      '/assets/sprites/frames/frame-03-downswing-impact.png',
      '/assets/sprites/frames/frame-04-follow-through.png'
    ];

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

    // Default rest material
    const baseTexture = this.frameTextures[0] || loader.load('/assets/sophie/sophie_rest.png');
    this.material = new MeshBasicMaterial({
      map: baseTexture,
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
    const leftAngle = aimAngleRad - Math.PI / 2;
    const offsetX = Math.cos(leftAngle) * 0.72 - Math.cos(aimAngleRad) * 0.18;
    const offsetZ = Math.sin(leftAngle) * 0.72 - Math.sin(aimAngleRad) * 0.18;

    this.basePosition.set(ballPos.x + offsetX, terrainY, ballPos.z + offsetZ);
    this.group.position.copy(this.basePosition);
  }

  /**
   * Click 1: Start backswing motion.
   */
  public startBackswing(): void {
    this.currentPhase = 'BACKSWING';
    this.swingProgress = 0;
    this.setFrame(2); // Backswing top frame
  }

  /**
   * Click 2: Top of backswing / transition into downswing.
   */
  public startDownswing(): void {
    this.currentPhase = 'DOWNSWING';
    this.swingProgress = 0;
    this.setFrame(3); // Downswing frame
  }

  /**
   * Click 3: Impact strike! Ball launch is triggered immediately, followed by follow-through.
   */
  public strikeImpact(onImpact: () => void): void {
    this.setFrame(3); // Impact frame
    this.currentPhase = 'FOLLOW_THROUGH';
    this.swingProgress = 0;
    onImpact();
  }

  /**
   * Reset golfer sprite to address rest pose.
   */
  public resetPose(): void {
    this.currentPhase = 'REST';
    this.swingProgress = 0;
    this.onImpactCallback = undefined;
    this.setFrame(0);
  }

  /**
   * Legacy wrapper for complete procedural swing.
   */
  public startProceduralSwing(onImpact: () => void): void {
    this.startBackswing();
    this.onImpactCallback = onImpact;
  }

  private setFrame(index: number): void {
    if (this.frameTextures[index]) {
      this.material.map = this.frameTextures[index];
      this.material.needsUpdate = true;
    }
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
      this.idleTimer += dt;
      // Subtle idle wiggle between frame 0 (address 1) and frame 1 (address 2)
      const isWiggle = (this.idleTimer % 4.0) > 3.6;
      this.setFrame(isWiggle ? 1 : 0);
      return;
    }

    if (this.currentPhase === 'BACKSWING') {
      this.swingProgress += dt * 2.5; // ~0.40s backswing
      this.setFrame(2); // Frame 2: Backswing-top

      if (this.swingProgress >= 1.0) {
        // Hold at top of backswing until click 2 or auto-transition
        this.currentPhase = 'TOP_HOLD';
      }
    } else if (this.currentPhase === 'TOP_HOLD') {
      this.setFrame(2);
    } else if (this.currentPhase === 'DOWNSWING') {
      // In downswing phase, golfer holds frame 3 awaiting click 3 impact
      this.setFrame(3);
      if (this.onImpactCallback) {
        this.swingProgress += dt * 6.0;
        if (this.swingProgress >= 0.85) {
          const cb = this.onImpactCallback;
          this.onImpactCallback = undefined;
          cb();
          this.currentPhase = 'FOLLOW_THROUGH';
          this.swingProgress = 0;
        }
      }
    } else if (this.currentPhase === 'FOLLOW_THROUGH') {
      this.swingProgress += dt * 2.2; // ~0.45s follow-through hold
      this.setFrame(4); // Frame 4: Follow-through

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'REST';
        this.swingProgress = 0;
        this.setFrame(0); // Return to address
      }
    }
  }
}
