import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';

interface BreakDot {
  origX: number;
  origZ: number;
  currX: number;
  currZ: number;
  dirX: number;
  dirZ: number;
  slopeMag: number;
}

export class GreenBreakRenderer {
  private group: Group;
  private pointsMesh: Points | null = null;
  private pointsOutline: Points | null = null;
  private terrainQuery: TerrainQuery;
  private dots: BreakDot[] = [];
  private visible: boolean = false;

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  public getGroup(): Group {
    return this.group;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /**
   * Build subtle break beads grid covering green around the ball and cup corridor.
   */
  public generateGrid(ballPos: Vector3, cupPos: Vector3, radius: number = 18): void {
    this.clear();

    const minX = Math.min(ballPos.x, cupPos.x) - radius;
    const maxX = Math.max(ballPos.x, cupPos.x) + radius;
    const minZ = Math.min(ballPos.z, cupPos.z) - radius;
    const maxZ = Math.max(ballPos.z, cupPos.z) + radius;

    const spacing = 1.65;

    for (let x = minX; x <= maxX; x += spacing) {
      for (let z = minZ; z <= maxZ; z += spacing) {
        // Query slope gradient from normal
        const normal = this.terrainQuery.getTerrainNormal(x, z);
        const slopeMag = Math.hypot(normal.x, normal.z);

        // Terrain normals are (-dh/dx, 1, -dh/dz), so their horizontal component
        // already points downhill. PuttingPhysics uses this exact same sign.
        const dirX = slopeMag > 0.001 ? normal.x / slopeMag : 0;
        const dirZ = slopeMag > 0.001 ? normal.z / slopeMag : 0;

        // Stagger beads so the grid reads as flowing rather than pulsing in lockstep.
        const phase = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 0.82;

        this.dots.push({
          origX: x,
          origZ: z,
          currX: x + dirX * phase,
          currZ: z + dirZ * phase,
          dirX,
          dirZ,
          slopeMag
        });
      }
    }

    this.rebuildMesh();
  }

  private clear(): void {
    this.dots = [];
    if (this.pointsMesh) {
      this.group.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      this.pointsMesh = null;
    }
    if (this.pointsOutline) {
      this.group.remove(this.pointsOutline);
      this.pointsOutline = null;
    }
  }

  private rebuildMesh(): void {
    if (this.pointsMesh) {
      this.group.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      this.pointsMesh = null;
    }
    if (this.pointsOutline) {
      this.group.remove(this.pointsOutline);
      this.pointsOutline = null;
    }

    if (this.dots.length === 0) return;

    const positions = new Float32Array(this.dots.length * 3);

    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      const terrainY = this.terrainQuery.getTerrainHeight(d.currX, d.currZ, true);
      positions[i * 3 + 0] = d.currX;
      positions[i * 3 + 1] = terrainY + 0.10;
      positions[i * 3 + 2] = d.currZ;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));

    const outlineMat = new PointsMaterial({
      color: 0x071b14,
      size: 11,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const coreMat = new PointsMaterial({
      color: 0xf6ffb3,
      size: 6.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });

    this.pointsOutline = new Points(geo, outlineMat);
    this.pointsOutline.renderOrder = 20;
    this.pointsMesh = new Points(geo, coreMat);
    this.pointsMesh.renderOrder = 21;
    this.group.add(this.pointsOutline, this.pointsMesh);
  }

  public update(dt: number): void {
    if (!this.visible || this.dots.length === 0 || !this.pointsMesh) return;

    const posAttr = this.pointsMesh.geometry.getAttribute('position') as BufferAttribute;
    const maxOffset = 0.9;

    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      if (d.slopeMag > 0.002) {
        // Keep shallow breaks readable while making steeper areas flow faster.
        const flowSpeed = Math.min(0.9, 0.32 + d.slopeMag * 14);
        d.currX += d.dirX * flowSpeed * dt;
        d.currZ += d.dirZ * flowSpeed * dt;

        const offset = Math.hypot(d.currX - d.origX, d.currZ - d.origZ);
        if (offset > maxOffset) {
          d.currX = d.origX;
          d.currZ = d.origZ;
        }
      }

      const terrainY = this.terrainQuery.getTerrainHeight(d.currX, d.currZ, true);
      posAttr.setXYZ(i, d.currX, terrainY + 0.10, d.currZ);
    }

    posAttr.needsUpdate = true;
  }
}
