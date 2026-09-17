import { SurfacePolygon, SurfaceType } from '../course/SurfaceQuery';

export interface MapPoint {
  x: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface HoleMapInput {
  surfaces: readonly SurfacePolygon[];
  tee: MapPoint;
  pin: MapPoint;
  /** The corner of a dogleg, where the hole bends. */
  drivingLine?: MapPoint | null;
  trees?: readonly MapPoint[];
  width: number;
  height: number;
  /** Blank edge kept around the drawing, in pixels. */
  padding?: number;
}

export interface HoleMapView {
  project(point: MapPoint): ScreenPoint;
  /** Screen pixels per metre. One number: the map never stretches an axis. */
  pixelsPerMetre: number;
  width: number;
  height: number;
  /**
   * How wide the hole is against how long it is.
   *
   * A hole is a long thin thing, so a square canvas spends most of itself on
   * blank margin. Callers that can resize their canvas use this to fit it to
   * the hole instead.
   */
  contentAspect: number;
}

/**
 * Colours the map draws each surface in.
 *
 * Deliberately the game's own turf palette rather than a second set invented
 * for the map: a player reading the map is looking for the fairway they are
 * about to stand on, and a map whose fairway is a different green from the
 * course's is a map of somewhere else.
 */
const SURFACE_FILL: Partial<Record<SurfaceType, string>> = {
  ROUGH: '#3a7632',
  GENERAL_AREA: '#3a7632',
  DEEP_ROUGH: '#2f6425',
  FIRST_CUT: '#478c33',
  FAIRWAY: '#6ec44e',
  TEE: '#5aa83f',
  FRINGE: '#78dc56',
  GREEN: '#8bf264',
  BUNKER: '#f3dc9a',
  WATER: '#3582ba',
  PATH: '#a69e8c',
  OUT_OF_BOUNDS: '#aa4444',
  GROUND_UNDER_REPAIR: '#887755'
};

/** Painting order, widest first, so a green is not buried under its own rough. */
const DRAW_ORDER: readonly SurfaceType[] = [
  'ROUGH',
  'GENERAL_AREA',
  'DEEP_ROUGH',
  'OUT_OF_BOUNDS',
  'FIRST_CUT',
  'FAIRWAY',
  'PATH',
  'WATER',
  'BUNKER',
  'TEE',
  'GROUND_UNDER_REPAIR',
  'FRINGE',
  'GREEN'
];

/**
 * A top-down view of the hole with the tee at the bottom and the pin at the top.
 *
 * Everything is measured along and across the tee-to-pin line rather than in
 * world x and z, because north means nothing to a golfer: the hole runs up the
 * screen whichever way it happens to lie on the heightfield. Across is signed
 * the way the player sees it, so a bunker drawn left of the fairway on the map
 * is left of the fairway when they are standing on the tee.
 */
export function buildHoleMapView(input: HoleMapInput): HoleMapView {
  const padding = input.padding ?? 12;
  const forward = direction(input.tee, input.pin);

  const local = (point: MapPoint) => {
    const dx = point.x - input.tee.x;
    const dz = point.z - input.tee.z;
    return {
      along: dx * forward.x + dz * forward.z,
      // Left of the line is +x when the hole runs up +z, which is the game's
      // own convention: aiming left lowers the aim angle.
      left: dx * forward.z - dz * forward.x
    };
  };

  const alongs: number[] = [];
  const lefts: number[] = [];
  for (const surface of input.surfaces) {
    for (const point of surface.points) {
      const { along, left } = local(point);
      alongs.push(along);
      lefts.push(left);
    }
  }
  for (const point of [input.tee, input.pin, ...(input.trees ?? [])]) {
    const { along, left } = local(point);
    alongs.push(along);
    lefts.push(left);
  }

  // A hole with no geometry at all still has to return a usable view rather
  // than divide by an empty bounding box.
  const minAlong = alongs.length ? Math.min(...alongs) : 0;
  const maxAlong = alongs.length ? Math.max(...alongs) : 1;
  const minLeft = lefts.length ? Math.min(...lefts) : 0;
  const maxLeft = lefts.length ? Math.max(...lefts) : 1;

  const usableWidth = Math.max(1, input.width - padding * 2);
  const usableHeight = Math.max(1, input.height - padding * 2);
  const spanAcross = Math.max(1, maxLeft - minLeft);
  const spanAlong = Math.max(1, maxAlong - minAlong);
  const pixelsPerMetre = Math.min(usableWidth / spanAcross, usableHeight / spanAlong);

  // Centre whatever is left over, so a narrow hole does not hug one edge.
  const drawnWidth = spanAcross * pixelsPerMetre;
  const drawnHeight = spanAlong * pixelsPerMetre;
  const offsetX = padding + (usableWidth - drawnWidth) / 2;
  const offsetY = padding + (usableHeight - drawnHeight) / 2;

  return {
    pixelsPerMetre,
    width: input.width,
    height: input.height,
    contentAspect: spanAcross / spanAlong,
    project(point: MapPoint): ScreenPoint {
      const { along, left } = local(point);
      return {
        // Screen x grows right, so the player's left is the smaller number.
        x: offsetX + (maxLeft - left) * pixelsPerMetre,
        // Screen y grows down, so the far end of the hole is the smaller one.
        y: offsetY + (maxAlong - along) * pixelsPerMetre
      };
    }
  };
}

/** Draw the hole onto a 2D context, and hand back the projection used. */
export function drawHoleMap(ctx: CanvasRenderingContext2D, input: HoleMapInput): HoleMapView {
  const view = buildHoleMapView(input);

  ctx.clearRect(0, 0, input.width, input.height);
  ctx.fillStyle = '#16321c';
  ctx.fillRect(0, 0, input.width, input.height);

  for (const type of DRAW_ORDER) {
    for (const surface of input.surfaces) {
      if (surface.type !== type) continue;
      fillPolygon(ctx, view, surface.points, SURFACE_FILL[type] ?? '#3a7632');
    }
  }

  for (const tree of input.trees ?? []) {
    const at = view.project(tree);
    ctx.fillStyle = 'rgba(20, 58, 26, 0.85)';
    ctx.beginPath();
    ctx.arc(at.x, at.y, Math.max(1.2, view.pixelsPerMetre * 2.2), 0, Math.PI * 2);
    ctx.fill();
  }

  // The line the hole is played on: tee to corner to pin on a dogleg, tee to
  // pin on a straight one. This is the thing the map is for.
  const line = [input.tee, ...(input.drivingLine ? [input.drivingLine] : []), input.pin].map((point) =>
    view.project(point)
  );

  ctx.strokeStyle = 'rgba(255, 246, 160, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(line[0].x, line[0].y);
  for (const point of line.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const tee = view.project(input.tee);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tee.x - 3, tee.y - 3, 6, 6);

  const pin = view.project(input.pin);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y + 3);
  ctx.lineTo(pin.x, pin.y - 9);
  ctx.stroke();
  ctx.fillStyle = '#ff5544';
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y - 9);
  ctx.lineTo(pin.x + 7, pin.y - 6.5);
  ctx.lineTo(pin.x, pin.y - 4);
  ctx.closePath();
  ctx.fill();

  return view;
}

/**
 * Distance markers down the playing line, for planning a tee shot.
 *
 * Measured from the tee along the line the hole is played, not straight to the
 * pin, so the 200 on a dogleg is 200 to the corner.
 */
export function distanceMarkers(
  tee: MapPoint,
  drivingLine: MapPoint | null | undefined,
  pin: MapPoint,
  everyMetres = 100
): Array<{ metres: number; at: MapPoint }> {
  const waypoints = [tee, ...(drivingLine ? [drivingLine] : []), pin];
  const total = pathLength(waypoints);
  const markers: Array<{ metres: number; at: MapPoint }> = [];

  for (let metres = everyMetres; metres < total - everyMetres * 0.35; metres += everyMetres) {
    markers.push({ metres, at: pointAlong(waypoints, metres) });
  }

  return markers;
}

function pathLength(waypoints: readonly MapPoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
  }
  return total;
}

function pointAlong(waypoints: readonly MapPoint[], distance: number): MapPoint {
  let remaining = distance;

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

function direction(from: MapPoint, to: MapPoint): MapPoint {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  // A tee on top of its own pin has no direction; up the z axis will do, and
  // nothing sane draws that map anyway.
  return length < 1e-6 ? { x: 0, z: 1 } : { x: dx / length, z: dz / length };
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  view: HoleMapView,
  points: readonly MapPoint[],
  fill: string
): void {
  if (points.length < 3) return;

  ctx.fillStyle = fill;
  ctx.beginPath();
  const first = view.project(points[0]);
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    const at = view.project(point);
    ctx.lineTo(at.x, at.y);
  }
  ctx.closePath();
  ctx.fill();
}
