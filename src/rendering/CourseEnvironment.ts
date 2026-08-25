import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';
import { TerrainData } from '../course/TerrainData';
import { TerrainQuery } from '../course/TerrainQuery';

/** Lightweight course dressing that gives the heightfield a recognisable golf-course horizon. */
export class CourseEnvironment {
  private readonly group = new Group();

  constructor(terrain: TerrainData, terrainQuery: TerrainQuery) {
    const trunkGeometry = new CylinderGeometry(0.38, 0.55, 4.8, 7);
    trunkGeometry.translate(0, 2.4, 0);
    const crownGeometry = new ConeGeometry(3.5, 8.5, 8);
    crownGeometry.translate(0, 7.2, 0);

    const trunkMaterial = new MeshStandardMaterial({ color: 0x66503a, roughness: 1 });
    const greens = [0x244d2a, 0x2e6434, 0x3a7038];
    const crownMaterials = greens.map(color => new MeshStandardMaterial({ color, roughness: 0.96 }));

    const maxX = terrain.vertexExtentX;
    const maxZ = terrain.vertexExtentZ;
    let seed = 7193;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const addTree = (x: number, z: number, scale: number): void => {
      const tree = new Group();
      const trunk = new Mesh(trunkGeometry, trunkMaterial);
      const crown = new Mesh(crownGeometry, crownMaterials[Math.floor(random() * crownMaterials.length)]);
      trunk.castShadow = true;
      crown.castShadow = true;
      tree.add(trunk, crown);
      tree.position.set(x, terrainQuery.getTerrainHeight(x, z, true), z);
      tree.scale.setScalar(scale);
      tree.rotation.y = random() * Math.PI * 2;
      this.group.add(tree);
    };

    // Keep the playing corridor clear and build irregular tree lines along both long edges.
    for (let x = 18; x < maxX - 12; x += 13 + random() * 16) {
      addTree(x, 10 + random() * 28, 0.72 + random() * 0.65);
      if (random() > 0.16) addTree(x + random() * 12, maxZ - 12 - random() * 28, 0.75 + random() * 0.7);
    }

    // A few layered corner groves make the horizon feel natural without obscuring either hole.
    for (let i = 0; i < 24; i++) {
      const leftSide = i % 2 === 0;
      const x = leftSide ? 8 + random() * 70 : maxX - 78 + random() * 70;
      const z = 35 + random() * Math.max(40, maxZ - 70);
      addTree(x, z, 0.65 + random() * 0.55);
    }
  }

  public getGroup(): Group {
    return this.group;
  }
}
