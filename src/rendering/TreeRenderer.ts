import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';

export type TreeType = 'GUM_LARGE' | 'GUM_MEDIUM' | 'PINE' | 'CLUSTER' | 'BUSH';

export interface TreeInstance {
  x: number;
  z: number;
  type: TreeType;
  scale?: number;
}

export class TreeRenderer {
  private group: Group;
  private terrainQuery: TerrainQuery;
  private treeMeshes: Mesh[] = [];
  private textures: Map<TreeType, CanvasTexture> = new Map();
  private materials: Map<TreeType, MeshBasicMaterial> = new Map();
  private geometries: Map<TreeType, PlaneGeometry> = new Map();

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();
    this.createTextures();
  }

  public getGroup(): Group {
    return this.group;
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  private createTextures(): void {
    const types: TreeType[] = ['GUM_LARGE', 'GUM_MEDIUM', 'PINE', 'CLUSTER', 'BUSH'];

    this.geometries.set('GUM_LARGE', this.createOriginBottomPlane(9.0, 11.5));
    this.geometries.set('GUM_MEDIUM', this.createOriginBottomPlane(6.5, 8.5));
    this.geometries.set('PINE', this.createOriginBottomPlane(5.2, 9.2));
    this.geometries.set('CLUSTER', this.createOriginBottomPlane(11.0, 7.5));
    this.geometries.set('BUSH', this.createOriginBottomPlane(3.6, 2.6));

    if (typeof document !== 'undefined') {
      this.textures.set('GUM_LARGE', this.generateGumTreeCanvas(64, 96, true));
      this.textures.set('GUM_MEDIUM', this.generateGumTreeCanvas(48, 72, false));
      this.textures.set('PINE', this.generatePineTreeCanvas(48, 80));
      this.textures.set('CLUSTER', this.generateClusterCanvas(80, 64));
      this.textures.set('BUSH', this.generateBushCanvas(48, 36));
    }

    // Build materials
    for (const type of types) {
      const tex = this.textures.get(type);
      const mat = new MeshBasicMaterial({
        color: 0x2e5a29,
        map: tex || undefined,
        transparent: true,
        alphaTest: 0.15,
        depthWrite: true
      });
      this.materials.set(type, mat);
    }
  }

  private createOriginBottomPlane(width: number, height: number): PlaneGeometry {
    const geo = new PlaneGeometry(width, height);
    geo.translate(0, height / 2, 0); // Origin at ground base
    return geo;
  }

  /**
   * Place the hole's trees.
   *
   * When the hole ships an authored tree list those positions are used exactly —
   * on a tree-lined hole the trees are the architecture, not decoration, and a
   * procedural scatter cannot reproduce a stand sitting in the middle of the
   * fairway. Holes without authored trees keep the generated corridor framing.
   */
  public populateCourseTrees(
    holeTee: { x: number; z: number },
    holeGreen: { x: number; z: number },
    authored?: TreeInstance[]
  ): void {
    this.clear();

    if (authored && authored.length > 0) {
      this.buildMeshes(authored);
      return;
    }

    const instances: TreeInstance[] = [];
    const minX = 40;
    const maxX = 620;
    const minZ = 30;
    const maxZ = 290;

    // Direction from tee to green
    const dx = holeGreen.x - holeTee.x;
    const dz = holeGreen.z - holeTee.z;
    const length = Math.hypot(dx, dz);
    const dirX = dx / (length || 1);
    const dirZ = dz / (length || 1);
    const perpX = -dirZ;
    const perpZ = dirX;

    // 1. Place flanking tree lines along left & right margins of the fairway corridor
    const numFlanking = 32;
    for (let i = 0; i <= numFlanking; i++) {
      const progress = i / numFlanking;
      const corridorDist = progress * (length + 80) - 30;
      const baseCorrX = holeTee.x + dirX * corridorDist;
      const baseCorrZ = holeTee.z + dirZ * corridorDist;

      // Left flank trees (30m to 75m offset)
      const leftDist = 30 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 35;
      const leftX = baseCorrX + perpX * leftDist + (Math.cos(i * 2.3) * 6);
      const leftZ = baseCorrZ + perpZ * leftDist + (Math.sin(i * 2.1) * 6);
      const typeLeft: TreeType = i % 3 === 0 ? 'GUM_LARGE' : i % 3 === 1 ? 'PINE' : 'GUM_MEDIUM';
      instances.push({ x: leftX, z: leftZ, type: typeLeft, scale: 0.9 + (i % 4) * 0.1 });

      // Left outer cluster/bushes
      if (i % 2 === 0) {
        instances.push({
          x: leftX + perpX * 18 + (i % 3) * 4,
          z: leftZ + perpZ * 18,
          type: i % 4 === 0 ? 'CLUSTER' : 'BUSH',
          scale: 1.0 + (i % 2) * 0.2
        });
      }

      // Right flank trees (30m to 75m offset)
      const rightDist = -(32 + (Math.cos(i * 1.5) * 0.5 + 0.5) * 34);
      const rightX = baseCorrX + perpX * rightDist + (Math.sin(i * 2.7) * 6);
      const rightZ = baseCorrZ + perpZ * rightDist + (Math.cos(i * 1.9) * 6);
      const typeRight: TreeType = i % 3 === 0 ? 'PINE' : i % 3 === 1 ? 'GUM_LARGE' : 'CLUSTER';
      instances.push({ x: rightX, z: rightZ, type: typeRight, scale: 0.9 + (i % 3) * 0.15 });

      if (i % 2 === 1) {
        instances.push({
          x: rightX + perpX * -16,
          z: rightZ + perpZ * -16,
          type: 'BUSH',
          scale: 0.9 + (i % 3) * 0.15
        });
      }
    }

    // 2. Background backdrop behind the green
    for (let j = 0; j < 16; j++) {
      const angle = (j / 15) * Math.PI - Math.PI / 2;
      const bgDist = 35 + (j % 3) * 10;
      const bgX = holeGreen.x + (Math.cos(angle) * perpX + Math.sin(angle) * dirX) * bgDist + dirX * 15;
      const bgZ = holeGreen.z + (Math.cos(angle) * perpZ + Math.sin(angle) * dirZ) * bgDist + dirZ * 15;
      const t: TreeType = j % 2 === 0 ? 'GUM_LARGE' : 'CLUSTER';
      instances.push({ x: bgX, z: bgZ, type: t, scale: 1.1 + (j % 3) * 0.15 });
    }

    // 3. Dense boundary forest perimeter
    for (let bx = minX; bx <= maxX; bx += 38) {
      instances.push({ x: bx, z: minZ + 6 + (bx % 12), type: 'CLUSTER', scale: 1.25 });
      instances.push({ x: bx + 16, z: maxZ - 8 - (bx % 10), type: 'CLUSTER', scale: 1.25 });
    }

    this.buildMeshes(instances);
  }

  private buildMeshes(instances: TreeInstance[]): void {
    const extent = this.terrainQuery.getWorldExtent();
    const margin = 4;

    for (const inst of instances) {
      if (
        inst.x < margin ||
        inst.x > extent.x - margin ||
        inst.z < margin ||
        inst.z > extent.z - margin
      ) {
        continue;
      }

      const y = this.terrainQuery.getTerrainHeight(inst.x, inst.z, true);
      const geo = this.geometries.get(inst.type)!;
      const mat = this.materials.get(inst.type)!;

      const mesh = new Mesh(geo, mat);
      mesh.position.set(inst.x, y, inst.z);
      if (inst.scale) {
        mesh.scale.set(inst.scale, inst.scale, inst.scale);
      }

      this.group.add(mesh);
      this.treeMeshes.push(mesh);
    }
  }

  public update(cameraPosition: Vector3): void {
    // Face all tree billboards towards camera (y-axis rotation only for natural vertical trees)
    for (let i = 0; i < this.treeMeshes.length; i++) {
      const mesh = this.treeMeshes[i];
      const dx = cameraPosition.x - mesh.position.x;
      const dz = cameraPosition.z - mesh.position.z;
      mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
    this.treeMeshes = [];
  }

  // --- Pixel Art Canvas Generators ---

  private generateGumTreeCanvas(width: number, height: number, large: boolean): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Trunk
    const trunkW = large ? 6 : 4;
    const trunkH = height * 0.48;
    const trunkX = width / 2 - trunkW / 2;
    const trunkY = height - trunkH;

    // Bark gradient & knots
    ctx.fillStyle = '#6e5d48';
    ctx.fillRect(trunkX, trunkY, trunkW, trunkH);
    ctx.fillStyle = '#4a3d2e';
    ctx.fillRect(trunkX, trunkY, 2, trunkH);
    ctx.fillStyle = '#8f7d67';
    ctx.fillRect(trunkX + trunkW - 2, trunkY, 2, trunkH);

    // Foliage clusters
    const clusters = large
      ? [
          { x: width * 0.5, y: height * 0.22, rx: width * 0.38, ry: height * 0.20 },
          { x: width * 0.32, y: height * 0.40, rx: width * 0.28, ry: height * 0.16 },
          { x: width * 0.68, y: height * 0.38, rx: width * 0.28, ry: height * 0.16 },
          { x: width * 0.48, y: height * 0.52, rx: width * 0.24, ry: height * 0.14 }
        ]
      : [
          { x: width * 0.5, y: height * 0.28, rx: width * 0.42, ry: height * 0.24 },
          { x: width * 0.38, y: height * 0.48, rx: width * 0.32, ry: height * 0.18 },
          { x: width * 0.62, y: height * 0.46, rx: width * 0.30, ry: height * 0.18 }
        ];

    for (const c of clusters) {
      this.drawPixelFoliageCluster(ctx, c.x, c.y, c.rx, c.ry, ['#21441e', '#2e5a29', '#3f7838', '#5ca252', '#7ec473']);
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }

  private generatePineTreeCanvas(width: number, height: number): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Trunk
    const trunkW = 4;
    const trunkH = height * 0.22;
    ctx.fillStyle = '#422a18';
    ctx.fillRect(width / 2 - trunkW / 2, height - trunkH, trunkW, trunkH);

    // Layered pine tiers
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const progress = i / (tiers - 1);
      const tierY = height * 0.12 + progress * (height * 0.68);
      const tierW = width * 0.25 + progress * (width * 0.68);
      const tierH = height * 0.22;

      ctx.beginPath();
      ctx.moveTo(width / 2, tierY - tierH * 0.5);
      ctx.lineTo(width / 2 + tierW / 2, tierY + tierH * 0.5);
      ctx.lineTo(width / 2 - tierW / 2, tierY + tierH * 0.5);
      ctx.closePath();

      // Shadow / Highlight
      ctx.fillStyle = i % 2 === 0 ? '#1b381c' : '#224624';
      ctx.fill();

      // Highlight right edge
      ctx.fillStyle = '#396b3a';
      ctx.beginPath();
      ctx.moveTo(width / 2, tierY - tierH * 0.5);
      ctx.lineTo(width / 2 + tierW / 2, tierY + tierH * 0.5);
      ctx.lineTo(width / 2, tierY + tierH * 0.5);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }

  private generateClusterCanvas(width: number, height: number): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Multiple canopy overlapping blobs
    const blobs = [
      { x: width * 0.28, y: height * 0.45, rx: width * 0.24, ry: height * 0.38 },
      { x: width * 0.50, y: height * 0.38, rx: width * 0.28, ry: height * 0.42 },
      { x: width * 0.74, y: height * 0.48, rx: width * 0.24, ry: height * 0.36 }
    ];

    for (const b of blobs) {
      this.drawPixelFoliageCluster(ctx, b.x, b.y, b.rx, b.ry, ['#1a3819', '#244d23', '#336831', '#4d914a', '#6db569']);
    }

    // Small trunks at base
    ctx.fillStyle = '#4a3d2e';
    ctx.fillRect(width * 0.26, height * 0.75, 4, height * 0.24);
    ctx.fillRect(width * 0.48, height * 0.72, 5, height * 0.27);
    ctx.fillRect(width * 0.72, height * 0.76, 4, height * 0.23);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }

  private generateBushCanvas(width: number, height: number): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    this.drawPixelFoliageCluster(ctx, width * 0.5, height * 0.55, width * 0.45, height * 0.42, [
      '#264c24',
      '#366833',
      '#498646',
      '#66ab62',
      '#8cd486'
    ]);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }

  private drawPixelFoliageCluster(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    palette: string[]
  ): void {
    // Fill stepped pixelated oval with dithered shading
    const step = 2; // 2px retro pixel blocks
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += step) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += step) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const distSq = nx * nx + ny * ny;

        if (distSq <= 1.0) {
          // Shading based on light from top-right and surface noise
          const noise = Math.sin(x * 0.8) * Math.cos(y * 0.8) * 0.15;
          const lightFactor = (0.5 - ny * 0.5) + (nx * 0.25) + noise;

          let colorIdx = Math.floor(lightFactor * palette.length);
          colorIdx = Math.max(0, Math.min(palette.length - 1, colorIdx));

          ctx.fillStyle = palette[colorIdx];
          ctx.fillRect(x, y, step, step);
        }
      }
    }
  }
}
