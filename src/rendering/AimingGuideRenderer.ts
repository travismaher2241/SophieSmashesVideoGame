import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';
import { ClubConfig } from '../golf/Club';

export class AimingGuideRenderer {
  private group: Group;
  private lineMesh: LineSegments | null = null;
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
    if (this.lineMesh) {
      this.group.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
    }

    const dist = Math.min(club.maxDistanceMetres, 250);
    const stepCount = 30;
    const positions: number[] = [];

    const dirX = Math.cos(aimAngleRad);
    const dirZ = Math.sin(aimAngleRad);

    let prevX = ballPos.x;
    let prevZ = ballPos.z;
    let prevY = this.terrainQuery.getTerrainHeight(prevX, prevZ, true) + 0.2;

    for (let i = 1; i <= stepCount; i++) {
      const segDist = (i / stepCount) * dist;
      const currX = ballPos.x + dirX * segDist;
      const currZ = ballPos.z + dirZ * segDist;
      const currY = this.terrainQuery.getTerrainHeight(currX, currZ, true) + 0.2;

      // Add line segment
      positions.push(prevX, prevY, prevZ, currX, currY, currZ);

      prevX = currX;
      prevY = currY;
      prevZ = currZ;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));

    const mat = new LineBasicMaterial({
      color: 0xffff33, // High-visibility retro yellow
      linewidth: 2
    });

    this.lineMesh = new LineSegments(geo, mat);
    this.group.add(this.lineMesh);
  }
}
