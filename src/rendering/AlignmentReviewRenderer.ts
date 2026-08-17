import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry
} from 'three';
import { CandidateHole6Alignment } from '../course/CandidateHoleAlignment';
import { TerrainQuery } from '../course/TerrainQuery';

export class AlignmentReviewRenderer {
  private group: Group;
  private terrainQuery: TerrainQuery;
  private alignmentData: CandidateHole6Alignment;

  constructor(terrainQuery: TerrainQuery, alignmentData: CandidateHole6Alignment) {
    this.terrainQuery = terrainQuery;
    this.alignmentData = alignmentData;
    this.group = new Group();

    this.buildReviewVisuals();
  }

  public getGroup(): Group {
    return this.group;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  private buildReviewVisuals(): void {
    const tee = this.alignmentData.tee.localPosition;
    const green = this.alignmentData.greenCentre.localPosition;

    // 1. Tee Marker (Yellow Ring on Terrain)
    const teeY = this.terrainQuery.getTerrainHeight(tee.x, tee.z, true) + 0.3;
    const teeGeo = new RingGeometry(2.0, 3.5, 32);
    teeGeo.rotateX(-Math.PI / 2);
    const teeMat = new MeshBasicMaterial({ color: 0xffdd44, side: DoubleSide, transparent: true, opacity: 0.9 });
    const teeMesh = new Mesh(teeGeo, teeMat);
    teeMesh.position.set(tee.x, teeY, tee.z);
    this.group.add(teeMesh);

    // 2. Green Marker (Cyan/Green Ring on Terrain)
    const greenY = this.terrainQuery.getTerrainHeight(green.x, green.z, true) + 0.3;
    const greenGeo = new RingGeometry(2.5, 4.5, 32);
    greenGeo.rotateX(-Math.PI / 2);
    const greenMat = new MeshBasicMaterial({ color: 0x44ffdd, side: DoubleSide, transparent: true, opacity: 0.9 });
    const greenMesh = new Mesh(greenGeo, greenMat);
    greenMesh.position.set(green.x, greenY, green.z);
    this.group.add(greenMesh);

    // 3. Measurement Line (Tee to Green)
    const linePositions: number[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = tee.x + (green.x - tee.x) * t;
      const z = tee.z + (green.z - tee.z) * t;
      const y = this.terrainQuery.getTerrainHeight(x, z, true) + 0.4;
      linePositions.push(x, y, z);
    }

    const segments: number[] = [];
    for (let i = 0; i < steps; i++) {
      const idx = i * 3;
      segments.push(
        linePositions[idx], linePositions[idx + 1], linePositions[idx + 2],
        linePositions[idx + 3], linePositions[idx + 4], linePositions[idx + 5]
      );
    }

    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(segments), 3));
    const lineMat = new LineBasicMaterial({ color: 0xffaa00, linewidth: 3 });
    const lineMesh = new LineSegments(lineGeo, lineMat);
    this.group.add(lineMesh);

    // 4. Feature Outlines
    for (const feature of this.alignmentData.features) {
      this.buildFeatureOutline(feature.localPoints, feature.type);
    }
  }

  private buildFeatureOutline(points: { x: number; z: number }[], type: string): void {
    if (points.length < 3) return;

    let color = 0x88ff88;
    if (type === 'BUNKER') color = 0xffcc33;
    if (type === 'PATH') color = 0xdddddd;
    if (type === 'GREEN') color = 0x55ffff;

    const segments: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const nextIdx = (i + 1) % points.length;
      const p1 = points[i];
      const p2 = points[nextIdx];

      const y1 = this.terrainQuery.getTerrainHeight(p1.x, p1.z, true) + 0.25;
      const y2 = this.terrainQuery.getTerrainHeight(p2.x, p2.z, true) + 0.25;

      segments.push(p1.x, y1, p1.z, p2.x, y2, p2.z);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(segments), 3));
    const mat = new LineBasicMaterial({ color, linewidth: 2 });
    const mesh = new LineSegments(geo, mat);
    this.group.add(mesh);
  }
}
