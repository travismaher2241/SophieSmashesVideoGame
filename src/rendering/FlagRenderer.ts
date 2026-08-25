import {
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3
} from 'three';

export class FlagRenderer {
  private group: Group;
  private poleMesh: Mesh;
  private flagMesh: Mesh;
  private cupInnerMesh: Mesh;
  private cupRimMesh: Mesh;
  private targetRingMesh: Mesh;

  constructor() {
    this.group = new Group();

    // 1. Full Tournament Flagpole (Height 3.2m, pin radius 0.025m)
    const poleGeo = new CylinderGeometry(0.025, 0.025, 3.2, 12);
    poleGeo.translate(0, 1.6, 0); // Origin at ground level
    const poleMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    this.poleMesh = new Mesh(poleGeo, poleMat);
    this.group.add(this.poleMesh);

    // 2. Red Triangular Tournament Flag Cloth (Width 0.75m, Height 0.45m)
    const flagGeo = new PlaneGeometry(0.75, 0.45);
    flagGeo.translate(0.38, 2.85, 0);
    const flagMat = new MeshBasicMaterial({ color: 0xff2222, side: DoubleSide });
    this.flagMesh = new Mesh(flagGeo, flagMat);
    this.group.add(this.flagMesh);

    // 3. Real 108mm Diameter Dark Recessed Cup (Radius 0.054m)
    const cupInnerGeo = new CircleGeometry(0.054, 24);
    cupInnerGeo.rotateX(-Math.PI / 2);
    const cupInnerMat = new MeshBasicMaterial({ color: 0x050d06, side: DoubleSide });
    this.cupInnerMesh = new Mesh(cupInnerGeo, cupInnerMat);
    this.cupInnerMesh.position.y = 0.01;
    this.group.add(this.cupInnerMesh);

    // 4. Subtle White/Green Plastic Liner Ring (Width 6mm)
    const cupRimGeo = new RingGeometry(0.054, 0.062, 24);
    cupRimGeo.rotateX(-Math.PI / 2);
    const cupRimMat = new MeshBasicMaterial({ color: 0xddffdd, side: DoubleSide });
    this.cupRimMesh = new Mesh(cupRimGeo, cupRimMat);
    this.cupRimMesh.position.y = 0.015;
    this.group.add(this.cupRimMesh);

    // 5. Green pin target locator disc (for long-distance spotting, hidden during putting)
    const targetGeo = new RingGeometry(0.4, 0.8, 24);
    targetGeo.rotateX(-Math.PI / 2);
    const targetMat = new MeshBasicMaterial({
      color: 0x55ff55,
      side: DoubleSide,
      transparent: true,
      opacity: 0.35
    });
    this.targetRingMesh = new Mesh(targetGeo, targetMat);
    this.targetRingMesh.position.y = 0.02;
    this.group.add(this.targetRingMesh);
  }

  public getGroup(): Group {
    return this.group;
  }

  public setPosition(pos: Vector3): void {
    this.group.position.copy(pos);
  }

  public setPuttingMode(isPutting: boolean): void {
    // When putting, remove the obstructive flagstick and target disc so cup is fully visible
    this.poleMesh.visible = !isPutting;
    this.flagMesh.visible = !isPutting;
    this.targetRingMesh.visible = !isPutting;
  }

  public update(cameraPosition: Vector3): void {
    if (!this.flagMesh.visible) return;

    // Rotate flag cloth perpendicular to camera line-of-sight for maximum readability
    const dx = cameraPosition.x - this.group.position.x;
    const dz = cameraPosition.z - this.group.position.z;
    const angle = Math.atan2(dx, dz) + Math.PI / 2;
    this.flagMesh.rotation.y = angle;
  }
}
