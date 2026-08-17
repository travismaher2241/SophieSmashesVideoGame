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
    const stepCount = 35;
    const positions: number[] = [];

    const dirX = Math.cos(aimAngleRad);
    const dirZ = Math.sin(aimAngleRad);

    let prevX = ballPos.x;
    let prevZ = ballPos.z;
    let prevY = this.terrainQuery.getTerrainHeight(prevX, prevZ, true) + 0.15;

    for (let i = 1; i <= stepCount; i++) {
      const segDist = (i / stepCount) * dist;
      const currX = ballPos.x + dirX * segDist;
      const currZ = ballPos.z + dirZ * segDist;
      const currY = this.terrainQuery.getTerrainHeight(currX, currZ, true) + 0.15;

      // Dashed line pattern
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
      linewidth: 2
    });

    this.lineMesh = new LineSegments(geo, mat);
    this.group.add(this.lineMesh);

    // 2. Approximate landing reference marker (ring on terrain)
    const targetX = ballPos.x + dirX * dist;
    const targetZ = ballPos.z + dirZ * dist;
    const targetY = this.terrainQuery.getTerrainHeight(targetX, targetZ, true) + 0.2;

    const ringRadius = club.isPutter ? 0.8 : 3.5;
    const ringGeo = new RingGeometry(ringRadius * 0.75, ringRadius, 24);
    ringGeo.rotateX(-Math.PI / 2);

    const ringMat = new MeshBasicMaterial({
      color: club.isPutter ? 0x66ff66 : 0xffcc33,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85
    });

    this.targetRing = new Mesh(ringGeo, ringMat);
    this.targetRing.position.set(targetX, targetY, targetZ);
    this.group.add(this.targetRing);
  }
}
