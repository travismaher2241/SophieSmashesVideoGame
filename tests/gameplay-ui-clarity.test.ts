import { describe, expect, it } from 'vitest';
import { Vector3, LineSegments, Mesh, Object3D } from 'three';

/** First mesh under `root` matching a predicate, at any depth. */
function findMesh(root: Object3D, predicate: (mesh: Mesh) => boolean): Mesh | undefined {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh && predicate(object)) found = object;
  });
  return found;
}
import { AimingGuideRenderer } from '../src/rendering/AimingGuideRenderer';
import { FlagRenderer } from '../src/rendering/FlagRenderer';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { TerrainData } from '../src/course/TerrainData';
import { GOLF_CLUBS } from '../src/golf/Club';
import { GameHUD } from '../src/ui/GameHUD';
import { SHOT_SHAPES, shapeProfile } from '../src/golf/ShotShape';
import { shotTypeProfile } from '../src/golf/ShotType';
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
  it('turns the flag cloth to face the camera directly', () => {
    const flag = new FlagRenderer();
    const cupPos = new Vector3(100, 10, 100);
    flag.setPosition(cupPos);

    const camPos = new Vector3(100, 15, 150);
    flag.update(camPos);

    const dx = camPos.x - cupPos.x; // 0
    const dz = camPos.z - cupPos.z; // 50
    const expectedAngle = Math.atan2(dx, dz); // 0

    // The cloth is a pennant, so it is the shape geometry rather than a plane.
    const cloth = findMesh(flag.getGroup(), (mesh) => mesh.geometry.type === 'ShapeGeometry');
    expect(cloth).toBeDefined();
    expect(cloth!.rotation.y).toBeCloseTo(expectedAngle, 4);
  });

  it('keeps one flagstick standing whatever the shot', () => {
    // There used to be two pins: a full one for approach shots and a 0.65m stub
    // for putting, which read as a toy beside a full-size ball. Now the same
    // regulation stick stands for every shot.
    const flag = new FlagRenderer();
    const pole = findMesh(flag.getGroup(), (mesh) => mesh.geometry.type === 'CylinderGeometry');
    expect(pole).toBeDefined();

    flag.setPuttingMode(false);
    flag.update(new Vector3(100, 12, 130));
    expect(pole!.visible).toBe(true);

    flag.setPuttingMode(true);
    flag.update(new Vector3(100, 12, 103));
    expect(pole!.visible).toBe(true);
  });

  it('shows the locator ring only from far enough away to need it', () => {
    const flag = new FlagRenderer();
    flag.setPosition(new Vector3(0, 0, 0));
    const ring = findMesh(
      flag.getGroup(),
      (mesh) => mesh.geometry.type === 'RingGeometry' && (mesh.geometry as any).parameters.outerRadius > 0.5
    );
    expect(ring).toBeDefined();

    flag.setPuttingMode(false);
    flag.update(new Vector3(0, 30, 120));
    expect(ring!.visible).toBe(true);

    // Standing beside the pin it is just a smudge on the green.
    flag.update(new Vector3(0, 2, 6));
    expect(ring!.visible).toBe(false);

    flag.setPuttingMode(true);
    flag.update(new Vector3(0, 30, 120));
    expect(ring!.visible).toBe(false);
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

describe('the words on the shot selector fit the control that holds them', () => {
  /**
   * Room for the longest label, in characters.
   *
   * The bottom bar puts three controls across the screen, and on a 320px phone
   * the shape capsule gets about 130 of those pixels — two arrows and the word
   * between them. "STRAIGHT" is eight characters and fills it; a longer label
   * would be cut to "STRAIG...", which is what it did on a phone before the row
   * was rebalanced. A label added later has this budget to live within.
   */
  const LONGEST_LABEL = 8;

  it('keeps every shot shape short enough to print', () => {
    for (const shape of SHOT_SHAPES) {
      expect(shapeProfile(shape).label.length, shape).toBeLessThanOrEqual(LONGEST_LABEL);
    }
  });

  it('keeps every short-game label short enough to print', () => {
    for (const type of ['FULL', 'CHIP', 'PITCH', 'LOB'] as const) {
      expect(shotTypeProfile(type).label.length, type).toBeLessThanOrEqual(LONGEST_LABEL);
    }
  });
});
