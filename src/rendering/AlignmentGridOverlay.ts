import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3
} from 'three';
import { CandidateAnnotations } from '../course/CandidateAnnotations';
import { TerrainData } from '../course/TerrainData';
import { TerrainQuery } from '../course/TerrainQuery';

export class AlignmentGridOverlay {
  private group: Group;
  private gridLinesMesh: LineSegments | null = null;
  private markerGroup: Group;
  private terrainData: TerrainData;
  private terrainQuery: TerrainQuery;

  private isGridVisible: boolean = true;

  constructor(terrainData: TerrainData, terrainQuery: TerrainQuery) {
    this.terrainData = terrainData;
    this.terrainQuery = terrainQuery;

    this.group = new Group();
    this.markerGroup = new Group();
    this.group.add(this.markerGroup);

    this.buildGridLines();
  }

  public getGroup(): Group {
    return this.group;
  }

  public setGridVisible(visible: boolean): void {
    this.isGridVisible = visible;
    if (this.gridLinesMesh) {
      this.gridLinesMesh.visible = visible;
    }
  }

  public isGridVisibleState(): boolean {
    return this.isGridVisible;
  }

  public updateCandidateMarkers(candidateStore: CandidateAnnotations): void {
    // Clear existing marker meshes
    while (this.markerGroup.children.length > 0) {
      const child = this.markerGroup.children[0];
      this.markerGroup.remove(child);
    }

    // Render candidate Tee
    const tee = candidateStore.getTee();
    if (tee) {
      const teeMesh = this.createMarkerMesh(
        new Vector3(tee.x, tee.elevation, tee.z),
        0xff3333
      );
      this.markerGroup.add(teeMesh);
    }

    // Render candidate Green
    const green = candidateStore.getGreenCentre();
    if (green) {
      const greenMesh = this.createMarkerMesh(
        new Vector3(green.x, green.elevation, green.z),
        0x33ff33
      );
      this.markerGroup.add(greenMesh);
    }

    // Render candidate features (fairway, bunkers, paths)
    candidateStore.getFeatures().forEach((feat) => {
      let color = 0xffff33;
      if (feat.type === 'fairway') color = 0x88ff88;
      if (feat.type === 'bunker') color = 0xffcc44;
      if (feat.type === 'path') color = 0xcccccc;

      if (feat.points.length >= 2) {
        const boundaryGeometry = new BufferGeometry().setFromPoints(
          feat.points.map((pt) => new Vector3(pt.x, pt.elevation + 0.45, pt.z))
        );
        const boundaryMaterial = new LineBasicMaterial({
          color,
          transparent: true,
          opacity: feat.isClosed ? 0.95 : 0.65
        });
        const boundary = feat.isClosed
          ? new LineLoop(boundaryGeometry, boundaryMaterial)
          : new Line(boundaryGeometry, boundaryMaterial);
        this.markerGroup.add(boundary);
      }

      feat.points.forEach((pt) => {
        const ptMesh = this.createMarkerMesh(
          new Vector3(pt.x, pt.elevation, pt.z),
          color
        );
        this.markerGroup.add(ptMesh);
      });
    });
  }

  private createMarkerMesh(pos: Vector3, colorHex: number): Group {
    const markerNode = new Group();
    markerNode.position.copy(pos);
    markerNode.position.y += 0.3; // slightly elevated above ground

    // Sphere pin
    const sphereGeo = new SphereGeometry(1.8, 16, 16);
    const sphereMat = new MeshBasicMaterial({ color: colorHex });
    const sphereMesh = new Mesh(sphereGeo, sphereMat);
    markerNode.add(sphereMesh);

    // Ground ring
    const ringGeo = new RingGeometry(2.0, 2.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new MeshBasicMaterial({ color: colorHex, side: 2 });
    const ringMesh = new Mesh(ringGeo, ringMat);
    ringMesh.position.y = -0.2;
    markerNode.add(ringMesh);

    return markerNode;
  }

  private buildGridLines(): void {
    const spacing = 50; // Major 50m grid lines
    const maxX = this.terrainData.vertexExtentX;
    const maxZ = this.terrainData.vertexExtentZ;

    const linePositions: number[] = [];

    // Grid lines parallel to Z (at constant X steps)
    for (let x = 0; x <= maxX; x += spacing) {
      for (let z = 0; z < maxZ; z += 5) {
        const y1 = this.terrainQuery.getTerrainHeight(x, z, true) + 0.15;
        const y2 = this.terrainQuery.getTerrainHeight(x, Math.min(maxZ, z + 5), true) + 0.15;
        linePositions.push(x, y1, z, x, y2, Math.min(maxZ, z + 5));
      }
    }

    // Grid lines parallel to X (at constant Z steps)
    for (let z = 0; z <= maxZ; z += spacing) {
      for (let x = 0; x < maxX; x += 5) {
        const y1 = this.terrainQuery.getTerrainHeight(x, z, true) + 0.15;
        const y2 = this.terrainQuery.getTerrainHeight(Math.min(maxX, x + 5), z, true) + 0.15;
        linePositions.push(x, y1, z, Math.min(maxX, x + 5), y2, z);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(linePositions), 3));

    const material = new LineBasicMaterial({
      color: 0x55aa55,
      transparent: true,
      opacity: 0.4,
      linewidth: 1
    });

    this.gridLinesMesh = new LineSegments(geometry, material);
    this.group.add(this.gridLinesMesh);
  }
}
