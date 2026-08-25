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

export type GolferSwingPhase = 'REST' | 'BACKSWING' | 'DOWNSWING' | 'FOLLOW_THROUGH';

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

    // Prominent 16-bit golf game scale (Height: ~3.2m for prominent foreground composition)
    const height = 3.2;
    const aspect = 0.56;
    const width = height * aspect;
    const geometry = new PlaneGeometry(width, height);

    // Shift geometry origin so feet contact ground at (y=0)
    geometry.translate(0, height / 2, 0);

    const loader = new TextureLoader();
    const framePaths = [
      'assets/sprites/frames/frame-00-address-1.png',
      'assets/sprites/frames/frame-01-address-2-wiggle.png',
      'assets/sprites/frames/frame-02-backswing-top.png',
      'assets/sprites/frames/frame-03-downswing-impact.png',
      'assets/sprites/frames/frame-04-follow-through.png'
    ];

    for (const p of framePaths) {
      const tex = loader.load(p, undefined, undefined, () => {
        // Fallback to rest sprite
        const fallback = loader.load('assets/sophie/sophie_rest.png');
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
    const baseTexture = this.frameTextures[0] || loader.load('assets/sophie/sophie_rest.png');
    this.material = new MeshBasicMaterial({
      map: baseTexture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: true
    });

    this.spriteMesh = new Mesh(geometry, this.material);
    this.group.add(this.spriteMesh);

    // Ground contact drop shadow
    const shadowGeo = new RingGeometry(0.05, 0.65, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x051a05,
      transparent: true,
      opacity: 0.6
    });
    this.shadowMesh = new Mesh(shadowGeo, shadowMat);
    this.shadowMesh.position.set(0, 0.02, 0);
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
   * Positioned slightly to the left and back so player ball and target line are unobstructed.
   */
  public updateStance(ballPos: Vector3, terrainY: number, aimAngleRad: number): void {
    const leftAngle = aimAngleRad - Math.PI / 2;
    const offsetX = Math.cos(leftAngle) * 0.95 - Math.cos(aimAngleRad) * 0.35;
    const offsetZ = Math.sin(leftAngle) * 0.95 - Math.sin(aimAngleRad) * 0.35;

    this.basePosition.set(ballPos.x + offsetX, terrainY, ballPos.z + offsetZ);
    this.group.position.copy(this.basePosition);
  }

  /**
   * Trigger procedural/frame swing motion (Backswing -> Downswing -> Impact -> Follow-through).
   */
  public startProceduralSwing(onImpact: () => void): void {
    this.currentPhase = 'BACKSWING';
    this.swingProgress = 0;
    this.onImpactCallback = onImpact;
    this.setFrame(2); // Backswing frame
  }

  private setFrame(index: number): void {
    if (this.frameTextures[index]) {
      this.material.map = this.frameTextures[index];
      this.material.needsUpdate = true;
    }
  }

  public updateAnimation(dt: number, camera: Camera): void {
    // Face sprite directly towards camera
    const dx = camera.position.x - this.group.position.x;
    const dz = camera.position.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);

    if (this.currentPhase === 'REST') {
      this.idleTimer += dt;
      // Subtle idle wiggle between frame 0 and 1
      const isWiggle = (this.idleTimer % 3.2) > 2.8;
      this.setFrame(isWiggle ? 1 : 0);
      this.spriteMesh.rotation.z = 0;
      this.spriteMesh.position.set(0, 0, 0);
      return;
    }

    if (this.currentPhase === 'BACKSWING') {
      this.swingProgress += dt * 2.4;
      this.setFrame(2);
      const rotZ = -(this.swingProgress * 0.25);
      this.spriteMesh.rotation.z = rotZ;

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'DOWNSWING';
        this.swingProgress = 0;
        this.setFrame(3);
      }
    } else if (this.currentPhase === 'DOWNSWING') {
      this.swingProgress += dt * 5.5;
      this.setFrame(3);
      const rotZ = -0.25 + (this.swingProgress * 0.65);
      this.spriteMesh.rotation.z = rotZ;

      if (this.swingProgress >= 0.75 && this.onImpactCallback) {
        const cb = this.onImpactCallback;
        this.onImpactCallback = undefined;
        cb();
      }

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'FOLLOW_THROUGH';
        this.swingProgress = 0;
        this.setFrame(4);
      }
    } else if (this.currentPhase === 'FOLLOW_THROUGH') {
      this.swingProgress += dt * 2.0;
      this.setFrame(4);
      const t = 1.0 - this.swingProgress;
      this.spriteMesh.rotation.z = 0.3 * Math.max(0, t);

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'REST';
        this.swingProgress = 0;
        this.setFrame(0);
        this.spriteMesh.rotation.z = 0;
        this.spriteMesh.position.set(0, 0, 0);
      }
    }
  }
}
