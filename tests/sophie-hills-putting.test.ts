import { describe, expect, it } from 'vitest';
import { TerrainData } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { PuttingPhysics } from '../src/physics/PuttingPhysics';
import { Vector3 } from 'three';
import fs from 'fs';
import path from 'path';

describe('Sophie Hills Hole 1 Real DEM Putting Tests', () => {
  it('verifies putting on Sophie Hills real terrain', () => {
    const dir = path.resolve(__dirname, '../public/courses/sophie-hills');
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terrain_meta.json'), 'utf8'));
    const bin = fs.readFileSync(path.join(dir, 'terrain.bin'));

    const elevations = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
    const terrainData = new TerrainData(meta, elevations);
    const terrainQuery = new TerrainQuery(terrainData);

    const cup = new Vector3(370, terrainQuery.getTerrainHeight(370, 160, true), 160);

    const approaches = [
      { name: 'From West (Fairway approach)', start: new Vector3(370 - 11.8, 0, 160), angle: 0 },
      { name: 'From South', start: new Vector3(370, 0, 160 - 11.8), angle: Math.PI / 2 },
      { name: 'From South-West', start: new Vector3(370 - 11.8 * Math.cos(Math.PI / 4), 0, 160 - 11.8 * Math.sin(Math.PI / 4)), angle: Math.PI / 4 },
      { name: 'From East (Downhill)', start: new Vector3(370 + 11.8, 0, 160), angle: Math.PI },
      { name: 'From North (Downhill)', start: new Vector3(370, 0, 160 + 11.8), angle: -Math.PI / 2 }
    ];

    for (const app of approaches) {
      app.start.y = terrainQuery.getTerrainHeight(app.start.x, app.start.z, true);
      const norm = terrainQuery.getTerrainNormal(app.start.x, app.start.z);

      const putting = new PuttingPhysics(terrainQuery);
      putting.setPosition(app.start.x, app.start.z);
      putting.launchPutt(10.1, app.angle);

      const dt = 1 / 60;
      let t = 0;
      while (putting.state === 'ROLLING' && t < 20) {
        putting.update(dt, cup);
        t += dt;
      }

      console.log(`\n=== Sophie Hills: ${app.name} ===`);
      console.log(`Pace 10.1m Result -> Dist Traveled: ${putting.rollDistanceTraveled.toFixed(2)}m, Final dist to cup: ${Math.hypot(putting.position.x - cup.x, putting.position.z - cup.z).toFixed(2)}m, State: ${putting.state}, Duration: ${t.toFixed(2)}s`);

      // All putts on the green must stop at rest and must NOT roll off the green or exceed 13.5m!
      expect(putting.state).toBe('REST');
      expect(putting.rollDistanceTraveled).toBeLessThan(13.5);
      expect(putting.rollDistanceTraveled).toBeGreaterThan(7.0);
    }
  });
});
