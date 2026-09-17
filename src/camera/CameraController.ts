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
  /** Smoothed follow state, so a bouncing ball does not shake the camera. */
  private followTarget = new Vector3();
  private followDirX = 1;
  private followDirZ = 0;
  private followInitialised = false;

  /** Per-second smoothing rates for the follow camera. */
  private static readonly FOLLOW_RATE = 7.5;
  private static readonly TARGET_RATE = 9;
  private static readonly PUTT_TARGET_RATE = 12;
  /** Below this ground speed the heading is left alone, in m/s. */
  private static readonly HEADING_SPEED_FLOOR = 2;
  private static readonly HEADING_RATE = 4;

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
    // On a phone the camera sits a little higher than on a desktop and almost on
    // the target line, rather than off to one side of it.
    //
    // The portrait view uses a much wider lens to get the width of the corridor
    // on screen, and a wider lens shrinks everything in it. Standing the camera
    // back as well — which an earlier pass did, to spread the fairway out —
    // compounded that: the golfer came out at 14% of the screen against 35% on a
    // desktop, a doll at the bottom of the frame. She is close to the desktop
    // size again here. The sideways offset comes off for the same reason: she
    // stands to the left of the ball anyway, and on a narrow screen a camera
    // offset the other way pushed her out of the frame.
    const camDist = isPortrait ? 5.0 : 5.5;
    const camHeight = isPortrait ? 2.10 : 1.70;
    const perpAngle = aimAngleRad + Math.PI / 2;
    const lateralOffset = isPortrait ? 0.18 : 1.00;

    const camX = ballPos.x - Math.cos(aimAngleRad) * camDist + Math.cos(perpAngle) * lateralOffset;
    const camZ = ballPos.z - Math.sin(aimAngleRad) * camDist + Math.sin(perpAngle) * lateralOffset;

    const terrainY = this.getDisplayHeight(camX, camZ);
    const camY = Math.max(terrainY + 0.65, ballPos.y + camHeight);

    this.camera.position.set(camX, camY, camZ);

    // Aiming point for the view. In portrait it is nearer and at ground level,
    // which pitches the camera down and lifts the horizon up the screen; on a
    // wide screen the near-level look down the hole is right as it is.
    const lookAheadDist = isPortrait ? 40 : 55;
    const lookX = ballPos.x + Math.cos(aimAngleRad) * lookAheadDist;
    const lookZ = ballPos.z + Math.sin(aimAngleRad) * lookAheadDist;
    const lookY = ballPos.y + (isPortrait ? 0.60 : 1.15);

    this.target.set(lookX, lookY, lookZ);
    this.camera.lookAt(this.target);
  }

  /**
   * Smoothly follow ball during flight and rolling.
   */
  /**
   * Start following a shot.
   *
   * The smoothed heading and look-at point are planted where the ball is now,
   * so the first frame of the follow does not spend itself catching up from
   * wherever the camera was standing at address.
   */
  public beginBallFollow(ballPos: Vector3, aimAngleRad: number): void {
    this.followDirX = Math.cos(aimAngleRad);
    this.followDirZ = Math.sin(aimAngleRad);
    this.followTarget.copy(ballPos);
    this.followInitialised = true;
  }

  /**
   * Follow the ball.
   *
   * Three things here are about the camera not lurching, and all three were
   * wrong in the same way: they treated a frame as a unit of time.
   *
   * The smoothing is exponential in SECONDS rather than a fixed fraction per
   * frame. A fraction per frame means the camera behaves differently on a 120Hz
   * phone and a 60Hz laptop, and — worse — that any hitch in the frame rate is a
   * lurch, because a long frame moves the camera exactly as far as a short one.
   *
   * The point it looks at is smoothed too. It used to look straight at the ball,
   * so every bounce snapped the camera's pitch down and up again; the ball moves
   * in a parabola and the view should not.
   *
   * And the heading it follows from is smoothed, and only updated while the ball
   * is travelling. It used to swap to the aim line the moment the ball slowed
   * below walking pace, which spun the camera round a ball that was quietly
   * rolling out.
   */
  public updateBallFollowView(
    ballPos: Vector3,
    velocity: Vector3,
    aimAngleRad: number,
    isPutting: boolean = false,
    deltaSeconds: number = 1 / 60
  ): void {
    if (!this.followInitialised) this.beginBallFollow(ballPos, aimAngleRad);

    // A tab that was in the background hands back a huge delta; anything past a
    // few frames' worth is treated as a few frames' worth.
    const dt = Math.max(0, Math.min(0.1, deltaSeconds));

    if (isPutting) {
      // On the green the camera holds still and only the look-at moves, gently.
      this.approachTarget(ballPos, CameraController.PUTT_TARGET_RATE, dt);
      this.camera.lookAt(this.target);
      return;
    }

    const camDist = 11.5;
    const camHeight = 4.2;

    const hSpeed = Math.hypot(velocity.x, velocity.z);
    if (hSpeed > CameraController.HEADING_SPEED_FLOOR) {
      const blend = CameraController.smoothing(CameraController.HEADING_RATE, dt);
      this.followDirX += (velocity.x / hSpeed - this.followDirX) * blend;
      this.followDirZ += (velocity.z / hSpeed - this.followDirZ) * blend;
      const length = Math.hypot(this.followDirX, this.followDirZ) || 1;
      this.followDirX /= length;
      this.followDirZ /= length;
    }

    const wantedX = ballPos.x - this.followDirX * camDist;
    const wantedZ = ballPos.z - this.followDirZ * camDist;

    const terrainY = this.getDisplayHeight(wantedX, wantedZ);
    const wantedY = Math.max(terrainY + 1.4, ballPos.y + camHeight);

    const blend = CameraController.smoothing(CameraController.FOLLOW_RATE, dt);
    this.camera.position.x += (wantedX - this.camera.position.x) * blend;
    this.camera.position.y += (wantedY - this.camera.position.y) * blend;
    this.camera.position.z += (wantedZ - this.camera.position.z) * blend;

    this.approachTarget(ballPos, CameraController.TARGET_RATE, dt);
    this.camera.lookAt(this.target);
  }

  /** Ease the look-at point towards the ball rather than snapping onto it. */
  private approachTarget(ballPos: Vector3, rate: number, dt: number): void {
    const blend = CameraController.smoothing(rate, dt);
    this.followTarget.x += (ballPos.x - this.followTarget.x) * blend;
    this.followTarget.y += (ballPos.y - this.followTarget.y) * blend;
    this.followTarget.z += (ballPos.z - this.followTarget.z) * blend;
    this.target.copy(this.followTarget);
  }

  /**
   * How far to move towards a target this frame, for a given rate per second.
   *
   * The same fraction every frame is only the same speed if every frame is the
   * same length. This is, which is the whole point.
   */
  public static smoothing(ratePerSecond: number, deltaSeconds: number): number {
    return 1 - Math.exp(-ratePerSecond * Math.max(0, deltaSeconds));
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
