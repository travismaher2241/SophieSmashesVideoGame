import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

export interface RetroRendererConfig {
  targetWidth: number;  // Default: 426
  targetHeight: number; // Default: 240
  enabled: boolean;
}

export class RetroRenderer {
  private config: RetroRendererConfig;
  private renderTarget: WebGLRenderTarget | null = null;

  // Quad rendering resources for 2nd upscaling pass
  private quadScene: Scene;
  private quadCamera: OrthographicCamera;
  private quadMesh: Mesh;
  private quadMaterial: MeshBasicMaterial;

  constructor(config: Partial<RetroRendererConfig> = {}) {
    this.config = {
      targetWidth: config.targetWidth || 426,
      targetHeight: config.targetHeight || 240,
      enabled: config.enabled ?? true // Default enabled for 16-bit retro look
    };

    // Build orthographic quad for screen pass
    this.quadScene = new Scene();
    this.quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const quadGeo = new BufferGeometry();
    const positions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
      -1,  1, 0,
      -1,  1, 0,
       1, -1, 0,
       1,  1, 0
    ]);
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1
    ]);

    quadGeo.setAttribute('position', new BufferAttribute(positions, 3));
    quadGeo.setAttribute('uv', new BufferAttribute(uvs, 2));

    this.quadMaterial = new MeshBasicMaterial({
      depthTest: false,
      depthWrite: false
    });

    this.quadMesh = new Mesh(quadGeo, this.quadMaterial);
    this.quadScene.add(this.quadMesh);

    this.initRenderTarget();
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public getResolution(): { width: number; height: number } {
    return {
      width: this.config.targetWidth,
      height: this.config.targetHeight
    };
  }

  public setResolution(width: number, height: number): void {
    this.config.targetWidth = width;
    this.config.targetHeight = height;
    this.initRenderTarget();
  }

  private initRenderTarget(): void {
    if (this.renderTarget) {
      this.renderTarget.dispose();
    }

    this.renderTarget = new WebGLRenderTarget(
      this.config.targetWidth,
      this.config.targetHeight,
      {
        minFilter: NearestFilter,
        magFilter: NearestFilter
      }
    );

    this.quadMaterial.map = this.renderTarget.texture;
    this.quadMaterial.needsUpdate = true;
  }

  /**
   * Complete 2-pass low-res pixel upscaling render pipeline.
   * Pass 1: Render 3D scene into low-res WebGLRenderTarget with NearestFilter.
   * Pass 2: Draw render target texture onto full-screen orthographic quad canvas with nearest-neighbor scaling.
   */
  public render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    if (this.config.enabled) {
      // Ensure aspect-correct low-res target dimensions
      const aspect = window.innerWidth / window.innerHeight;
      let targetWidth: number;
      let targetHeight: number;

      if (aspect < 1.0) {
        // Keep the pixel-art character while retaining enough detail for the golfer and green.
        targetWidth = 360;
        targetHeight = Math.round(targetWidth / aspect);
      } else {
        // 480p internal rendering is substantially cleaner on modern wide displays.
        targetHeight = 480;
        targetWidth = Math.round(targetHeight * aspect);
      }

      if (
        !this.renderTarget ||
        this.renderTarget.width !== targetWidth ||
        this.renderTarget.height !== targetHeight
      ) {
        this.config.targetWidth = targetWidth;
        this.config.targetHeight = targetHeight;
        this.initRenderTarget();
      }

      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }

      if (this.renderTarget) {
        // Pass 1: Render 3D scene to low-res render target
        renderer.setRenderTarget(this.renderTarget);
        renderer.clear();
        renderer.render(scene, camera);

        // Pass 2: Upscale low-res texture to screen canvas
        renderer.setRenderTarget(null);
        renderer.clear();
        this.quadMaterial.map = this.renderTarget.texture;
        renderer.render(this.quadScene, this.quadCamera);
      }
    } else {
      // Direct high-res rendering
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }
}
