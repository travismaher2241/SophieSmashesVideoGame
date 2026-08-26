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
  private overheadTee = new Vector3();
  private overheadGreen = new Vector3();
  private hasOverheadHole = false;

  constructor(domElement: HTMLElement, terrainData: TerrainData, terrainQuery: TerrainQuery) {
    this.domElement = domElement;
    this.terrainData = terrainData;
    this.terrainQuery = terrainQuery;

    this.camera = new PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.2,
      3000
    );

    this.setupEvents();
    this.setMode('GOLF');
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setTerrain(terrainData: TerrainData, terrainQuery: TerrainQuery): void {
    this.terrainData = terrainData;
    this.terrainQuery = terrainQuery;
    this.setMode(this.mode);
  }

  public setRenderVerticalScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.renderVerticalScale = scale;
    this.setMode(this.mode);
  }

  /** Frame the active hole rather than exposing the full rectangular terrain tile. */
  public setOverheadHole(tee: { x: number; z: number }, green: { x: number; z: number }): void {
    this.overheadTee.set(tee.x, this.getDisplayHeight(tee.x, tee.z), tee.z);
    this.overheadGreen.set(green.x, this.getDisplayHeight(green.x, green.z), green.z);
    this.hasOverheadHole = true;
    if (this.mode === 'OVERHEAD') this.configureOverheadView();
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
    this.camera.up.set(0, 1, 0);

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
      this.configureOverheadView();
      return;
    }

    this.updateCameraTransform();
  }

  /**
   * Set behind-golfer camera position given ball position and aim angle (radians).
   * For putting: camera is closer and pitched downward so 80-90% of screen is green turf.
   */
  public updateGolfAddressView(ballPos: Vector3, aimAngleRad: number, isPutting: boolean = false): void {
    if (this.mode !== 'GOLF') return;

    const isPortrait = this.camera.aspect < 1.0;

    if (isPutting) {
      // Putting camera: close behind ball, downward pitch for 80-90% green screen coverage
      const camDist = isPortrait ? 3.4 : 2.7;
      const camHeight = isPortrait ? 1.55 : 1.25;
      const perpAngle = aimAngleRad + Math.PI / 2;
      const lateralOffset = isPortrait ? -0.15 : -0.18;

      const camX = ballPos.x - Math.cos(aimAngleRad) * camDist + Math.cos(perpAngle) * lateralOffset;
      const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist + Math.sin(perpAngle) * lateralOffset;
      const terrainY = this.getDisplayHeight(camX, camZ);
      const camY = Math.max(terrainY + 0.45, ballPos.y + camHeight);

      this.camera.position.set(camX, camY, camZ);

      // Pitch look-at downward into the green surface between ball and cup
      const lookAheadDist = isPortrait ? 6.5 : 8.0;
      const lookX = ballPos.x + Math.cos(aimAngleRad) * lookAheadDist;
      const lookZ = ballPos.z + Math.sin(aimAngleRad) * lookAheadDist;
      const lookY = ballPos.y + 0.08; // Downward pitch

      this.target.set(lookX, lookY, lookZ);
      this.camera.lookAt(this.target);
      return;
    }

    // Full-shot address view
    const camDist = isPortrait ? 6.8 : 5.8;
    const camHeight = isPortrait ? 1.80 : 1.65;
    const perpAngle = aimAngleRad + Math.PI / 2;
    const lateralOffset = isPortrait ? -0.32 : -0.32;

    const camX = ballPos.x - Math.cos(aimAngleRad) * camDist + Math.cos(perpAngle) * lateralOffset;
    const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist + Math.sin(perpAngle) * lateralOffset;

    const terrainY = this.getDisplayHeight(camX, camZ);
    const camY = Math.max(terrainY + 0.65, ballPos.y + camHeight);

    this.camera.position.set(camX, camY, camZ);

    const lookAheadDist = 55;
    const lookX = ballPos.x + Math.cos(aimAngleRad) * lookAheadDist;
    const lookZ = ballPos.z + Math.sin(aimAngleRad) * lookAheadDist;
    const lookY = ballPos.y + 1.15;

    this.target.set(lookX, lookY, lookZ);
    this.camera.lookAt(this.target);
  }

  /**
   * Smoothly follow ball during flight and rolling.
   */
  public updateBallFollowView(ballPos: Vector3, velocity: Vector3, aimAngleRad: number, isPutting: boolean = false): void {
    if (isPutting) {
      // For putting, keep camera mostly stable while smoothly tracking ball position
      this.target.copy(ballPos);
      this.camera.lookAt(this.target);
      return;
    }

    const camDist = 11.5;
    const camHeight = 4.2;

    let dirX = Math.cos(aimAngleRad);
    let dirZ = Math.sin(aimAngleRad);

    const hSpeed = Math.hypot(velocity.x, velocity.z);
    if (hSpeed > 1.5) {
      dirX = velocity.x / hSpeed;
      dirZ = velocity.z / hSpeed;
    }

    const targetCamX = ballPos.x - dirX * camDist;
    const targetCamZ = ballPos.z - dirZ * camDist;

    const terrainY = this.getDisplayHeight(targetCamX, targetCamZ);
    const targetCamY = Math.max(terrainY + 1.4, ballPos.y + camHeight);

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.18;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.18;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.18;

    this.target.copy(ballPos);
    this.camera.lookAt(this.target);
  }

  public update(): void {
    if (this.mode === 'OVERHEAD') {
      this.applyOverheadTransform();
    } else if (this.mode === 'FREE') {
      this.updateCameraTransform();
    }
  }

  private configureOverheadView(): void {
    const tee = this.hasOverheadHole
      ? this.overheadTee
      : new Vector3(this.terrainData.vertexExtentX * 0.25, 0, this.terrainData.vertexExtentZ * 0.5);
    const green = this.hasOverheadHole
      ? this.overheadGreen
      : new Vector3(this.terrainData.vertexExtentX * 0.75, 0, this.terrainData.vertexExtentZ * 0.5);
    const centreX = (tee.x + green.x) * 0.5;
    const centreZ = (tee.z + green.z) * 0.5;
    this.target.set(centreX, this.getDisplayHeight(centreX, centreZ), centreZ);

    const verticalFov = this.camera.fov * Math.PI / 180;
    const corridorPadding = 90;
    const xSpan = Math.abs(green.x - tee.x) + corridorPadding;
    const zSpan = Math.abs(green.z - tee.z) + corridorPadding;
    const requiredVerticalSpan = Math.max(140, zSpan, xSpan / Math.max(0.5, this.camera.aspect));
    this.distance = requiredVerticalSpan / (2 * Math.tan(verticalFov / 2));
    this.applyOverheadTransform();
  }

  private applyOverheadTransform(): void {
    // A Z-axis up vector prevents the lookAt singularity caused by Y-up while looking down -Y.
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(this.target.x, this.target.y + this.distance, this.target.z);
    this.camera.lookAt(this.target);
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
      if (this.mode !== 'FREE') return;
      this.isMouseDown = true;
      this.mouseButton = e.button;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown || this.mode !== 'FREE') return;

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
      if (this.mode !== 'FREE') return;
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this.distance *= zoomFactor;
      this.updateCameraTransform();
      e.preventDefault();
    }, { passive: false });
  }
}
