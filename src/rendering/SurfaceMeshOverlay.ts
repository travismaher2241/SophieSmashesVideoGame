import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh
} from 'three';
import { SurfacePolygon } from '../course/SurfaceQuery';
import { TerrainQuery } from '../course/TerrainQuery';
import { RetroMaterials } from './RetroMaterials';
import { surfaceRenderOffset } from './SurfaceStacking';

/**
 * How far above the bare terrain a surface's mesh is drawn, in metres.
 *
 * Re-exported from where the stacking is decided, because everything that sits
 * ON a surface has to account for it too: a golf ball is 43mm across, so a ball
 * placed at true terrain height is rendered underneath the grass it is supposed
 * to be resting on.
 */
export { surfaceRenderOffset } from './SurfaceStacking';

export class SurfaceMeshOverlay {
  private group: Group;
  private terrainQuery: TerrainQuery;
  private retroMaterials: RetroMaterials;

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();
    this.retroMaterials = RetroMaterials.getInstance();
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  public getGroup(): Group {
    return this.group;
  }

  private readonly priorityOrder: Record<string, number> = {
    ROUGH: 1,
    GENERAL_AREA: 1,
    DEEP_ROUGH: 1,
    FIRST_CUT: 2,
    WATER: 3,
    FAIRWAY: 4,
    PATH: 5,
    BUNKER: 6,
    FRINGE: 7,
    GREEN: 8,
    TEE: 9
  };

  public rebuild(polygons: SurfacePolygon[]): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }

    const sorted = [...polygons].sort(
      (a, b) => (this.priorityOrder[a.type] || 0) - (this.priorityOrder[b.type] || 0)
    );

    for (const poly of sorted) {
      if (poly.points.length < 3) continue;

      const mesh = this.buildSurfaceMesh(poly);
      if (mesh) {
        mesh.renderOrder = this.priorityOrder[poly.type] || 0;
        this.group.add(mesh);
      }
    }
  }

  private buildSurfaceMesh(poly: SurfacePolygon): Mesh | null {
    const pts = poly.points;
    if (pts.length < 3) return null;

    const yOffset = surfaceRenderOffset(poly.type);

    // Calculate bounding box of polygon
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;

    // For small or simple polygons (< 15m span), use direct polygon fan or ear clipping
    if (spanX <= 16 && spanZ <= 16) {
      return this.buildSimplePolygonMesh(poly, yOffset);
    }

    // For large/long polygons (fairways, rough), create a terrain-conforming grid
    const step = 2.0; // 2m grid resolution matching terrain DEM
    const cols = Math.ceil(spanX / step) + 1;
    const rows = Math.ceil(spanZ / step) + 1;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Grid vertex map: (r, c) -> vertex index
    const vertMap: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
    let vCount = 0;

    const uvScale = poly.type === 'GREEN' ? 4.0 : poly.type === 'BUNKER' ? 6.0 : 8.0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + c * step;
        const z = minZ + r * step;

        if (this.isPointInPolygon(x, z, pts)) {
          const y = this.terrainQuery.getTerrainHeight(x, z, true) + yOffset;
          positions.push(x, y, z);
          uvs.push(x / uvScale, z / uvScale);
          vertMap[r][c] = vCount++;
        }
      }
    }

    // Triangulate grid quads
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const v00 = vertMap[r][c];
        const v10 = vertMap[r][c + 1];
        const v01 = vertMap[r + 1][c];
        const v11 = vertMap[r + 1][c + 1];

        // If all 4 vertices are inside
        if (v00 !== -1 && v10 !== -1 && v01 !== -1 && v11 !== -1) {
          indices.push(v00, v01, v10);
          indices.push(v10, v01, v11);
        } else if (v00 !== -1 && v01 !== -1 && v10 !== -1) {
          indices.push(v00, v01, v10);
        } else if (v10 !== -1 && v01 !== -1 && v11 !== -1) {
          indices.push(v10, v01, v11);
        } else if (v00 !== -1 && v10 !== -1 && v11 !== -1) {
          indices.push(v00, v11, v10);
        } else if (v00 !== -1 && v01 !== -1 && v11 !== -1) {
          indices.push(v00, v01, v11);
        }
      }
    }

    // Fallback if grid produced too few triangles (e.g. narrow band)
    if (indices.length < 3) {
      return this.buildSimplePolygonMesh(poly, yOffset);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
    geo.computeVertexNormals();

    const mat = this.retroMaterials.getMaterial(poly.type);
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildSimplePolygonMesh(poly: SurfacePolygon, yOffset: number): Mesh | null {
    const pts = poly.points;
    const numTriangles = pts.length - 2;
    if (numTriangles <= 0) return null;

    const positions = new Float32Array(pts.length * 3);
    const uvs = new Float32Array(pts.length * 2);
    const uvScale = poly.type === 'GREEN' ? 4.0 : poly.type === 'BUNKER' ? 6.0 : 8.0;

    for (let i = 0; i < pts.length; i++) {
      const x = pts[i].x;
      const z = pts[i].z;
      const y = this.terrainQuery.getTerrainHeight(x, z, true) + yOffset;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      uvs[i * 2] = x / uvScale;
      uvs[i * 2 + 1] = z / uvScale;
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
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setIndex(new BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = this.retroMaterials.getMaterial(poly.type);
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private isPointInPolygon(px: number, pz: number, pts: { x: number; z: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, zi = pts[i].z;
      const xj = pts[j].x, zj = pts[j].z;
      const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
