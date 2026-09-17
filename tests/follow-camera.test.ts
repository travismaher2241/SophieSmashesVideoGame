import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CameraController } from '../src/camera/CameraController';
import { TerrainData } from '../src/course/TerrainData';
import { TerrainQuery } from '../src/course/TerrainQuery';
import { surfaceDepthBias, surfaceRenderOffset, surfaceStackOrder } from '../src/rendering/SurfaceStacking';

/** A flat 400x400m field, so the only motion in a test is the camera's own. */
function flatTerrain(): { data: TerrainData; query: TerrainQuery } {
  const samples = 201;
  const meta = {
    courseId: 'follow-test',
    holeNumber: 1,
    par: 4,
    status: 'test',
    sourceCRS: 'EPSG:7855',
    gridSpacingMetres: 2.0,
    widthSamples: samples,
    heightSamples: samples,
    minElevationMetres: 20,
    maxElevationMetres: 20,
    sourceBoundsMGA55: { minEasting: 0, minNorthing: 0, maxEasting: 400, maxNorthing: 400 }
  } as never;

  const data = new TerrainData(meta, new Float32Array(samples * samples).fill(20));
  return { data, query: new TerrainQuery(data) };
}

/** A canvas stand-in: the controller only listens for events on it. */
function fakeElement(): HTMLElement {
  return { addEventListener: () => {} } as unknown as HTMLElement;
}

function makeController(): CameraController {
  const { data, query } = flatTerrain();
  return new CameraController(fakeElement(), data, query);
}

/**
 * A drive: struck low across the field, bouncing twice, then rolling out.
 *
 * The bounces are the point. The ball's height changes direction sharply at
 * each one, and the camera must not.
 */
function driveAt(seconds: number): { position: Vector3; velocity: Vector3 } {
  const speed = 45;
  const x = 100 + speed * seconds;
  const z = 100;

  // Three arcs, each shorter than the last, then a roll.
  const arcs = [
    { from: 0, to: 4.2, height: 22 },
    { from: 4.2, to: 5.6, height: 4 },
    { from: 5.6, to: 6.2, height: 1.2 }
  ];
  const arc = arcs.find((entry) => seconds >= entry.from && seconds < entry.to);

  let y = 20;
  let vy = 0;
  if (arc) {
    const t = (seconds - arc.from) / (arc.to - arc.from);
    y = 20 + arc.height * 4 * t * (1 - t);
    vy = (arc.height * 4 * (1 - 2 * t)) / (arc.to - arc.from);
  }

  const rolling = seconds >= 6.2;
  return {
    position: new Vector3(x, y, z),
    velocity: new Vector3(rolling ? Math.max(0.4, speed - (seconds - 6.2) * 12) : speed, vy, 0)
  };
}

/** Run the follow camera over the whole shot and report how it moved. */
function followShot(frameRateHz: number) {
  const controller = makeController();
  const dt = 1 / frameRateHz;
  const start = driveAt(0);

  // The shot begins from the address view, which is where the camera actually
  // is when the ball is struck.
  controller.setMode('GOLF');
  controller.updateGolfAddressView(start.position, 0, false);
  controller.beginBallFollow(start.position, 0);

  const path: Array<{ t: number; position: Vector3; forward: Vector3 }> = [];
  let worstTurnPerSecond = 0;
  let previousForward: Vector3 | null = null;

  for (let frame = 0; frame * dt <= 8; frame++) {
    const t = frame * dt;
    const ball = driveAt(t);
    controller.updateBallFollowView(ball.position, ball.velocity, 0, false, dt);

    const forward = new Vector3();
    controller.camera.getWorldDirection(forward);

    if (previousForward) {
      const degrees = (previousForward.angleTo(forward) * 180) / Math.PI;
      worstTurnPerSecond = Math.max(worstTurnPerSecond, degrees / dt);
    }
    previousForward = forward.clone();
    path.push({ t, position: controller.camera.position.clone(), forward: forward.clone() });
  }

  return { path, worstTurnPerSecond };
}

describe('the camera that follows the ball', () => {
  // The controller measures the window for its lens and listens on it for
  // resizes; neither exists in a test runner.
  beforeEach(() => {
    (globalThis as any).window = { innerWidth: 1280, innerHeight: 720, addEventListener: () => {} };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('turns smoothly all the way through a drive that bounces', () => {
    // The fault this pins: the camera looked straight at the ball, so every
    // bounce snapped its pitch down and back up, and the drive was watched
    // through a camera that shook at each one.
    //
    // Measured past the opening quarter second, which is the ease from the
    // address view onto the ball and is covered by its own test below.
    const run = followShot(60);
    const inFlight = run.path.filter((entry) => entry.t > 0.25);

    let worst = 0;
    for (let i = 1; i < inFlight.length; i++) {
      const degrees = (inFlight[i - 1].forward.angleTo(inFlight[i].forward) * 180) / Math.PI;
      worst = Math.max(worst, degrees * 60);
    }

    expect(worst).toBeLessThan(25);
  });

  it('eases onto the ball at the strike rather than cutting to it', () => {
    // Address and follow are different views — one down the target line, one
    // over the ball — so there is a turn to make when the ball is struck. It
    // should be a move, not a cut: fastest at the start and settled within a
    // couple of tenths.
    const run = followShot(60);
    const turnAt = (index: number) =>
      ((run.path[index - 1].forward.angleTo(run.path[index].forward) * 180) / Math.PI) * 60;

    expect(turnAt(1)).toBeLessThan(140);
    // Decaying, not oscillating.
    expect(turnAt(2)).toBeLessThan(turnAt(1));
    expect(turnAt(3)).toBeLessThan(turnAt(2));

    const settled = run.path.findIndex((entry) => entry.t >= 0.2);
    expect(turnAt(settled)).toBeLessThan(20);
  });

  it('behaves the same at 30, 60 and 144 frames a second', () => {
    // The fault this pins: the smoothing moved a fixed fraction PER FRAME, so
    // the camera lagged further behind on a slow device than a fast one, and a
    // single long frame moved it exactly as far as a short one — which is what
    // a hitch in the frame rate looked like.
    const slow = followShot(30);
    const normal = followShot(60);
    const fast = followShot(144);

    const at = (run: ReturnType<typeof followShot>, seconds: number) =>
      run.path.reduce((best, entry) =>
        Math.abs(entry.t - seconds) < Math.abs(best.t - seconds) ? entry : best
      );

    for (const seconds of [1, 2, 3, 4, 5, 6, 7]) {
      const a = at(normal, seconds).position;
      expect(at(slow, seconds).position.distanceTo(a), `${seconds}s at 30Hz`).toBeLessThan(1.5);
      expect(at(fast, seconds).position.distanceTo(a), `${seconds}s at 144Hz`).toBeLessThan(1.5);
    }
  });

  it('never turns faster on a slow device than a fast one', () => {
    // A long frame used to move the camera the same fraction as a short one,
    // which is a lurch rather than a catch-up.
    expect(followShot(30).worstTurnPerSecond).toBeLessThan(followShot(144).worstTurnPerSecond * 2.2);
  });

  it('keeps the camera above the ground', () => {
    for (const entry of followShot(60).path) {
      expect(entry.position.y, `${entry.t}s`).toBeGreaterThan(20);
    }
  });

  it('holds its line while the ball rolls out', () => {
    // The heading used to swap to the aim line the moment the ball dropped
    // below walking pace, spinning the camera around a ball that was quietly
    // trickling forward.
    const { path } = followShot(60);
    const rolling = path.filter((entry) => entry.t > 6.5);

    for (let i = 1; i < rolling.length; i++) {
      const degrees = (rolling[i - 1].forward.angleTo(rolling[i].forward) * 180) / Math.PI;
      expect(degrees, `${rolling[i].t}s`).toBeLessThan(1.5);
    }
  });

  it('starts behind the ball rather than catching up from the tee', () => {
    const { path } = followShot(60);
    const early = path.find((entry) => entry.t >= 0.5)!;
    const ball = driveAt(0.5).position;

    // Behind it, not beside or in front of it.
    expect(early.position.x).toBeLessThan(ball.x);
    expect(Math.abs(early.position.z - ball.z)).toBeLessThan(3);
  });
});

describe('the surfaces are stacked so they cannot fight', () => {
  it('lifts every sheet above the one below it', () => {
    // The fault this pins: the green and the fringe were both drawn 0.12m up,
    // and the green lies entirely inside the fringe. Two coplanar sheets fight
    // for the depth buffer, and the darker one won in patches — which looked
    // exactly like shadows on the greens, and was still there with the sun
    // switched off.
    const order = surfaceStackOrder();

    for (let i = 1; i < order.length; i++) {
      expect(
        surfaceRenderOffset(order[i]),
        `${order[i]} must sit above ${order[i - 1]}`
      ).toBeGreaterThan(surfaceRenderOffset(order[i - 1]));
    }
  });

  it('puts the green above the fringe, and the fringe above the fairway', () => {
    expect(surfaceRenderOffset('GREEN')).toBeGreaterThan(surfaceRenderOffset('FRINGE'));
    expect(surfaceRenderOffset('FRINGE')).toBeGreaterThan(surfaceRenderOffset('FAIRWAY'));
    expect(surfaceRenderOffset('FAIRWAY')).toBeGreaterThan(surfaceRenderOffset('ROUGH'));
    expect(surfaceRenderOffset('TEE')).toBeGreaterThan(surfaceRenderOffset('FAIRWAY'));
  });

  it('keeps the whole ladder low enough to walk on', () => {
    // These lift the drawn surface off the terrain, and anything resting on one
    // has to clear it. A ladder that climbed by centimetres a rung would have
    // the green standing off the ground it is cut into.
    for (const type of surfaceStackOrder()) {
      expect(surfaceRenderOffset(type), type).toBeLessThan(0.2);
    }
  });

  it('biases the lower sheets away rather than the upper ones forward', () => {
    // The direction matters: the cup, its collar, the break grid and the aiming
    // line are all drawn millimetres above the green. Pulling the green towards
    // the camera to win against the fringe swallowed all of them.
    expect(surfaceDepthBias('GREEN')).toEqual({ factor: 0, units: 0 });
    expect(surfaceDepthBias('ROUGH').units).toBeGreaterThan(0);
    expect(surfaceDepthBias('FRINGE').units).toBeGreaterThan(surfaceDepthBias('GREEN').units);
    expect(surfaceDepthBias('FAIRWAY').units).toBeGreaterThan(surfaceDepthBias('FRINGE').units);
  });
});
