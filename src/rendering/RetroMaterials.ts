import {
  CanvasTexture,
  DoubleSide,
  MeshStandardMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace
} from 'three';
import { SurfaceType } from '../course/SurfaceQuery';
import { surfaceDepthBias } from './SurfaceStacking';

export class RetroMaterials {
  private static instance: RetroMaterials;
  private materials: Map<SurfaceType | 'BASE_TERRAIN', MeshStandardMaterial> = new Map();

  private constructor() {
    this.buildMaterials();
  }

  public static getInstance(): RetroMaterials {
    if (!RetroMaterials.instance) {
      RetroMaterials.instance = new RetroMaterials();
    }
    return RetroMaterials.instance;
  }

  public getMaterial(type: SurfaceType | 'BASE_TERRAIN'): MeshStandardMaterial {
    return this.materials.get(type) || this.materials.get('FAIRWAY')!;
  }

  private buildMaterials(): void {
    const fairwayTex = this.createFairwayTexture();
    this.materials.set('FAIRWAY', this.createMat(0x6ec44e, fairwayTex, 0.82, 0.05, 'FAIRWAY'));

    const roughTex = this.createRoughTexture();
    const roughMat = this.createMat(0x3a7632, roughTex, 0.95, 0.02, 'ROUGH');
    this.materials.set('ROUGH', roughMat);
    this.materials.set('GENERAL_AREA', roughMat);
    this.materials.set('BASE_TERRAIN', roughMat);

    // Deep rough shared the rough's material exactly, so grass that costs you
    // nearly twice as much distance and half your control looked no different
    // from grass that costs a little of each. Darker and duller, on the same
    // texture: the ladder from fairway down reads as one surface getting worse,
    // rather than as four unrelated greens.
    this.materials.set('DEEP_ROUGH', this.createMat(0x2f6425, roughTex, 0.98, 0.01, 'DEEP_ROUGH'));

    // The first cut sits between fairway and rough in the rules, and now looks it.
    // Sharing the rough material meant authored semi-rough was invisible, so a
    // fairway ran straight into near-black rough with no band between them.
    this.materials.set('FIRST_CUT', this.createMat(0x478c33, roughTex, 0.9, 0.03, 'FIRST_CUT'));

    const greenTex = this.createGreenTexture();
    this.materials.set('GREEN', this.createMat(0x8bf264, greenTex, 0.65, 0.08, 'GREEN'));
    this.materials.set('FRINGE', this.createMat(0x78dc56, greenTex, 0.75, 0.05, 'FRINGE'));

    const bunkerTex = this.createBunkerTexture();
    this.materials.set('BUNKER', this.createMat(0xf3dc9a, bunkerTex, 0.98, 0.0, 'BUNKER'));

    const teeTex = this.createTeeTexture();
    this.materials.set('TEE', this.createMat(0x6ec44e, teeTex, 0.78, 0.05, 'TEE'));

    const waterTex = this.createWaterTexture();
    this.materials.set('WATER', this.createMat(0x3582ba, waterTex, 0.18, 0.35, 'WATER'));

    const pathTex = this.createPathTexture();
    this.materials.set('PATH', this.createMat(0xa69e8c, pathTex, 0.94, 0.02, 'PATH'));

    this.materials.set('GROUND_UNDER_REPAIR', this.createMat(0x887755, roughTex, 0.9, 0.0, 'GROUND_UNDER_REPAIR'));
    this.materials.set('OUT_OF_BOUNDS', this.createMat(0xaa4444, roughTex, 0.9, 0.0, 'OUT_OF_BOUNDS'));
  }

  /**
   * @param type The surface this material draws, which decides its depth bias.
   *   Height alone separates the sheets close up and stops being enough down
   *   the hole: a centimetre is below the depth buffer's notice at two hundred
   *   metres, and the two sheets start fighting again there.
   */
  private createMat(
    color: number,
    map: CanvasTexture | null,
    roughness: number,
    metalness: number,
    type: SurfaceType = 'FAIRWAY'
  ): MeshStandardMaterial {
    const bias = surfaceDepthBias(type);
    const opts: any = {
      color,
      roughness,
      metalness,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: bias.factor,
      polygonOffsetUnits: bias.units
    };
    if (map) opts.map = map;
    return new MeshStandardMaterial(opts);
  }

  // --- Texture Canvas Generators ---

  private createCanvas(width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private createFairwayTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    // Base fairway tone
    ctx.fillStyle = '#5c9842';
    ctx.fillRect(0, 0, size, size);

    // Alternating mowing bands (16px bands)
    for (let y = 0; y < size; y += 16) {
      if ((y / 16) % 2 === 0) {
        ctx.fillStyle = '#6baa4d';
        ctx.fillRect(0, y, size, 16);
      }
    }

    // Pixel grass dither specks
    for (let i = 0; i < 220; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      ctx.fillStyle = Math.random() > 0.5 ? '#7bc059' : '#4d8335';
      ctx.fillRect(x, y, 1, 1);
    }

    return this.wrapTexture(canvas, 16, 16);
  }

  private createRoughTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    // Rough green.
    //
    // Lighter than it reads here, because the map is multiplied by the material
    // colour: a dark texture under a dark colour compounds, and the rough came
    // out at a fifth of the fairway's brightness — a black band across the hole
    // rather than longer grass beside it. The two are lifted together.
    ctx.fillStyle = '#498740';
    ctx.fillRect(0, 0, size, size);

    // Chunky pixel grass blades & noise
    const colors = ['#3f7538', '#5da951', '#6cbf5d', '#37672f'];
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const rand = (Math.sin(x * 12.3) * Math.cos(y * 7.7) + Math.sin((x + y) * 5.1)) * 0.5;
        const colorIdx = Math.floor((rand + 0.5) * colors.length);
        ctx.fillStyle = colors[Math.max(0, Math.min(colors.length - 1, colorIdx))];
        ctx.fillRect(x, y, 2, 2);
      }
    }

    return this.wrapTexture(canvas, 24, 24);
  }

  private createGreenTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    // Ultra-bright lush putting green
    ctx.fillStyle = '#73c453';
    ctx.fillRect(0, 0, size, size);

    // Subtle cross-directional rolling sheen
    for (let i = 0; i < size; i += 8) {
      ctx.fillStyle = 'rgba(142, 222, 108, 0.22)';
      ctx.fillRect(i, 0, 4, size);
      ctx.fillStyle = 'rgba(92, 168, 68, 0.18)';
      ctx.fillRect(0, i, size, 4);
    }

    // Micro turf stipple
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      ctx.fillStyle = Math.random() > 0.5 ? '#8ee06c' : '#61a845';
      ctx.fillRect(x, y, 1, 1);
    }

    return this.wrapTexture(canvas, 8, 8);
  }

  private createBunkerTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    // Cream golden sand
    ctx.fillStyle = '#e8cd92';
    ctx.fillRect(0, 0, size, size);

    // Sand grain dither
    const colors = ['#dcbe80', '#f4dc9f', '#caa866', '#eed397'];
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const rand = (Math.sin(x * 15.1) * Math.cos(y * 11.3)) * 0.5;
        const colorIdx = Math.floor((rand + 0.5) * colors.length);
        ctx.fillStyle = colors[Math.max(0, Math.min(colors.length - 1, colorIdx))];
        ctx.fillRect(x, y, 2, 2);
      }
    }

    return this.wrapTexture(canvas, 6, 6);
  }

  private createTeeTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#65a749';
    ctx.fillRect(0, 0, size, size);

    // Crisp mowing stripes
    for (let x = 0; x < size; x += 8) {
      if ((x / 8) % 2 === 0) {
        ctx.fillStyle = '#76b858';
        ctx.fillRect(x, 0, 8, size);
      }
    }

    return this.wrapTexture(canvas, 4, 4);
  }

  private createWaterTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    // Stepped 16-bit aquatic blues
    ctx.fillStyle = '#2f74a8';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 8) {
      ctx.fillStyle = '#3f90cc';
      ctx.fillRect(0, y, size, 4);
      ctx.fillStyle = '#245982';
      ctx.fillRect(0, y + 4, size, 4);

      // Foam / sparkle highlights
      ctx.fillStyle = '#89c8f0';
      for (let x = (y % 16); x < size; x += 16) {
        ctx.fillRect(x, y + 1, 4, 1);
      }
    }

    return this.wrapTexture(canvas, 8, 8);
  }

  private createPathTexture(): CanvasTexture | null {
    const size = 64;
    const canvas = this.createCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#9e9584';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      ctx.fillStyle = Math.random() > 0.5 ? '#b8ae9c' : '#7c7363';
      ctx.fillRect(x, y, 2, 2);
    }

    return this.wrapTexture(canvas, 6, 6);
  }

  private wrapTexture(canvas: HTMLCanvasElement | null, repeatX: number, repeatY: number): CanvasTexture | null {
    if (!canvas) return null;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    return texture;
  }
}

