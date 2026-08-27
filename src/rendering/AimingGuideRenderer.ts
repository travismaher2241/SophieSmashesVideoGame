import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';
import { ClubConfig } from '../golf/Club';

export class AimingGuideRenderer {
  private group: Group;
  private lineMesh: LineSegments | null = null;
  private targetRing: Mesh | null = null;
  private terrainQuery: TerrainQuery;

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
    this.group.visible = visible;
  }

  public update(ballPos: Vector3, aimAngleRad: number, club: ClubConfig): void {
    // 1. Remove previous guides
    if (this.lineMesh) {
      this.group.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
      this.lineMesh = null;
    }
    if (this.targetRing) {
      this.group.remove(this.targetRing);
      this.targetRing.geometry.dispose();
      this.targetRing = null;
    }

    const dist = club.maxDistanceMetres;
    const stepCount = 36;
    const positions: number[] = [];

    const dirX = Math.cos(aimAngleRad);
    const dirZ = Math.sin(aimAngleRad);

    // Ball is the fixed pivot for the straight line
    const startX = ballPos.x;
    const startY = ballPos.y + 0.045;
    const startZ = ballPos.z;

    const targetX = ballPos.x + dirX * dist;
    const targetZ = ballPos.z + dirZ * dist;
    const targetY = this.terrainQuery.getTerrainHeight(targetX, targetZ, true) + 0.15;

    // A single, geometrically straight 3D line from ball pivot to target direction.
    // Pure linear interpolation ensures zero bending, zero splining, and zero terrain kinks.
    let prevX = startX;
    let prevY = startY;
    let prevZ = startZ;

    for (let i = 1; i <= stepCount; i++) {
      const t = i / stepCount;
      const currX = startX + t * (targetX - startX);
      const currY = startY + t * (targetY - startY);
      const currZ = startZ + t * (targetZ - startZ);

      // Clean dashed pattern
      if (i % 2 === 1) {
        positions.push(prevX, prevY, prevZ, currX, currY, currZ);
      }

      prevX = currX;
      prevY = currY;
      prevZ = currZ;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));

    const mat = new LineBasicMaterial({
      color: 0xffff44,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });

    this.lineMesh = new LineSegments(geo, mat);
    this.lineMesh.renderOrder = 999;
    this.group.add(this.lineMesh);

    // 2. Landing reference marker (ring on terrain)
    const ringRadius = club.isPutter ? 0.8 : 3.5;
    const ringGeo = new RingGeometry(ringRadius * 0.75, ringRadius, 32);
    ringGeo.rotateX(-Math.PI / 2);

    const ringMat = new MeshBasicMaterial({
      color: club.isPutter ? 0x55ffff : 0xffcc33,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });

    this.targetRing = new Mesh(ringGeo, ringMat);
    this.targetRing.renderOrder = 998;
    this.targetRing.position.set(targetX, targetY + 0.05, targetZ);
    this.group.add(this.targetRing);
  }
}
