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
import { CUP_CAPTURE_RADIUS_METRES } from '../physics/PuttingPhysics';

/**
 * The hole and its flagstick.
 *
 * The green is a solid mesh with no hole cut in it, so the cup is drawn on top of
 * the putting surface and shaded to read as a recess.
 */
export class FlagRenderer {
  /**
   * The hole the ball actually has to find.
   *
   * Drawn at the radius the physics captures at, and never scaled up from it.
   * It used to be enlarged with distance so you could see it, which made the
   * black disc on a putting green nearly twice the width of the real target: the
   * ball rolled across the hole and stayed out, because the part it crossed was
   * paint. The mouth tells the truth now, and the markings around it do the work
   * of being visible.
   */
  private static readonly CUP_RADIUS = CUP_CAPTURE_RADIUS_METRES;
  /**
   * Smallest the ring around the cup may appear, in pixels of the internal buffer.
   *
   * The collar and the lip are markings on the turf, not the hole, so they can be
   * drawn as large as they need to be to find from out on the fairway.
   */
  private static readonly MIN_MARKING_PIXELS = 18;
  /** Ceiling on that enlargement, so a distant pin does not sprout a crater. */
  private static readonly MAX_MARKING_SCALE = 3.5;
  /**
   * Within this distance the bright liner ring is not drawn.
   *
   * It is there to make the hole findable from out on the hole. Standing over a
   * putt it is the opposite of helpful: a white ring twice the width of the cup
   * reads as a target painted on the green, and the eye goes to the ring instead
   * of to the hole the ball has to fall into.
   */
  private static readonly RIM_VISIBLE_BEYOND = 13;
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
  /** The hole itself, always drawn at the size the ball is actually caught at. */
  private cupGroup!: Group;
  /** The collar and lip around it, enlarged with distance so the hole is findable. */
  private markingGroup!: Group;
  private rimMesh!: Mesh;

  constructor() {
    this.group = new Group();
    this.groundGroup = new Group();
    // Surface meshes are drawn above the bare terrain, so anything resting on a
    // green has to clear that offset or it is rendered underneath the grass.
    // The cup used to sit 2.5cm up against a green drawn at 12cm: invisible.
    this.groundGroup.position.y = surfaceRenderOffset('GREEN');
    this.group.add(this.groundGroup);

    this.cupGroup = new Group();
    this.markingGroup = new Group();
    this.groundGroup.add(this.cupGroup);
    this.groundGroup.add(this.markingGroup);
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
    // A shallow dished collar around the hole, drawn as a filled disc rather than
    // a ring: the mouth sits on top of it at true size, and a ring sized for
    // legibility would leave a band of bare green between the two that reads as
    // a target painted on the grass rather than ground falling into a hole.
    const collarGeo = new CircleGeometry(FlagRenderer.CUP_RADIUS * 2.0, 28);
    collarGeo.rotateX(-Math.PI / 2);
    collarGeo.translate(0, 0.004, 0);
    const collar = new Mesh(collarGeo, new MeshBasicMaterial({
      color: 0x1d3a17,
      side: DoubleSide,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    }));
    collar.renderOrder = 11;
    this.markingGroup.add(collar);

    // The mouth of the hole.
    const mouthGeo = new CircleGeometry(FlagRenderer.CUP_RADIUS, 24);
    mouthGeo.rotateX(-Math.PI / 2);
    mouthGeo.translate(0, 0.008, 0);
    const mouth = new Mesh(mouthGeo, new MeshBasicMaterial({ color: 0x0b1509 }));
    mouth.renderOrder = 16;
    this.cupGroup.add(mouth);

    // Lit far wall: a crescent inside the mouth, turned away from the camera in
    // update() so the hole reads as having a depth the flat disc cannot show.
    const wallGeo = new RingGeometry(FlagRenderer.CUP_RADIUS * 0.52, FlagRenderer.CUP_RADIUS * 0.94, 20, 1, Math.PI * 0.15, Math.PI * 0.7);
    wallGeo.rotateX(-Math.PI / 2);
    wallGeo.translate(0, 0.009, 0);
    this.cupWallMesh = new Mesh(wallGeo, new MeshBasicMaterial({ color: 0x3f5136, side: DoubleSide }));
    this.cupWallMesh.renderOrder = 17;
    this.cupGroup.add(this.cupWallMesh);

    // White liner rim, drawn just outside the mouth rather than over it. It is
    // what makes the hole findable at a glance, so it is allowed to grow with
    // distance — but it never covers the ground the ball has to reach, or it
    // would be back to promising a drop the physics will not give.
    const rimGeo = new RingGeometry(FlagRenderer.CUP_RADIUS * 1.62, FlagRenderer.CUP_RADIUS * 2.0, 28);
    rimGeo.rotateX(-Math.PI / 2);
    rimGeo.translate(0, 0.01, 0);
    this.rimMesh = new Mesh(rimGeo, new MeshBasicMaterial({
      color: 0xf4f6f1,
      side: DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    }));
    this.rimMesh.renderOrder = 14;
    this.markingGroup.add(this.rimMesh);
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

    // The mouth is never scaled: it is the hole, and it has to sit exactly where
    // the ball will be taken. Only the markings around it grow with distance,
    // which is what keeps the pin findable without lying about the target.
    const dy = cameraPosition.y - this.group.position.y;
    const distance = Math.hypot(dx, dy, dz);
    this.markingGroup.scale.setScalar(
      apparentSizeScale(
        FlagRenderer.CUP_RADIUS * 2,
        distance,
        FlagRenderer.MIN_MARKING_PIXELS,
        FlagRenderer.MAX_MARKING_SCALE
      )
    );

    this.rimMesh.visible = distance > FlagRenderer.RIM_VISIBLE_BEYOND;

    // The locator ring is for finding a pin from out on the hole. Standing beside
    // it, a translucent disc on the green just looks like a mark on the turf.
    this.targetRingMesh.visible = !this.isPutting && distance > FlagRenderer.LOCATOR_RING_DISTANCE;
  }
}
