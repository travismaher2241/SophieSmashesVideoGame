import {
  Camera,
  Mesh,
  Raycaster,
  Vector2,
  Vector3
} from 'three';

export interface MouseTerrainHit {
  worldPosition: Vector3;
  gridX: number;
  gridZ: number;
}

export class MouseRaycaster {
  private raycaster: Raycaster;
  private mouse: Vector2;
  private domElement: HTMLElement;
  private currentHit: MouseTerrainHit | null = null;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;
    this.raycaster = new Raycaster();
    this.mouse = new Vector2(-999, -999);

    this.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
  }

  public getHit(): MouseTerrainHit | null {
    return this.currentHit;
  }

  public update(camera: Camera, terrainMesh: Mesh): MouseTerrainHit | null {
    if (this.mouse.x === -999 && this.mouse.y === -999) {
      this.currentHit = null;
      return null;
    }

    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObject(terrainMesh, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pos = hit.point;

      this.currentHit = {
        worldPosition: pos.clone(),
        gridX: pos.x,
        gridZ: pos.z
      };
      return this.currentHit;
    }

    this.currentHit = null;
    return null;
  }

  private onPointerMove(e: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
}
