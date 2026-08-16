import { PerspectiveCamera, Vector3 } from 'three';
import { TerrainData } from '../course/TerrainData';
import { TerrainQuery } from '../course/TerrainQuery';

export type CameraMode = 'FREE' | 'GOLF' | 'OVERHEAD';

export class CameraController {
  public readonly camera: PerspectiveCamera;
  private mode: CameraMode = 'FREE';

  // Orbit / Pan target
  private target: Vector3 = new Vector3();
  
  // Spherical coordinates relative to target
  private distance: number = 400;
  private azimuth: number = Math.PI / 4;   // Horizontal angle around target
  private elevation: number = Math.PI / 4; // Vertical angle above target

  // Mouse interaction state
  private isMouseDown: boolean = false;
  private mouseButton: number = 0; // 0=left (orbit), 2=right (pan)
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
    this.setMode('FREE');
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
    } else if (mode === 'GOLF') {
      // Generic source-grid inspection view. It does not imply a verified tee or hole direction.
      const startX = this.terrainData.vertexExtentX * 0.08;
      const centreZ = this.terrainData.vertexExtentZ / 2;
      const lookDistance = Math.min(100, this.terrainData.vertexExtentX * 0.3);
      const targetX = Math.min(this.terrainData.vertexExtentX, startX + lookDistance);
      const targetY = this.getDisplayHeight(targetX, centreZ);

      this.target.set(targetX, targetY, centreZ);
      this.distance = lookDistance;
      this.azimuth = -Math.PI / 2; // Facing +X
      this.elevation = Math.asin(Math.min(1, 1.8 / lookDistance));
    } else if (mode === 'OVERHEAD') {
      const centreX = this.terrainData.vertexExtentX / 2;
      const centreZ = this.terrainData.vertexExtentZ / 2;
      this.target.set(centreX, this.getDisplayHeight(centreX, centreZ), centreZ);
      this.distance = Math.max(this.terrainData.vertexExtentX, this.terrainData.vertexExtentZ) * 0.78;
      this.azimuth = 0;
      this.elevation = Math.PI / 2 - 0.01; // Top-down
    }

    this.updateCameraTransform();
  }

  public update(): void {
    // Keep golf camera ground clearance
    if (this.mode === 'GOLF') {
      const terrainY = this.getDisplayHeight(this.camera.position.x, this.camera.position.z);
      const minCamY = terrainY + 1.8; // 1.8m eye level above ground
      if (this.camera.position.y < minCamY) {
        this.camera.position.y = minCamY;
      }
    }
  }

  public updateCameraTransform(): void {
    // Restrain vertical angle
    const minElevation = this.mode === 'GOLF' ? 0.005 : 0.05;
    const maxElevation = this.mode === 'OVERHEAD' ? Math.PI / 2 - 0.001 : Math.PI / 2 - 0.05;
    this.elevation = Math.max(minElevation, Math.min(maxElevation, this.elevation));

    // Restrain distance
    const minDist = this.mode === 'GOLF' ? 5 : 10;
    const maxDist = 1500;
    this.distance = Math.max(minDist, Math.min(maxDist, this.distance));

    // Spherical to Cartesian
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
      this.isMouseDown = true;
      this.mouseButton = e.button;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown) return;

      const deltaX = e.clientX - this.prevMouseX;
      const deltaY = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      if (this.mouseButton === 0) {
        // Orbit rotate
        const rotateSpeed = 0.005;
        this.azimuth -= deltaX * rotateSpeed;
        this.elevation += deltaY * rotateSpeed;
      } else if (this.mouseButton === 2 || e.shiftKey) {
        // Pan target
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

    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.domElement.addEventListener('wheel', (e) => {
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this.distance *= zoomFactor;
      this.updateCameraTransform();
      e.preventDefault();
    }, { passive: false });
  }
}
