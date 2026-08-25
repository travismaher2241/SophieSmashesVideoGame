import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer
} from 'three';

export class SceneManager {
  public readonly scene: Scene;
  public readonly renderer: WebGLRenderer;
  public readonly sunLight: DirectionalLight;
  public readonly ambientLight: AmbientLight;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.scene.background = this.createSkyTexture();
    this.scene.fog = new Fog(new Color(0xb8d8d1), 260, 920);

    // WebGL Renderer
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Lighting setup for bright 16-bit golf palette
    this.ambientLight = new AmbientLight(0xffffff, 0.95);
    this.scene.add(this.ambientLight);

    const skyLight = new HemisphereLight(0xe4f2ff, 0x365827, 1.35);
    this.scene.add(skyLight);

    this.sunLight = new DirectionalLight(0xfff8eb, 2.4);
    this.sunLight.position.set(-180, 450, -120);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1500;
    
    const d = 500;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;

    this.scene.add(this.sunLight);

    // Resize handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private createSkyTexture(): CanvasTexture {
    const sky = document.createElement('canvas');
    sky.width = 64;
    sky.height = 256;
    const ctx = sky.getContext('2d')!;

    // 16-bit gradient sky
    const gradient = ctx.createLinearGradient(0, 0, 0, sky.height);
    gradient.addColorStop(0, '#2b6cb0'); // Deep retro azure
    gradient.addColorStop(0.40, '#4299e1');
    gradient.addColorStop(0.72, '#90cdf4');
    gradient.addColorStop(0.90, '#e2e8f0');
    gradient.addColorStop(1.0, '#fed7aa'); // Golden horizon glow
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, sky.width, sky.height);

    // Subtle 16-bit pixel cloud bands
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(8, 70, 24, 6);
    ctx.fillRect(12, 66, 16, 4);
    ctx.fillRect(38, 95, 20, 5);
    ctx.fillRect(42, 92, 12, 3);
    ctx.fillRect(4, 120, 18, 4);

    const texture = new CanvasTexture(sky);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  public render(camera: PerspectiveCamera): void {
    this.renderer.render(this.scene, camera);
  }

  private onWindowResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
