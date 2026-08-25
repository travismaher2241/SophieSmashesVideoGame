import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';

export class BallRenderer {
  private group: Group;
  private ballMesh: Mesh;
  private shadowMesh: Mesh;
  private tracerMesh: LineSegments | null = null;
  private terrainQuery: TerrainQuery;

  private tracerPoints: Vector3[] = [];

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();

    // 1. Golf Ball Mesh (Radius 0.18m for crisp 16-bit retro readability)
    const ballGeo = new SphereGeometry(0.18, 16, 16);
    const ballMat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.05
    });
    this.ballMesh = new Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    // 2. Drop shadow projection disc on terrain
    const shadowGeo = new RingGeometry(0.02, 0.38, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x051a05,
      transparent: true,
      opacity: 0.72
    });
    this.shadowMesh = new Mesh(shadowGeo, shadowMat);
    this.group.add(this.shadowMesh);
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  public getGroup(): Group {
    return this.group;
  }

  public clearTracer(): void {
    this.tracerPoints = [];
    if (this.tracerMesh) {
      this.group.remove(this.tracerMesh);
      this.tracerMesh.geometry.dispose();
      this.tracerMesh = null;
    }
  }

  public addTracerPoint(pos: Vector3): void {
    this.tracerPoints.push(pos.clone());
    this.rebuildTracerMesh();
  }

  private rebuildTracerMesh(): void {
    if (this.tracerMesh) {
      this.group.remove(this.tracerMesh);
      this.tracerMesh.geometry.dispose();
      this.tracerMesh = null;
    }

    if (this.tracerPoints.length < 2) return;

    const positions: number[] = [];
    for (let i = 0; i < this.tracerPoints.length - 1; i++) {
      const p1 = this.tracerPoints[i];
      const p2 = this.tracerPoints[i + 1];
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    const mat = new LineBasicMaterial({
      color: 0xffea33,
      linewidth: 3
    });

    this.tracerMesh = new LineSegments(geo, mat);
    this.group.add(this.tracerMesh);
  }

  public update(ballPos: Vector3): void {
    this.ballMesh.position.copy(ballPos);

    // Ground shadow position
    const terrainY = this.terrainQuery.getTerrainHeight(ballPos.x, ballPos.z, true);
    this.shadowMesh.position.set(ballPos.x, terrainY + 0.02, ballPos.z);

    // Scale shadow based on height above ground
    const heightAboveGround = Math.max(0, ballPos.y - terrainY);
    const shadowScale = Math.max(0.35, 1.0 - heightAboveGround * 0.04);
    const shadowOpacity = Math.max(0.2, 0.72 - heightAboveGround * 0.03);
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    (this.shadowMesh.material as MeshBasicMaterial).opacity = shadowOpacity;
  }
}
