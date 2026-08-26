import { describe, expect, it } from 'vitest';
import { Vector3, LineSegments } from 'three';
import { AimingGuideRenderer } from '../src/rendering/AimingGuideRenderer';
import { FlagRenderer } from '../src/rendering/FlagRenderer';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { GOLF_CLUBS } from '../src/golf/Club';
import { GameHUD } from '../src/ui/GameHUD';
import { TitleScreen } from '../src/ui/TitleScreen';
import { SURFACE_PROPERTIES } from '../src/course/SurfaceQuery';

function createMockTerrainQuery(): TerrainQuery {
  const meta = {
    courseId: 'test',
    status: 'test',
    gridWidth: 300,
    gridHeight: 300,
    gridSpacingMetres: 1,
    baseElevationMetres: 0,
    minElevationMetres: 0,
    maxElevationMetres: 50,
    widthSamples: 300,
    heightSamples: 300,
    cellSizeMetres: 1,
    vertexExtentX: 299,
    vertexExtentZ: 299,
    elevationMin: 0,
    elevationMax: 50,
    elevationRange: 50,
    sourceResolutionMetres: 1,
    notes: []
  };
  const elevations = new Float32Array(300 * 300);
  for (let z = 0; z < 300; z++) {
    for (let x = 0; x < 300; x++) {
      elevations[z * 300 + x] = 10 + Math.sin(x * 0.2) * 5 + Math.cos(z * 0.2) * 5;
    }
  }
  const terrainData = new TerrainData(meta as any, elevations);
  return new TerrainQuery(terrainData);
}

describe('Aiming Guide Straight Line & Ball Pivot Tests', () => {
  it('generates a geometrically straight 3D line from ball position to target direction', () => {
    const tq = createMockTerrainQuery();
    const guide = new AimingGuideRenderer(tq);
    const ballPos = new Vector3(20, 15, 30);
    const aimAngle = Math.PI / 4; // 45 degrees
    const driver = GOLF_CLUBS[0];

    guide.update(ballPos, aimAngle, driver);
    const group = guide.getGroup();

    // Find the LineSegments mesh
    const lineMesh = group.children.find((c) => c instanceof LineSegments) as LineSegments | undefined;
    expect(lineMesh).toBeDefined();

    const positions = lineMesh!.geometry.attributes.position.array;
    expect(positions.length).toBeGreaterThan(0);

    // Extract all start and end points of segments
    const pStart = new Vector3(positions[0], positions[1], positions[2]);
    const pEnd = new Vector3(
      positions[positions.length - 3],
      positions[positions.length - 2],
      positions[positions.length - 1]
    );

    const lineDir = new Vector3().subVectors(pEnd, pStart).normalize();

    // Check that every point in the line geometry lies precisely on the 3D line from pStart to pEnd
    for (let i = 0; i < positions.length; i += 3) {
      const pt = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const v = new Vector3().subVectors(pt, pStart);
      const projDist = v.dot(lineDir);
      const projPt = new Vector3().copy(pStart).addScaledVector(lineDir, projDist);

      // Distance from point to straight line must be virtually zero (< 0.001)
      const distToLine = pt.distanceTo(projPt);
      expect(distToLine).toBeLessThan(0.001);
    }
  });

  it('rotates strictly around ball pivot when aim angle changes', () => {
    const tq = createMockTerrainQuery();
    const guide = new AimingGuideRenderer(tq);
    const ballPos = new Vector3(25, 12, 35);
    const driver = GOLF_CLUBS[0];

    // Aim 1: 0 radians (+X)
    guide.update(ballPos, 0, driver);
    const line1 = guide.getGroup().children.find((c) => c instanceof LineSegments) as LineSegments;
    const pos1 = line1.geometry.attributes.position.array;
    expect(pos1[0]).toBeCloseTo(ballPos.x, 2);
    expect(pos1[2]).toBeCloseTo(ballPos.z, 2);

    // Aim 2: Math.PI / 2 radians (+Z)
    guide.update(ballPos, Math.PI / 2, driver);
    const line2 = guide.getGroup().children.find((c) => c instanceof LineSegments) as LineSegments;
    const pos2 = line2.geometry.attributes.position.array;
    // Pivot at start must still be at ballPos
    expect(pos2[0]).toBeCloseTo(ballPos.x, 2);
    expect(pos2[2]).toBeCloseTo(ballPos.z, 2);
  });
});

describe('FlagRenderer Visibility & Putting Cup Target', () => {
  it('correctly calculates camera billboard angle to face camera directly', () => {
    const flag = new FlagRenderer();
    const cupPos = new Vector3(100, 10, 100);
    flag.setPosition(cupPos);

    // Camera at (100, 15, 150) -> looking along -Z from camera to flag
    const camPos = new Vector3(100, 15, 150);
    flag.update(camPos);

    const dx = camPos.x - cupPos.x; // 0
    const dz = camPos.z - cupPos.z; // 50
    const expectedAngle = Math.atan2(dx, dz); // 0

    const group = flag.getGroup();
    // Flag cloth child
    const flagCloth = group.children.find((c) => (c as any).geometry.type === 'PlaneGeometry') as any;
    expect(flagCloth.rotation.y).toBeCloseTo(expectedAngle, 4);
  });

  it('switches between full tournament pin and putting cup highlight on putting mode toggle', () => {
    const flag = new FlagRenderer();
    flag.setPuttingMode(false);

    // In approach mode, pole and main flag are visible
    const fullPole = flag.getGroup().children[0];
    expect(fullPole.visible).toBe(true);

    // In putting mode, full pole is hidden and putting cup target/pin is active
    flag.setPuttingMode(true);
    expect(fullPole.visible).toBe(false);
  });
});

describe('GameHUD ShotMode Isolation & Feedback Reset', () => {
  it('strictly isolates FULL_SWING and PUTTING mode containers', () => {
    // Setup minimal DOM mock
    const createdElements: Record<string, any> = {};
    const createMockElem = (tag: string) => ({
      id: '',
      style: {} as Record<string, string>,
      classList: {
        add: () => {},
        remove: () => {}
      },
      innerHTML: '',
      textContent: '',
      setAttribute: () => {},
      querySelector: (sel: string) => createMockElem('div'),
      querySelectorAll: () => [],
      appendChild: () => {},
      addEventListener: () => {}
    });

    const mockDoc = {
      createElement: createMockElem,
      body: {
        appendChild: (el: any) => {
          if (el.id) createdElements[el.id] = el;
        }
      },
      getElementById: (id: string) => createdElements[id]
    };

    (globalThis as any).document = mockDoc;

    const hud = new GameHUD({});

    // 1. In FULL_SWING mode
    hud.setShotMode('FULL_SWING');
    const puttMeter = mockDoc.getElementById('sophie-putt-meter');
    expect(puttMeter?.style.display).toBe('none');

    // 2. In PUTTING mode
    hud.setShotMode('PUTTING');
    const swingMeter = mockDoc.getElementById('sophie-swing-meter');
    expect(swingMeter?.style.display).toBe('none');

    // 3. Reset feedback
    hud.resetShotFeedback();
    expect(puttMeter?.style.display).toBe('none');
    expect(swingMeter?.style.display).toBe('none');

    delete (globalThis as any).document;
  });
});

describe('TitleScreen Clean Game Identity Tests', () => {
  it('displays SOPHIE SMASHES title hierarchy without developer jargon', () => {
    let capturedHTML = '';
    const mockDoc = {
      createElement: (tag: string) => ({
        id: '',
        style: {} as Record<string, string>,
        setAttribute: () => {},
        innerHTML: '',
        querySelector: () => null,
        appendChild: () => {}
      }),
      body: {
        appendChild: (el: any) => {
          capturedHTML = el.innerHTML;
        }
      }
    };

    (globalThis as any).document = mockDoc;

    const titleScreen = new TitleScreen({
      courseName: 'Sophie Hills',
      courseSubtitle: '2-Hole Challenge',
      holeCount: 2,
      totalPar: 7,
      onStart: () => {}
    });

    expect(capturedHTML).toContain('A 16-BIT GOLF STORY');
    expect(capturedHTML).toContain('SOPHIE');
    expect(capturedHTML).toContain('SMASHES');
    expect(capturedHTML).toContain('Sophie Hills');
    expect(capturedHTML).toContain('2-Hole Challenge');
    expect(capturedHTML).toContain('2 HOLES');
    expect(capturedHTML).toContain('PAR 7');
    expect(capturedHTML).toContain('START ROUND');

    // Strict negative checks: No developer / prototype jargon
    expect(capturedHTML).not.toContain('SOPHIE GOLF');
    expect(capturedHTML).not.toContain('FICTIONAL');
    expect(capturedHTML).not.toContain('PREVIEW');
    expect(capturedHTML).not.toContain('WARRAGUL RESEARCH MODE');
    expect(capturedHTML).not.toContain('Warragul course data remains separate');

    delete (globalThis as any).document;
  });
});

describe('Surface Lie Player-Facing Vocabulary Tests', () => {
  it('uses clean authentic golf terms instead of technical strings', () => {
    expect(SURFACE_PROPERTIES.TEE.name).toBe('Tee');
    expect(SURFACE_PROPERTIES.ROUGH.name).toBe('Rough');
    expect(SURFACE_PROPERTIES.DEEP_ROUGH.name).toBe('Deep Rough');
    expect(SURFACE_PROPERTIES.GREEN.name).toBe('Green');
    expect(SURFACE_PROPERTIES.BUNKER.name).toBe('Bunker');
    expect(SURFACE_PROPERTIES.FRINGE.name).toBe('Fringe');
  });
});
