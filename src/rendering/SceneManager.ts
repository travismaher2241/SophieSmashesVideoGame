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
    sky.width = 1024;
    sky.height = 512;
    const ctx = sky.getContext('2d')!;

    const gradient = ctx.createLinearGradient(0, 0, 0, sky.height);
    gradient.addColorStop(0, '#287fbd');
    gradient.addColorStop(0.52, '#65b5df');
    gradient.addColorStop(0.84, '#c8dede');
    gradient.addColorStop(1.0, '#efd5aa');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, sky.width, sky.height);

    const drawCloud = (x: number, y: number, scale: number): void => {
      const cloud = ctx.createRadialGradient(x, y, 4, x, y, 95 * scale);
      cloud.addColorStop(0, 'rgba(255,255,255,.72)');
      cloud.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.ellipse(x, y, 120 * scale, 28 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 48 * scale, y + 5, 70 * scale, 22 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 50 * scale, y + 6, 82 * scale, 23 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    drawCloud(255, 150, 1.0);
    drawCloud(760, 215, 0.82);

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
