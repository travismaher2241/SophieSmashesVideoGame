export interface FlybyPoint {
  x: number;
  z: number;
}

export interface FlybyFrame {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface FlybyRoute {
  tee: FlybyPoint;
  pin: FlybyPoint;
  /** The corner of a dogleg, so the flight follows the hole rather than cuts it. */
  drivingLine?: FlybyPoint | null;
}

/** Height of the ground in metres, as the renderer draws it. */
export type HeightAt = (x: number, z: number) => number;

/**
 * The camera move that shows a hole before it is played.
 *
 * It flies the playing line from behind the tee to over the green, looking
 * ahead of itself the whole way, and drops as it goes: high enough at the start
 * to take in where the tee shot has to finish, low enough at the end to show
 * what is guarding the green. The point is to answer "what am I playing?"
 * before the player has to guess it from a camera two metres off the ground.
 */
export class HoleFlyby {
  /** How long the whole move takes, in seconds. */
  public static readonly DURATION_SECONDS = 5.5;

  private static readonly START_HEIGHT = 34;
  private static readonly END_HEIGHT = 17;
  /** How far behind the tee the camera starts, in metres. */
  private static readonly RUN_UP = 42;
  /** How far ahead of itself the camera looks, in metres. */
  private static readonly LOOK_AHEAD = 78;

  private waypoints: FlybyPoint[] = [];
  private totalLength = 0;
  private elapsed = 0;

  constructor(private heightAt: HeightAt) {}

  public setHeightAt(heightAt: HeightAt): void {
    this.heightAt = heightAt;
  }

  /**
   * Line the flight up on a hole.
   *
   * The run-up behind the tee is part of the route rather than a separate
   * opening shot, so the move has no seam in it: the camera is already flying
   * when it passes over the tee.
   */
  public begin(route: FlybyRoute): void {
    const corner = route.drivingLine ?? route.pin;
    const heading = direction(route.tee, corner);
    const start = {
      x: route.tee.x - heading.x * HoleFlyby.RUN_UP,
      z: route.tee.z - heading.z * HoleFlyby.RUN_UP
    };

    this.waypoints = [start, route.tee, ...(route.drivingLine ? [route.drivingLine] : []), route.pin];
    this.totalLength = pathLength(this.waypoints);
    this.elapsed = 0;
  }

  /** Advance the flight. Returns false once it has landed on the green. */
  public update(deltaSeconds: number): boolean {
    if (this.isFinished()) return false;

    this.elapsed = Math.min(HoleFlyby.DURATION_SECONDS, this.elapsed + Math.max(0, deltaSeconds));
    return !this.isFinished();
  }

  public isFinished(): boolean {
    return this.elapsed >= HoleFlyby.DURATION_SECONDS;
  }

  /** How far through the move it is, 0 to 1. */
  public progress(): number {
    return this.elapsed / HoleFlyby.DURATION_SECONDS;
  }

  public frame(): FlybyFrame {
    // Eased at both ends: a flyby that starts and stops at full speed reads as a
    // jump cut rather than a camera move.
    const travelled = smoothstep(this.progress()) * this.totalLength;
    const at = pointAlong(this.waypoints, travelled);
    const ahead = pointAlong(this.waypoints, Math.min(this.totalLength, travelled + HoleFlyby.LOOK_AHEAD));

    const drop = HoleFlyby.START_HEIGHT + (HoleFlyby.END_HEIGHT - HoleFlyby.START_HEIGHT) * this.progress();

    return {
      position: { x: at.x, y: this.heightAt(at.x, at.z) + drop, z: at.z },
      target: { x: ahead.x, y: this.heightAt(ahead.x, ahead.z) + 1.5, z: ahead.z }
    };
  }
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function direction(from: FlybyPoint, to: FlybyPoint): FlybyPoint {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length < 1e-6 ? { x: 0, z: 1 } : { x: dx / length, z: dz / length };
}

function pathLength(waypoints: readonly FlybyPoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
  }
  return total;
}

function pointAlong(waypoints: readonly FlybyPoint[], distance: number): FlybyPoint {
  if (waypoints.length === 0) return { x: 0, z: 0 };

  let remaining = Math.max(0, distance);

  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const segment = Math.hypot(b.x - a.x, b.z - a.z);

    if (remaining <= segment || i === waypoints.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= segment;
  }

  return waypoints[waypoints.length - 1];
}
