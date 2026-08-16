import { PerspectiveCamera, Vector3 } from 'three';
import { TerrainData } from '../course/TerrainData';
import { TerrainQuery } from '../course/TerrainQuery';

export type CameraMode = 'FREE' | 'GOLF' | 'OVERHEAD' | 'BALL_FOLLOW';

export class CameraController {
  public readonly camera: PerspectiveCamera;
  private mode: CameraMode = 'GOLF';

  // Target look-at vector
  private target: Vector3 = new Vector3();
  
  // Spherical controls for Orbit mode
  private distance: number = 400;
  private azimuth: number = Math.PI / 4;
  private elevation: number = Math.PI / 4;

  // Interaction
  private isMouseDown: boolean = false;
  private mouseButton: number = 0;
  private prevMouseX: number = 0;
  private prevMouseY: number = 0;

  private domElement: HTMLElement;
  private terrainData: TerrainData;
  private terrainQuery: TerrainQuery;
  private renderVerticalScale: number = 1;

  constructor(domElement: HTMLElement, terrainData: TerrainData, terrainQuery: TerrainQuery) {
    this.domElement = domElement;
    this.terrainData = terrainData;
    this.terrainQuery = terrainQuery;

    this.camera = new PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.5,
      3000
    );

    this.setupEvents();
    this.setMode('GOLF');
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setRenderVerticalScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.renderVerticalScale = scale;
    this.setMode(this.mode);
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;

    if (mode === 'FREE') {
      const centreX = this.terrainData.vertexExtentX / 2;
      const centreZ = this.terrainData.vertexExtentZ / 2;
      this.target.set(centreX, this.getDisplayHeight(centreX, centreZ), centreZ);
      this.distance = Math.hypot(
        this.terrainData.vertexExtentX,
        this.terrainData.vertexExtentZ
      ) * 0.68;
      this.azimuth = -Math.PI / 4;
      this.elevation = Math.PI / 5;
    } else if (mode === 'OVERHEAD') {
      const centreX = this.terrainData.vertexExtentX / 2;
      const centreZ = this.terrainData.vertexExtentZ / 2;
      this.target.set(centreX, this.getDisplayHeight(centreX, centreZ), centreZ);
      this.distance = Math.max(this.terrainData.vertexExtentX, this.terrainData.vertexExtentZ) * 0.78;
      this.azimuth = 0;
      this.elevation = Math.PI / 2 - 0.01;
    }

    this.updateCameraTransform();
  }

  /**
   * Set behind-golfer camera position given ball position and aim angle (radians).
   */
  public updateGolfAddressView(ballPos: Vector3, aimAngleRad: number): void {
    if (this.mode !== 'GOLF') return;

    const camDist = 6.5;
    const camHeight = 2.2;

    const camX = ballPos.x - Math.cos(aimAngleRad) * camDist;
    const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist;

    const terrainY = this.getDisplayHeight(camX, camZ);
    const camY = Math.max(terrainY + 1.2, ballPos.y + camHeight);

    this.camera.position.set(camX, camY, camZ);

    // Look at target point down aiming line
    const lookX = ballPos.x + Math.cos(aimAngleRad) * 40;
    const lookZ = ballPos.z + Math.sin(aimAngleRad) * 40;
    const lookY = this.getDisplayHeight(lookX, lookZ) + 1.0;

    this.target.set(lookX, lookY, lookZ);
    this.camera.lookAt(this.target);
  }

  /**
   * Smoothly follow ball during flight and rolling.
   */
  public updateBallFollowView(ballPos: Vector3, velocity: Vector3, aimAngleRad: number): void {
    const camDist = 12.0;
    const camHeight = 4.5;

    // Follow direction based on aim angle or horizontal velocity
    let dirX = Math.cos(aimAngleRad);
    let dirZ = Math.sin(aimAngleRad);

    const hSpeed = Math.hypot(velocity.x, velocity.z);
    if (hSpeed > 2.0) {
      dirX = velocity.x / hSpeed;
      dirZ = velocity.z / hSpeed;
    }

    const targetCamX = ballPos.x - dirX * camDist;
    const targetCamZ = ballPos.z - dirZ * camDist;

    const terrainY = this.getDisplayHeight(targetCamX, targetCamZ);
    const targetCamY = Math.max(terrainY + 1.5, ballPos.y + camHeight);

    // Smooth lerp camera position
    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.15;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.15;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.15;

    this.target.copy(ballPos);
    this.camera.lookAt(this.target);
  }

  public update(): void {
    if (this.mode === 'FREE' || this.mode === 'OVERHEAD') {
      this.updateCameraTransform();
    }
  }

  public updateCameraTransform(): void {
    const minElevation = 0.05;
    const maxElevation = this.mode === 'OVERHEAD' ? Math.PI / 2 - 0.001 : Math.PI / 2 - 0.05;
    this.elevation = Math.max(minElevation, Math.min(maxElevation, this.elevation));

    const minDist = 10;
    const maxDist = 1500;
    this.distance = Math.max(minDist, Math.min(maxDist, this.distance));

    const x = this.target.x + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.target.y + this.distance * Math.sin(this.elevation);
    const z = this.target.z + this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  private getDisplayHeight(x: number, z: number): number {
    return this.terrainQuery.getTerrainHeight(x, z, true) * this.renderVerticalScale;
  }

  private setupEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.domElement.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'FREE' && this.mode !== 'OVERHEAD') return;
      this.isMouseDown = true;
      this.mouseButton = e.button;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown || (this.mode !== 'FREE' && this.mode !== 'OVERHEAD')) return;

      const deltaX = e.clientX - this.prevMouseX;
      const deltaY = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      if (this.mouseButton === 0) {
        const rotateSpeed = 0.005;
        this.azimuth -= deltaX * rotateSpeed;
        this.elevation += deltaY * rotateSpeed;
      } else if (this.mouseButton === 2 || e.shiftKey) {
        const panSpeed = this.distance * 0.0015;
        const forward = new Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new Vector3();
        right.crossVectors(forward, new Vector3(0, 1, 0)).normalize();

        this.target.addScaledVector(right, -deltaX * panSpeed);
        this.target.addScaledVector(forward, deltaY * panSpeed);
      }

      this.updateCameraTransform();
    });

    window.addEventListener('pointerup', () => {
      this.isMouseDown = false;
    });

    this.domElement.addEventListener('wheel', (e) => {
      if (this.mode !== 'FREE' && this.mode !== 'OVERHEAD') return;
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this.distance *= zoomFactor;
      this.updateCameraTransform();
      e.preventDefault();
    }, { passive: false });
  }
}
