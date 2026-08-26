import {
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3
} from 'three';

export class FlagRenderer {
  private group: Group;
  private poleMesh: Mesh;
  private finialMesh: Mesh;
  private flagMesh: Mesh;
  private cupInnerMesh: Mesh;
  private cupRimMesh: Mesh;
  private cupHighlightMesh: Mesh;
  private targetRingMesh: Mesh;
  private puttingPoleMesh: Mesh;
  private puttingFlagMesh: Mesh;

  constructor() {
    this.group = new Group();

    // 1. Full Tournament Flagpole (Height 3.8m, unlit crisp white)
    const poleGeo = new CylinderGeometry(0.035, 0.035, 3.8, 12);
    poleGeo.translate(0, 1.9, 0); // Origin at ground level
    const poleMat = new MeshBasicMaterial({ color: 0xffffff });
    this.poleMesh = new Mesh(poleGeo, poleMat);
    this.group.add(this.poleMesh);

    // 1b. Gold Top Finial Sphere (for distance pinpointing)
    const finialGeo = new SphereGeometry(0.09, 12, 12);
    finialGeo.translate(0, 3.82, 0);
    const finialMat = new MeshBasicMaterial({ color: 0xffd700 });
    this.finialMesh = new Mesh(finialGeo, finialMat);
    this.group.add(this.finialMesh);

    // 2. High-Visibility Red Tournament Flag Cloth (Width 1.0m, Height 0.65m)
    const flagGeo = new PlaneGeometry(1.0, 0.65);
    flagGeo.translate(0.5, 3.38, 0);
    const flagMat = new MeshBasicMaterial({ color: 0xff1e1e, side: DoubleSide });
    this.flagMesh = new Mesh(flagGeo, flagMat);
    this.group.add(this.flagMesh);

    // 3. Approach Shot Pin Target Locator Disc (beacon halo visible from tee/fairway)
    const targetGeo = new RingGeometry(0.4, 1.2, 32);
    targetGeo.rotateX(-Math.PI / 2);
    const targetMat = new MeshBasicMaterial({
      color: 0x48bb78,
      side: DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.targetRingMesh = new Mesh(targetGeo, targetMat);
    this.targetRingMesh.position.y = 0.02;
    this.group.add(this.targetRingMesh);

    // 4. Dark Recessed Cup Interior (Radius 0.08m)
    const cupInnerGeo = new CircleGeometry(0.08, 32);
    cupInnerGeo.rotateX(-Math.PI / 2);
    const cupInnerMat = new MeshBasicMaterial({ color: 0x050e06, side: DoubleSide });
    this.cupInnerMesh = new Mesh(cupInnerGeo, cupInnerMat);
    this.cupInnerMesh.position.y = 0.025;
    this.group.add(this.cupInnerMesh);

    // 5. Crisp White Plastic Liner Rim (Width 3cm)
    const cupRimGeo = new RingGeometry(0.08, 0.11, 32);
    cupRimGeo.rotateX(-Math.PI / 2);
    const cupRimMat = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
    this.cupRimMesh = new Mesh(cupRimGeo, cupRimMat);
    this.cupRimMesh.position.y = 0.028;
    this.group.add(this.cupRimMesh);

    // 6. Putting Cup Target Highlight Halo (subtle cyan/green ring)
    const cupHighlightGeo = new RingGeometry(0.12, 0.28, 32);
    cupHighlightGeo.rotateX(-Math.PI / 2);
    const cupHighlightMat = new MeshBasicMaterial({
      color: 0x55ffff,
      side: DoubleSide,
      transparent: true,
      opacity: 0.40,
      depthWrite: false
    });
    this.cupHighlightMesh = new Mesh(cupHighlightGeo, cupHighlightMat);
    this.cupHighlightMesh.position.y = 0.026;
    this.cupHighlightMesh.visible = false;
    this.group.add(this.cupHighlightMesh);

    // 7. Compact Putting Flagstick & Mini Pin (Height 0.65m for clear putting green orientation)
    const putterPoleGeo = new CylinderGeometry(0.02, 0.02, 0.65, 8);
    putterPoleGeo.translate(0, 0.325, 0);
    const putterPoleMat = new MeshBasicMaterial({ color: 0xffff44 });
    this.puttingPoleMesh = new Mesh(putterPoleGeo, putterPoleMat);
    this.puttingPoleMesh.visible = false;
    this.group.add(this.puttingPoleMesh);

    const putterFlagGeo = new PlaneGeometry(0.24, 0.16);
    putterFlagGeo.translate(0.12, 0.54, 0);
    const putterFlagMat = new MeshBasicMaterial({ color: 0xff2222, side: DoubleSide });
    this.puttingFlagMesh = new Mesh(putterFlagGeo, putterFlagMat);
    this.puttingFlagMesh.visible = false;
    this.group.add(this.puttingFlagMesh);
  }

  public getGroup(): Group {
    return this.group;
  }

  public setPosition(pos: Vector3): void {
    this.group.position.copy(pos);
  }

  public setPuttingMode(isPutting: boolean): void {
    // Normal approach shots: full tournament flagstick & target beacon
    this.poleMesh.visible = !isPutting;
    this.finialMesh.visible = !isPutting;
    this.flagMesh.visible = !isPutting;
    this.targetRingMesh.visible = !isPutting;

    // Putting mode: compact putting pin, cup highlight halo, and crisp cup liner
    this.puttingPoleMesh.visible = isPutting;
    this.puttingFlagMesh.visible = isPutting;
    this.cupHighlightMesh.visible = isPutting;
  }

  public update(cameraPosition: Vector3): void {
    // Rotate flag cloth to directly face camera line-of-sight for maximum readability
    const dx = cameraPosition.x - this.group.position.x;
    const dz = cameraPosition.z - this.group.position.z;
    const angle = Math.atan2(dx, dz);

    if (this.flagMesh.visible) {
      this.flagMesh.rotation.y = angle;
    }
    if (this.puttingFlagMesh.visible) {
      this.puttingFlagMesh.rotation.y = angle;
    }
  }
}
