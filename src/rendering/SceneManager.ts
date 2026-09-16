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

/** Shadow map resolution. One number of texels, however much ground it covers. */
export const SHADOW_MAP_SIZE = 2048;

/**
 * The shadow volume for a course of this size, and what it costs per texel.
 *
 * A directional light's shadow map is a fixed grid stretched over whatever
 * ground the volume covers, so every metre of empty ground inside it is paid for
 * in precision over the ground that has a course on it. Covering a kilometre
 * with 2048 texels is half a metre each, which is coarser than the undulation of
 * a green — and a depth test that coarse tells flat, sunlit turf that it is
 * standing in its own shadow.
 */
export function shadowVolumeForCourse(extentX: number, extentZ: number): {
  extent: number;
  texelMetres: number;
  normalBias: number;
} {
  const usableX = Number.isFinite(extentX) && extentX > 0 ? extentX : 640;
  const usableZ = Number.isFinite(extentZ) && extentZ > 0 ? extentZ : 640;

  // The sun comes in at an angle, so a square that holds the course seen from
  // straight above still has to be grown to hold it seen from over there.
  const extent = Math.max(60, (Math.hypot(usableX, usableZ) / 2) * 1.15);
  const texelMetres = (extent * 2) / SHADOW_MAP_SIZE;

  // The bias has to be worth more than a texel, because a texel is the distance
  // over which the map has no idea what the ground is doing. Tying it to the
  // texel rather than fixing a number means a long hole, whose map is stretched
  // further, gets the larger nudge it needs instead of a value tuned on a short
  // one. Too large and shadows creep away from what casts them, so it is a
  // little over one texel and no more.
  return { extent, texelMetres, normalBias: texelMetres * 1.3 };
}

export class SceneManager {
  public readonly scene: Scene;
  public readonly renderer: WebGLRenderer;
  /**
   * Half-width of the shadow volume before a course is loaded.
   *
   * Once the terrain is known this shrinks to fit it, which is most of the fix:
   * a 2048 map stretched over a kilometre is half a metre per texel, and no
   * amount of bias makes a comparison that coarse behave on a putting green.
   */
  /** Stand-in course size before a real one is loaded. */
  private static readonly DEFAULT_COURSE_SIZE = 640;

  public readonly sunLight: DirectionalLight;
  public readonly ambientLight: AmbientLight;

  private canvas: HTMLCanvasElement;
  private readonly skyBackground: CanvasTexture;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.skyBackground = this.createSkyTexture();
    this.scene.background = this.skyBackground;
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
    this.sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    this.sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1500;

    // Nudge the depth comparison off the surface it is testing.
    //
    // Without this a shadow map tells flat, sunlit turf that it is standing in
    // its own shadow, in patches the size of a shadow texel. That is what the
    // blotches on the greens were, and why they crawled about when the camera
    // moved: nothing on the green was changing, only which texel each pixel
    // happened to ask.
    this.sunLight.shadow.bias = -0.0005;

    this.applyShadowVolume(shadowVolumeForCourse(SceneManager.DEFAULT_COURSE_SIZE, SceneManager.DEFAULT_COURSE_SIZE));

    this.scene.add(this.sunLight);

    // Resize handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  /**
   * Size the shadow volume to the course that is actually loaded.
   *
   * The shadow map is a fixed number of texels however much ground it is asked
   * to cover, so covering ground that has no course on it is paid for in
   * precision over the ground that does.
   */
  public fitShadowsToCourse(extentX: number, extentZ: number): void {
    if (!Number.isFinite(extentX) || !Number.isFinite(extentZ)) return;

    this.sunLight.target.position.set(extentX / 2, 0, extentZ / 2);
    this.sunLight.target.updateMatrixWorld();
    if (!this.sunLight.target.parent) this.scene.add(this.sunLight.target);

    // The light sits over the course rather than over the origin, or half the
    // holes fall outside the volume however big it is.
    this.sunLight.position.set(extentX / 2 - 180, 450, extentZ / 2 - 120);

    this.applyShadowVolume(shadowVolumeForCourse(extentX, extentZ));
  }

  private applyShadowVolume({ extent, normalBias }: { extent: number; normalBias: number }): void {
    const camera = this.sunLight.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();

    this.sunLight.shadow.normalBias = normalBias;
    this.sunLight.shadow.needsUpdate = true;
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

    const texture = new CanvasTexture(sky);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  public render(camera: PerspectiveCamera): void {
    this.renderer.render(this.scene, camera);
  }

  public setOverheadMode(enabled: boolean): void {
    this.scene.background = enabled ? new Color(0x17392d) : this.skyBackground;
  }

  private onWindowResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
