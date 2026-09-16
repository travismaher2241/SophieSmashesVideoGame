import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3
} from 'three';
import { surfaceRenderOffset } from './SurfaceMeshOverlay';
import { apparentSizeScale } from './ApparentSize';

/**
 * The hole and its flagstick.
 *
 * The green is a solid mesh with no hole cut in it, so the cup is drawn on top of
 * the putting surface and shaded to read as a recess.
 */
export class FlagRenderer {
  /** Regulation cup: 108mm across. */
  private static readonly CUP_RADIUS = 0.054;
  /**
   * Smallest the cup may appear, in pixels of the internal buffer.
   *
   * Visual only — the cup the ball has to find is the physics one, which stays
   * regulation size however this is drawn.
   */
  private static readonly MIN_CUP_PIXELS = 26;
  /** Ceiling on that enlargement, so a distant pin does not sprout a crater. */
  private static readonly MAX_CUP_SCALE = 4.5;
  /** Beyond this distance the pin is hard to pick out, so the locator ring shows. */
  private static readonly LOCATOR_RING_DISTANCE = 45;
  /** Regulation flagstick height. */
  private static readonly POLE_HEIGHT = 2.1;

  private group: Group;
  /** Everything that sits at ground level, lifted onto the drawn green surface. */
  private groundGroup: Group;
  private poleMesh: Mesh;
  private flagMesh: Mesh;
  private targetRingMesh: Mesh;
  private isPutting = false;
  private cupWallMesh!: Mesh;
  /** The cup's parts, scaled together to hold a readable size at distance. */
  private cupGroup!: Group;

  constructor() {
    this.group = new Group();
    this.groundGroup = new Group();
    // Surface meshes are drawn above the bare terrain, so anything resting on a
    // green has to clear that offset or it is rendered underneath the grass.
    // The cup used to sit 2.5cm up against a green drawn at 12cm: invisible.
    this.groundGroup.position.y = surfaceRenderOffset('GREEN');
    this.group.add(this.groundGroup);

    this.cupGroup = new Group();
    this.groundGroup.add(this.cupGroup);
    this.buildCup();

    // Locator ring, so the pin is findable from out in the fairway where a 108mm
    // cup is well under a pixel across. Subtle: it is an aid, not decoration.
    const targetGeo = new RingGeometry(0.55, 0.95, 32);
    targetGeo.rotateX(-Math.PI / 2);
    const targetMat = new MeshBasicMaterial({
      color: 0x6fe39a,
      side: DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this.targetRingMesh = new Mesh(targetGeo, targetMat);
    this.targetRingMesh.position.y = 0.006;
    this.targetRingMesh.renderOrder = 10;
    this.groundGroup.add(this.targetRingMesh);

    // One flagstick at regulation height, whatever the shot. The old putting mode
    // swapped in a 0.65m stick, which read as a toy pin next to a full-size ball.
    const poleGeo = new CylinderGeometry(0.019, 0.022, FlagRenderer.POLE_HEIGHT, 8);
    poleGeo.translate(0, FlagRenderer.POLE_HEIGHT / 2, 0);
    const poleMat = new MeshBasicMaterial({ map: this.createPoleTexture() });
    this.poleMesh = new Mesh(poleGeo, poleMat);
    this.groundGroup.add(this.poleMesh);

    this.flagMesh = new Mesh(this.createFlagGeometry(), new MeshBasicMaterial({
      map: this.createFlagTexture(),
      side: DoubleSide,
      transparent: true,
      alphaTest: 0.2
    }));
    this.groundGroup.add(this.flagMesh);
  }

  /**
   * The hole, drawn just above the putting surface.
   *
   * The green is an opaque mesh with no hole cut in it, so a cup modelled as a
   * recess is simply covered over by the turf above it — which is what made the
   * hole invisible. The depth is faked instead: a dark mouth, the bright liner
   * rim at its edge, a lit crescent on the far wall, and a shadow collar in the
   * turf around the lip.
   */
  private buildCup(): void {
    // Shadow collar in the surrounding turf.
    const collarGeo = new RingGeometry(FlagRenderer.CUP_RADIUS, FlagRenderer.CUP_RADIUS * 1.6, 24);
    collarGeo.rotateX(-Math.PI / 2);
    collarGeo.translate(0, 0.004, 0);
    const collar = new Mesh(collarGeo, new MeshBasicMaterial({
      color: 0x24401c,
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    }));
    collar.renderOrder = 11;
    this.cupGroup.add(collar);

    // The mouth of the hole.
    const mouthGeo = new CircleGeometry(FlagRenderer.CUP_RADIUS, 24);
    mouthGeo.rotateX(-Math.PI / 2);
    mouthGeo.translate(0, 0.008, 0);
    const mouth = new Mesh(mouthGeo, new MeshBasicMaterial({ color: 0x0b1509 }));
    mouth.renderOrder = 12;
    this.cupGroup.add(mouth);

    // Lit far wall: a crescent inside the mouth, turned away from the camera in
    // update() so the hole reads as having a depth the flat disc cannot show.
    const wallGeo = new RingGeometry(FlagRenderer.CUP_RADIUS * 0.52, FlagRenderer.CUP_RADIUS * 0.94, 20, 1, Math.PI * 0.15, Math.PI * 0.7);
    wallGeo.rotateX(-Math.PI / 2);
    wallGeo.translate(0, 0.009, 0);
    this.cupWallMesh = new Mesh(wallGeo, new MeshBasicMaterial({ color: 0x3f5136, side: DoubleSide }));
    this.cupWallMesh.renderOrder = 13;
    this.cupGroup.add(this.cupWallMesh);

    // White liner rim at the lip: the bright edge that makes a hole legible.
    const rimGeo = new RingGeometry(FlagRenderer.CUP_RADIUS * 0.9, FlagRenderer.CUP_RADIUS * 1.04, 24);
    rimGeo.rotateX(-Math.PI / 2);
    rimGeo.translate(0, 0.01, 0);
    const rim = new Mesh(rimGeo, new MeshBasicMaterial({ color: 0xf4f6f1, side: DoubleSide }));
    rim.renderOrder = 14;
    this.cupGroup.add(rim);
  }

  /** A pennant rather than a rectangle: it reads as a flag at a glance. */
  private createFlagGeometry() {
    const height = 0.30;
    const length = 0.58;
    const top = FlagRenderer.POLE_HEIGHT - 0.04;

    const shape = new Shape();
    shape.moveTo(0, top);
    shape.lineTo(length, top - height * 0.42);
    shape.lineTo(length * 0.86, top - height * 0.62);
    shape.lineTo(length, top - height);
    shape.lineTo(0, top - height);
    shape.closePath();

    return new ShapeGeometry(shape);
  }

  /** White stick with red bands, the way a flagstick is actually painted. */
  private createPoleTexture(): CanvasTexture | null {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f4f6f1';
    ctx.fillRect(0, 0, 4, 32);
    ctx.fillStyle = '#d43a2f';
    // Bands down the lower two-thirds; the top stays white behind the flag.
    for (let band = 0; band < 3; band++) {
      ctx.fillRect(0, 12 + band * 7, 4, 3);
    }

    return this.pixelTexture(canvas);
  }

  /** Flag cloth with a little shading so it is not a flat red blob. */
  private createFlagTexture(): CanvasTexture | null {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#e02b22';
    ctx.fillRect(0, 0, 24, 16);
    // Lit along the top, shaded along the trailing edge and the bottom fold.
    ctx.fillStyle = '#f4584a';
    ctx.fillRect(0, 0, 24, 4);
    ctx.fillStyle = '#a81d17';
    ctx.fillRect(0, 12, 24, 4);
    ctx.fillStyle = '#7d1410';
    ctx.fillRect(0, 0, 2, 16);

    return this.pixelTexture(canvas);
  }

  private pixelTexture(canvas: HTMLCanvasElement): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    return texture;
  }

  public getGroup(): Group {
    return this.group;
  }

  /** Place the pin at the cup's position on the ground. */
  public setPosition(pos: Vector3): void {
    this.group.position.copy(pos);
  }

  public setPuttingMode(isPutting: boolean): void {
    this.isPutting = isPutting;
  }

  public update(cameraPosition: Vector3): void {
    // Turn the cloth to face the camera so the flag stays readable from any angle.
    const dx = cameraPosition.x - this.group.position.x;
    const dz = cameraPosition.z - this.group.position.z;
    const toCamera = Math.atan2(dx, dz);
    this.flagMesh.rotation.y = toCamera;

    // Keep the lit wall on the far side of the cup from the viewer.
    this.cupWallMesh.rotation.y = -Math.atan2(dz, dx);

    // Hold the cup at a readable size. Seen along the ground it foreshortens hard
    // — from a putting camera a true-size cup is about two pixels of dash — so it
    // is drawn larger with distance, the same way the ball is.
    const dy = cameraPosition.y - this.group.position.y;
    const distance = Math.hypot(dx, dy, dz);
    this.cupGroup.scale.setScalar(
      apparentSizeScale(FlagRenderer.CUP_RADIUS * 2, distance, FlagRenderer.MIN_CUP_PIXELS, FlagRenderer.MAX_CUP_SCALE)
    );

    // The locator ring is for finding a pin from out on the hole. Standing beside
    // it, a translucent disc on the green just looks like a mark on the turf.
    this.targetRingMesh.visible = !this.isPutting && distance > FlagRenderer.LOCATOR_RING_DISTANCE;
  }
}
