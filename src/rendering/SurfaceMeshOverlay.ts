import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';
import { SurfacePolygon, SurfaceType } from '../course/SurfaceQuery';
import { TerrainQuery } from '../course/TerrainQuery';

export class SurfaceMeshOverlay {
  private group: Group;
  private terrainQuery: TerrainQuery;

  // Surface material palette
  private materials: Record<SurfaceType, MeshStandardMaterial>;

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();

    // 16-Bit retro surface materials
    this.materials = {
      TEE: new MeshStandardMaterial({ color: 0x4a9e43, roughness: 0.8, side: DoubleSide }),
      FAIRWAY: new MeshStandardMaterial({ color: 0x448833, roughness: 0.8, side: DoubleSide }),
      FIRST_CUT: new MeshStandardMaterial({ color: 0x3d782e, roughness: 0.85, side: DoubleSide }),
      ROUGH: new MeshStandardMaterial({ color: 0x2e5e23, roughness: 0.9, side: DoubleSide }),
      DEEP_ROUGH: new MeshStandardMaterial({ color: 0x214418, roughness: 0.95, side: DoubleSide }),
      FRINGE: new MeshStandardMaterial({ color: 0x52a848, roughness: 0.75, side: DoubleSide }),
      GREEN: new MeshStandardMaterial({ color: 0x5bc251, roughness: 0.65, side: DoubleSide }),
      BUNKER: new MeshStandardMaterial({ color: 0xdfc48c, roughness: 0.95, side: DoubleSide }),
      WATER: new MeshStandardMaterial({ color: 0x3377cc, roughness: 0.2, metalness: 0.3, side: DoubleSide }),
      PATH: new MeshStandardMaterial({ color: 0xa09e98, roughness: 0.9, side: DoubleSide }),
      GROUND_UNDER_REPAIR: new MeshStandardMaterial({ color: 0x887755, roughness: 0.9, side: DoubleSide }),
      GENERAL_AREA: new MeshStandardMaterial({ color: 0x2e5e23, roughness: 0.9, side: DoubleSide }),
      OUT_OF_BOUNDS: new MeshStandardMaterial({ color: 0xaa3333, roughness: 0.9, side: DoubleSide })
    };
  }

  public getGroup(): Group {
    return this.group;
  }

  public rebuild(polygons: SurfacePolygon[]): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }

    for (const poly of polygons) {
      if (poly.points.length < 3) continue;

      const mesh = this.buildPolygonMesh(poly);
      if (mesh) {
        this.group.add(mesh);
      }
    }
  }

  private buildPolygonMesh(poly: SurfacePolygon): Mesh | null {
    const pts = poly.points;
    const numTriangles = pts.length - 2;
    if (numTriangles <= 0) return null;

    const positions = new Float32Array(pts.length * 3);
    const yOffset = poly.type === 'GREEN' ? 0.08 : poly.type === 'BUNKER' ? 0.04 : 0.06;

    for (let i = 0; i < pts.length; i++) {
      const x = pts[i].x;
      const z = pts[i].z;
      const y = this.terrainQuery.getTerrainHeight(x, z, true) + yOffset;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    const indices = new Uint32Array(numTriangles * 3);
    let iIdx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      indices[iIdx++] = 0;
      indices[iIdx++] = i;
      indices[iIdx++] = i + 1;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(new BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = this.materials[poly.type] || this.materials.FAIRWAY;
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}
