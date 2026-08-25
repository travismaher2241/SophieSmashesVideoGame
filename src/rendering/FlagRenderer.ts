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
  private targetRingMesh: Mesh;

  constructor() {
    this.group = new Group();

    // 1. Flagpole (White/Black tournament striped pin, height 3.4m for long-distance visibility)
    const poleGeo = new CylinderGeometry(0.05, 0.05, 3.4, 12);
    poleGeo.translate(0, 1.7, 0); // Origin at bottom of pole
    const poleMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    this.poleMesh = new Mesh(poleGeo, poleMat);
    this.group.add(this.poleMesh);

    // 2. Bright Red Triangular Tournament Flag Cloth (Width 0.9m, Height 0.6m)
    const flagGeo = new PlaneGeometry(0.9, 0.6);
    flagGeo.translate(0.45, 3.0, 0); // Top of pin
    const flagMat = new MeshBasicMaterial({ color: 0xff1e1e, side: DoubleSide });
    this.flagMesh = new Mesh(flagGeo, flagMat);
    this.group.add(this.flagMesh);

    // 3. Golf Cup hole ring on ground
    const cupGeo = new RingGeometry(0.04, 0.22, 24);
    cupGeo.rotateX(-Math.PI / 2);
    const cupMat = new MeshBasicMaterial({ color: 0x0a140a, side: DoubleSide });
    this.cupRingMesh = new Mesh(cupGeo, cupMat);
    this.cupRingMesh.position.y = 0.02;
    this.group.add(this.cupRingMesh);

    // 4. Subtle green pin target disc for distance spotting
    const targetGeo = new RingGeometry(0.6, 1.2, 24);
    targetGeo.rotateX(-Math.PI / 2);
    const targetMat = new MeshBasicMaterial({
      color: 0x55ff55,
      side: DoubleSide,
      transparent: true,
      opacity: 0.4
    });
    this.targetRingMesh = new Mesh(targetGeo, targetMat);
    this.targetRingMesh.position.y = 0.03;
    this.group.add(this.targetRingMesh);
  }

  public getGroup(): Group {
    return this.group;
  }

  public setPosition(pos: Vector3): void {
    this.group.position.copy(pos);
  }

  public update(cameraPosition: Vector3): void {
    // Rotate flag cloth perpendicular to camera line-of-sight for maximum readability
    const dx = cameraPosition.x - this.group.position.x;
    const dz = cameraPosition.z - this.group.position.z;
    const angle = Math.atan2(dx, dz) + Math.PI / 2;
    this.flagMesh.rotation.y = angle;
  }
}
