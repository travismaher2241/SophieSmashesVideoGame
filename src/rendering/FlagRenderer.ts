import {
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
  private cupRingMesh: Mesh;

  constructor() {
    this.group = new Group();

    // 1. Flagpole (White/Black striped pin, height 2.8m)
    const poleGeo = new CylinderGeometry(0.04, 0.04, 2.8, 12);
    poleGeo.translate(0, 1.4, 0); // Origin at bottom of pole
    const poleMat = new MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 });
    this.poleMesh = new Mesh(poleGeo, poleMat);
    this.group.add(this.poleMesh);

    // 2. Red Flag Cloth (Width 0.6m, Height 0.4m at top of pole)
    const flagGeo = new PlaneGeometry(0.65, 0.45);
    flagGeo.translate(0.325, 2.5, 0); // Origin at top left of pole
    const flagMat = new MeshBasicMaterial({ color: 0xee2222, side: DoubleSide });
    this.flagMesh = new Mesh(flagGeo, flagMat);
    this.group.add(this.flagMesh);

    // 3. Golf Cup hole ring on ground
    const cupGeo = new RingGeometry(0.05, 0.25, 32);
    cupGeo.rotateX(-Math.PI / 2);
    const cupMat = new MeshBasicMaterial({ color: 0x111111, side: DoubleSide });
    this.cupRingMesh = new Mesh(cupGeo, cupMat);
    this.cupRingMesh.position.y = 0.02;
    this.group.add(this.cupRingMesh);
  }

  public getGroup(): Group {
    return this.group;
  }

  public setPosition(pos: Vector3): void {
    this.group.position.copy(pos);
  }

  public update(cameraPosition: Vector3): void {
    // Rotate flag cloth towards camera direction so it's always readable
    const dx = cameraPosition.x - this.group.position.x;
    const dz = cameraPosition.z - this.group.position.z;
    const angle = Math.atan2(dx, dz) + Math.PI / 2;
    this.flagMesh.rotation.y = angle;
  }
}
