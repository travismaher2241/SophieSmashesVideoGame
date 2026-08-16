import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  DoubleSide
} from 'three';
import { TerrainData } from '../course/TerrainData';

export class TerrainMeshBuilder {
  private geometry: BufferGeometry;
  private material: MeshStandardMaterial;
  private mesh: Mesh;
  private terrainData: TerrainData;
  private currentVerticalScale: number = 1.0;

  constructor(terrainData: TerrainData) {
    this.terrainData = terrainData;
    this.currentVerticalScale = terrainData.meta.verticalScaleDefault || 1.0;

    this.geometry = new BufferGeometry();

    // Neutral green golf-course material with directional light response
    this.material = new MeshStandardMaterial({
      color: 0x3d7e3a, // Golf fairway green
      roughness: 0.85,
      metalness: 0.1,
      flatShading: false,
      side: DoubleSide
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    // Avoid the heightfield casting a shadow onto itself at the light-frustum edge.
    // Vertex normals already provide the slope shading needed for DEM inspection.
    this.mesh.castShadow = false;

    this.buildGeometry();
  }

  public getMesh(): Mesh {
    return this.mesh;
  }

  public getVerticalScale(): number {
    return this.currentVerticalScale;
  }

  /**
   * Update visual vertical scale (1.0x, 1.5x, 2.0x).
   * Note: Alters visual mesh rendering displacement only.
   * Does NOT alter source terrain data or physics queries.
   */
  public setVerticalScale(scale: number): void {
    if (scale <= 0) return;
    this.currentVerticalScale = scale;
    this.updateVertexElevations();
  }

  /**
   * Construct 3D BufferGeometry matching terrain sample grid.
   * Columns -> World X [0..vertexExtentX]
   * Elevation offset -> World Y (offset * verticalScale)
   * Rows -> World Z [0..vertexExtentZ]
   */
  private buildGeometry(): void {
    const cols = this.terrainData.widthSamples;
    const rows = this.terrainData.heightSamples;
    const spacing = this.terrainData.gridSpacing;

    const numVertices = cols * rows;
    const positions = new Float32Array(numVertices * 3);
    const uvs = new Float32Array(numVertices * 2);

    let vIdx = 0;
    let uvIdx = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * spacing;
        const z = r * spacing;
        const elevationOffset = this.terrainData.getElevationOffsetAtGrid(c, r);
        const y = elevationOffset * this.currentVerticalScale;

        positions[vIdx] = x;
        positions[vIdx + 1] = y;
        positions[vIdx + 2] = z;
        vIdx += 3;

        uvs[uvIdx] = c / (cols - 1);
        uvs[uvIdx + 1] = r / (rows - 1);
        uvIdx += 2;
      }
    }

    // Build triangle index buffer
    const numTriangles = (cols - 1) * (rows - 1) * 2;
    const indices = new Uint32Array(numTriangles * 3);
    let iIdx = 0;

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);

        // First triangle
        indices[iIdx++] = i0;
        indices[iIdx++] = i2;
        indices[iIdx++] = i1;

        // Second triangle
        indices[iIdx++] = i1;
        indices[iIdx++] = i2;
        indices[iIdx++] = i3;
      }
    }

    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.geometry.setIndex(new BufferAttribute(indices, 1));

    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
  }

  /**
   * Recalculate vertex Y positions when vertical scale changes.
   */
  private updateVertexElevations(): void {
    const cols = this.terrainData.widthSamples;
    const rows = this.terrainData.heightSamples;
    const posAttr = this.geometry.getAttribute('position') as BufferAttribute;
    const positions = posAttr.array as Float32Array;

    let vIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const elevationOffset = this.terrainData.getElevationOffsetAtGrid(c, r);
        positions[vIdx + 1] = elevationOffset * this.currentVerticalScale;
        vIdx += 3;
      }
    }

    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
  }
}
