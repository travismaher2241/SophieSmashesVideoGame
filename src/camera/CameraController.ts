import { PerspectiveCamera, Vector3 } from 'three';
import { applyViewportAspect, verticalFovForAspect } from './FieldOfView';
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

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new PerspectiveCamera(verticalFovForAspect(aspect), aspect, 0.2, 3000);

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
      // Putting camera: behind ball, downward pitch for green screen coverage and clear ball visibility
      // Higher than eye level, looking down onto the green.
      //
      // From shoulder height the view grazes the surface and a regulation cup
      // foreshortens to a three-pixel dash — which is why it used to be drawn
      // enlarged, and why a ball could cross the drawn hole and stay out. Raising
      // the camera turns the cup back into a circle you can see, without the
      // drawing having to lie about how big it is.
      const camDist = isPortrait ? 4.6 : 4.4;
      const camHeight = isPortrait ? 3.10 : 2.60;
      const perpAngle = aimAngleRad + Math.PI / 2;
      // Opposite side of the line from the golfer, as in the full-shot view: on
      // her side she stood over the ball and hid it. Further back than it was,
      // because the rear-view artwork fills much more of the frame than the
      // front-on sprite it replaced.
      const lateralOffset = isPortrait ? 0.80 : 0.90;

      const camX = ballPos.x - Math.cos(aimAngleRad) * camDist + Math.cos(perpAngle) * lateralOffset;
      const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist + Math.sin(perpAngle) * lateralOffset;
      const terrainY = this.getDisplayHeight(camX, camZ);
      const camY = Math.max(terrainY + 0.45, ballPos.y + camHeight);

      this.camera.position.set(camX, camY, camZ);

      // Pitch look-at downward into the green surface between ball and cup
      const lookAheadDist = isPortrait ? 5.0 : 6.0;
      const lookX = ballPos.x + Math.cos(aimAngleRad) * lookAheadDist;
      const lookZ = ballPos.z + Math.sin(aimAngleRad) * lookAheadDist;
      const lookY = ballPos.y + 0.15; // Balanced pitch

      this.target.set(lookX, lookY, lookZ);
      this.camera.lookAt(this.target);
      return;
    }

    // Full-shot address view: over her shoulder, down the target line.
    //
    // Offset across the line from where she stands, so she frames the shot from
    // one side rather than standing in the middle of it. Close enough to read
    // the swing now that the artwork is drawn from behind.
    // On a phone the camera stands back and higher, looking down the hole rather
    // than along it. A portrait window is tall and narrow: from shoulder height
    // the corridor arrives as a thin band with dead sky above it, and the part
    // of the hole the player is actually aiming at is a few pixels deep. From
    // further back and higher the fairway spreads across the frame, and the
    // golfer is still near enough to read the swing.
    const camDist = isPortrait ? 8.5 : 5.5;
    const camHeight = isPortrait ? 3.60 : 1.70;
    const perpAngle = aimAngleRad + Math.PI / 2;
    const lateralOffset = isPortrait ? 0.80 : 1.00;

    const camX = ballPos.x - Math.cos(aimAngleRad) * camDist + Math.cos(perpAngle) * lateralOffset;
    const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist + Math.sin(perpAngle) * lateralOffset;

    const terrainY = this.getDisplayHeight(camX, camZ);
    const camY = Math.max(terrainY + 0.65, ballPos.y + camHeight);

    this.camera.position.set(camX, camY, camZ);

    // Aiming point for the view. In portrait it is nearer and at ground level,
    // which pitches the camera down and lifts the horizon up the screen; on a
    // wide screen the near-level look down the hole is right as it is.
    const lookAheadDist = isPortrait ? 34 : 55;
    const lookX = ballPos.x + Math.cos(aimAngleRad) * lookAheadDist;
    const lookZ = ballPos.z + Math.sin(aimAngleRad) * lookAheadDist;
    const lookY = ballPos.y + (isPortrait ? 0.10 : 1.15);

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
      applyViewportAspect(this.camera, window.innerWidth / window.innerHeight);
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
