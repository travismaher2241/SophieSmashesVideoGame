import {
  NearestFilter,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget
} from 'three';

export interface RetroRendererConfig {
  targetWidth: number;  // e.g. 426
  targetHeight: number; // e.g. 240
  enabled: boolean;
}

export class RetroRenderer {
  private config: RetroRendererConfig;
  private renderTarget: WebGLRenderTarget | null = null;

  constructor(config: Partial<RetroRendererConfig> = {}) {
    this.config = {
      targetWidth: config.targetWidth || 426,
      targetHeight: config.targetHeight || 240,
      enabled: config.enabled ?? false
    };

    if (this.config.enabled) {
      this.initRenderTarget();
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && !this.renderTarget) {
      this.initRenderTarget();
    }
  }

  private initRenderTarget(): void {
    this.renderTarget = new WebGLRenderTarget(
      this.config.targetWidth,
      this.config.targetHeight,
      {
        minFilter: NearestFilter,
        magFilter: NearestFilter
      }
    );
  }

  /**
   * Render entry point preparing for future offscreen pixel-art upscaling pass.
   */
  public render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    if (this.config.enabled && this.renderTarget) {
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      // Future pass: render low-res texture quad to screen canvas with nearest-neighbor scaling
    } else {
      renderer.render(scene, camera);
    }
  }
}
