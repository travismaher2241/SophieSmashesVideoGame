import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3
} from 'three';
import { TerrainQuery } from '../course/TerrainQuery';
import { SurfaceType } from '../course/SurfaceQuery';
import { surfaceRenderOffset } from './SurfaceMeshOverlay';
import { apparentSizeScale } from './ApparentSize';

/**
 * Creates a crisp 32x32 pixel-art golf ball texture with 16-bit retro shading,
 * directional lighting, specular highlight, subtle dimple detail, and high-contrast outline.
 */
function createGolfBallTexture(): CanvasTexture {
  // Support both browser and Node/mock environments
  if (typeof document === 'undefined') {
    const fallbackCanvas = { width: 32, height: 32 } as any;
    return new CanvasTexture(fallbackCanvas);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 32, 32);

    const cx = 16, cy = 16, r = 12;
    const cOutline = '#112214';
    const cDeepShadow = '#5a6e60';
    const cShadow = '#8ba192';
    const cMid = '#c6d6cb';
    const cBase = '#eef5f0';
    const cBright = '#ffffff';

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > r + 0.5) {
          continue;
        } else if (dist >= r - 0.7) {
          ctx.fillStyle = cOutline;
          ctx.fillRect(x, y, 1, 1);
        } else {
          const nz = Math.sqrt(Math.max(0, r * r - dx * dx - dy * dy)) / r;
          const nx = dx / r;
          const ny = dy / r;

          // Light direction from top-left front: (-0.55, -0.65, 0.52)
          const lx = -0.55, ly = -0.65, lz = 0.52;
          const dot = nx * lx + ny * ly + nz * lz;

          // Highlight at top-left
          const hx = x - (cx - 4.5);
          const hy = y - (cy - 4.5);
          const hDist = Math.sqrt(hx * hx + hy * hy);

          if (hDist < 3.0) {
            ctx.fillStyle = cBright;
          } else if (dot > 0.40) {
            const isDimple = ((x * 2 + y) % 3 === 0) && (hDist > 4.5);
            ctx.fillStyle = isDimple ? cMid : cBase;
          } else if (dot > 0.05) {
            const isDimple = ((x + y * 2) % 3 === 0);
            ctx.fillStyle = isDimple ? cShadow : cMid;
          } else if (dot > -0.30) {
            const isDimple = ((x + y * 2) % 3 === 0);
            ctx.fillStyle = isDimple ? cDeepShadow : cShadow;
          } else {
            ctx.fillStyle = cDeepShadow;
          }
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export class BallRenderer {
  /** Regulation golf ball diameter, and the size the mesh is built at. */
  private static readonly BALL_DIAMETRE_METRES = 0.088;

  /**
   * Smallest the ball may appear, in pixels of the internal buffer.
   *
   * Small enough to stay a ball, big enough to track against trees and sky.
   */
  private static readonly MIN_APPARENT_PIXELS = 7;

  /** Ceiling on the enlargement, so a distant ball never reads as a beach ball. */
  private static readonly MAX_VISIBILITY_SCALE = 9;
  private group: Group;
  private ballMesh: Mesh;
  private shadowMesh: Mesh;
  private teeMesh: Mesh;
  private tracerMesh: LineSegments | null = null;
  private terrainQuery: TerrainQuery;

  private tracerPoints: Vector3[] = [];

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
    this.group = new Group();

    // 1. Pixel-Art Golf Ball Sprite (Diameter 0.088m / Radius 0.044m for believable golf scale)
    const ballTexture = createGolfBallTexture();
    const ballGeo = new PlaneGeometry(BallRenderer.BALL_DIAMETRE_METRES, BallRenderer.BALL_DIAMETRE_METRES);
    const ballMat = new MeshBasicMaterial({
      map: ballTexture,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: true
    });
    this.ballMesh = new Mesh(ballGeo, ballMat);
    this.ballMesh.renderOrder = 60;
    this.group.add(this.ballMesh);

    // 2. Crisp Ground Contact Shadow Disc
    const shadowGeo = new PlaneGeometry(0.10, 0.075);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      color: 0x021004,
      transparent: true,
      opacity: 0.70
    });
    this.shadowMesh = new Mesh(shadowGeo, shadowMat);
    this.shadowMesh.renderOrder = 20;
    this.group.add(this.shadowMesh);

    // 3. Subtle wooden tee peg (visible when on teeing ground)
    const teeGeo = new CylinderGeometry(0.004, 0.002, 0.040, 6);
    const teeMat = new MeshBasicMaterial({ color: 0xd4a055 });
    this.teeMesh = new Mesh(teeGeo, teeMat);
    this.teeMesh.visible = false;
    this.group.add(this.teeMesh);
  }

  public setTerrainQuery(terrainQuery: TerrainQuery): void {
    this.terrainQuery = terrainQuery;
  }

  public getGroup(): Group {
    return this.group;
  }

  public clearTracer(): void {
    this.tracerPoints = [];
    if (this.tracerMesh) {
      this.group.remove(this.tracerMesh);
      this.tracerMesh.geometry.dispose();
      this.tracerMesh = null;
    }
  }

  public addTracerPoint(pos: Vector3): void {
    this.tracerPoints.push(pos.clone());
    this.rebuildTracerMesh();
  }

  private rebuildTracerMesh(): void {
    if (this.tracerMesh) {
      this.group.remove(this.tracerMesh);
      this.tracerMesh.geometry.dispose();
      this.tracerMesh = null;
    }

    if (this.tracerPoints.length < 2) return;

    const positions: number[] = [];
    for (let i = 0; i < this.tracerPoints.length - 1; i++) {
      const p1 = this.tracerPoints[i];
      const p2 = this.tracerPoints[i + 1];
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    const mat = new LineBasicMaterial({
      color: 0xffea33,
      linewidth: 2
    });

    this.tracerMesh = new LineSegments(geo, mat);
    this.group.add(this.tracerMesh);
  }

  /**
   * How much to enlarge the ball so it stays visible at a given camera distance.
   *
   * A golf ball is 43mm across. Drawn at true scale it is sub-pixel at anything
   * past a few metres: during a drive the follow camera trails ~30m behind, which
   * put the ball at barely two pixels — effectively invisible for the whole shot.
   */
  public static visibilityScale(distanceToCamera: number): number {
    return apparentSizeScale(
      BallRenderer.BALL_DIAMETRE_METRES,
      distanceToCamera,
      BallRenderer.MIN_APPARENT_PIXELS,
      BallRenderer.MAX_VISIBILITY_SCALE
    );
  }

  /**
   * Height to draw the ball at, given its physical height and the surface it lies on.
   *
   * Surface meshes are drawn 2-12cm above the bare terrain to stop them
   * z-fighting. A ball is 43mm across and rests at terrain height plus its
   * radius, which is BELOW the fairway, tee and green meshes — so a ball at rest
   * was being rendered underneath the grass, invisible at address and wherever it
   * came down. Lifting it by the same offset puts it back on top of the surface
   * the player can see.
   */
  public static renderHeight(ballY: number, lie: SurfaceType): number {
    return ballY + surfaceRenderOffset(lie);
  }

  public update(ballPos: Vector3, camera?: Camera, lie: SurfaceType = 'GENERAL_AREA'): void {
    const surfaceLift = surfaceRenderOffset(lie);
    this.ballMesh.position.set(ballPos.x, BallRenderer.renderHeight(ballPos.y, lie), ballPos.z);

    if (camera) {
      const dx = camera.position.x - ballPos.x;
      const dz = camera.position.z - ballPos.z;
      this.ballMesh.rotation.y = Math.atan2(dx, dz);

      const dy = camera.position.y - this.ballMesh.position.y;
      this.ballMesh.scale.setScalar(BallRenderer.visibilityScale(Math.hypot(dx, dy, dz)));
    }

    // Ground shadow placement, on the drawn surface rather than the bare terrain.
    const terrainY = this.terrainQuery.getTerrainHeight(ballPos.x, ballPos.z, true);
    this.shadowMesh.position.set(ballPos.x, terrainY + surfaceLift + 0.004, ballPos.z);

    // Scale and fade shadow based on height above ground
    const heightAboveGround = Math.max(0, ballPos.y - terrainY);
    const shadowScale = Math.max(0.30, 1.0 - heightAboveGround * 0.035);
    const shadowOpacity = Math.max(0.08, 0.70 - heightAboveGround * 0.03);
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    (this.shadowMesh.material as MeshBasicMaterial).opacity = shadowOpacity;

    // Tee peg visibility
    this.teeMesh.visible = lie === 'TEE' && heightAboveGround < 0.08;
    if (this.teeMesh.visible) {
      this.teeMesh.position.set(ballPos.x, terrainY + surfaceLift + 0.020, ballPos.z);
    }
  }
}
