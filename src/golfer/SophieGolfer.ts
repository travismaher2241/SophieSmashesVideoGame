import {
  Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from 'three';

export type GolferSwingPhase = 'REST' | 'BACKSWING' | 'DOWNSWING' | 'FOLLOW_THROUGH';

export class SophieGolfer {
  private group: Group;
  private spriteMesh: Mesh;
  private material: MeshBasicMaterial;

  private currentPhase: GolferSwingPhase = 'REST';
  private swingProgress: number = 0; // 0 to 1
  private onImpactCallback?: () => void;

  private basePosition: Vector3 = new Vector3();

  constructor() {
    this.group = new Group();

    // 2D Billboard Plane Geometry for Sophie Golfer (Height: ~1.85m)
    const aspect = 1.0;
    const height = 1.85;
    const width = height * aspect;
    const geometry = new PlaneGeometry(width, height);

    // Shift geometry origin so bottom of sprite rests on ground (y=0)
    geometry.translate(0, height / 2, 0);

    // Load Sophie artwork texture
    const textureLoader = new TextureLoader();
    const texture = textureLoader.load('assets/sophie/sophie_rest.png');
    texture.colorSpace = SRGBColorSpace;

    this.material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1
    });

    this.spriteMesh = new Mesh(geometry, this.material);
    this.group.add(this.spriteMesh);
  }

  public getGroup(): Group {
    return this.group;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Position Sophie at address stance relative to golf ball position and aim direction.
   */
  public updateStance(ballPos: Vector3, terrainY: number, aimAngleRad: number): void {
    // Stance offset: 0.75m left of ball, 0.25m behind along aim line
    const leftAngle = aimAngleRad - Math.PI / 2;
    const offsetX = Math.cos(leftAngle) * 0.75 - Math.cos(aimAngleRad) * 0.25;
    const offsetZ = Math.sin(leftAngle) * 0.75 - Math.sin(aimAngleRad) * 0.25;

    this.basePosition.set(ballPos.x + offsetX, terrainY, ballPos.z + offsetZ);
    this.group.position.copy(this.basePosition);
  }

  /**
   * Trigger procedural swing motion (Backswing -> Downswing -> Impact -> Follow-through).
   */
  public startProceduralSwing(onImpact: () => void): void {
    this.currentPhase = 'BACKSWING';
    this.swingProgress = 0;
    this.onImpactCallback = onImpact;
  }

  public updateAnimation(dt: number, camera: Camera): void {
    // 1. Billboard sprite to face camera
    this.group.rotation.y = camera.rotation.y;

    if (this.currentPhase === 'REST') {
      this.spriteMesh.rotation.z = 0;
      this.spriteMesh.position.set(0, 0, 0);
      return;
    }

    // 2. Procedural swing animation stages
    if (this.currentPhase === 'BACKSWING') {
      this.swingProgress += dt * 2.2;
      const rotZ = -(this.swingProgress * 0.45);
      this.spriteMesh.rotation.z = rotZ;
      this.spriteMesh.position.x = -this.swingProgress * 0.15;

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'DOWNSWING';
        this.swingProgress = 0;
      }
    } else if (this.currentPhase === 'DOWNSWING') {
      this.swingProgress += dt * 5.0;
      const rotZ = -0.45 + (this.swingProgress * 0.95);
      this.spriteMesh.rotation.z = rotZ;
      this.spriteMesh.position.x = -0.15 + (this.swingProgress * 0.3);

      if (this.swingProgress >= 0.8 && this.onImpactCallback) {
        const cb = this.onImpactCallback;
        this.onImpactCallback = undefined;
        cb();
      }

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'FOLLOW_THROUGH';
        this.swingProgress = 0;
      }
    } else if (this.currentPhase === 'FOLLOW_THROUGH') {
      this.swingProgress += dt * 2.5;
      const t = 1.0 - this.swingProgress;
      this.spriteMesh.rotation.z = 0.5 * Math.max(0, t);
      this.spriteMesh.position.x = 0.15 * Math.max(0, t);

      if (this.swingProgress >= 1.0) {
        this.currentPhase = 'REST';
        this.swingProgress = 0;
        this.spriteMesh.rotation.z = 0;
        this.spriteMesh.position.set(0, 0, 0);
      }
    }
  }
}
