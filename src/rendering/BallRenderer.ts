import {
  Group,
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
  private terrainQuery: TerrainQuery;

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();

    // Golf Ball Mesh (Radius 0.043m)
    const ballGeo = new SphereGeometry(0.12, 16, 16); // Slightly enlarged visually for 16-bit pixel readability
    const ballMat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1
    });
    this.ballMesh = new Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.group.add(this.ballMesh);

    // Drop shadow projection ring on terrain
    const shadowGeo = new RingGeometry(0.01, 0.2, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x0a200a,
      transparent: true,
      opacity: 0.55
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

  public update(ballPos: Vector3): void {
    this.ballMesh.position.copy(ballPos);

    // Ground shadow position
    const terrainY = this.terrainQuery.getTerrainHeight(ballPos.x, ballPos.z, true);
    this.shadowMesh.position.set(ballPos.x, terrainY + 0.02, ballPos.z);
    
    // Scale shadow size based on height above ground
    const heightAboveGround = Math.max(0, ballPos.y - terrainY);
    const shadowScale = Math.max(0.3, 1.0 - heightAboveGround * 0.05);
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
  }
}
