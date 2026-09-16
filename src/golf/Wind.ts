/**
 * The wind.
 *
 * It used to be a caption: the HUD read "WIND 4 m/s ↗" on every shot of every
 * hole, and nothing downstream had ever heard of it. Now it is a real vector the
 * ball flies through, and the readout describes the wind the shot will actually
 * meet.
 *
 * `directionRadians` is where the wind is blowing TO, in the same world XZ frame
 * as an aim angle, so a shot aimed straight into it has an aim angle half a turn
 * away. Meteorologists name a wind for where it comes from; this is a velocity,
 * and naming it for its heading keeps it from being negated by accident on the
 * way into the physics.
 */
export interface Wind {
  /** Wind speed in metres per second. */
  speedMetresPerSecond: number;
  /** Heading the air is travelling along, in radians in world XZ. */
  directionRadians: number;
}

export const CALM: Wind = { speedMetresPerSecond: 0, directionRadians: 0 };

/**
 * The range a hole's wind is drawn from.
 *
 * A gentle breeze to a solid two-club wind. Nothing here is a gale: a wind
 * strong enough to make the hole unplayable is not interesting, it is just a
 * hole you cannot play.
 */
const MIN_SPEED = 1.0;
const MAX_SPEED = 7.0;

/** The wind for a hole, drawn from the given source of randomness. */
export function randomWind(random: () => number = Math.random): Wind {
  // Weighted towards the middle of the range rather than flat, so most holes
  // play in a breeze and the still and the howling ones are the exception.
  const roll = (random() + random()) / 2;

  return {
    speedMetresPerSecond: MIN_SPEED + roll * (MAX_SPEED - MIN_SPEED),
    directionRadians: random() * Math.PI * 2
  };
}

/** The wind as a velocity in world space, which is what the flight model wants. */
export function windVector(wind: Wind): { x: number; z: number } {
  return {
    x: Math.cos(wind.directionRadians) * wind.speedMetresPerSecond,
    z: Math.sin(wind.directionRadians) * wind.speedMetresPerSecond
  };
}

export interface WindReading {
  /** Speed in m/s, rounded for display. */
  speed: number;
  /** Along the shot: positive helps, negative holds it up. */
  helping: number;
  /** Across the shot: positive pushes the ball right of the aim line. */
  crossing: number;
  /** HEAD, TAIL, or a cross wind with the side it pushes towards. */
  label: string;
  /** Arrow pointing the way the wind blows, with the shot going up the screen. */
  arrow: string;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

/**
 * What the wind is doing to the shot in front of you.
 *
 * Read relative to the aim rather than to the compass: a player lining up a shot
 * wants to know whether it is into their face and which way it will push the
 * ball, not which way is north.
 */
export function readWindForAim(wind: Wind, aimAngleRadians: number): WindReading {
  const speed = wind.speedMetresPerSecond;
  const relative = wind.directionRadians - aimAngleRadians;

  // Down the aim line, and across it. Positive cross is to the player's right,
  // matching the sign convention the shot shapes use.
  const helping = Math.cos(relative) * speed;
  const crossing = Math.sin(relative) * speed;

  // The arrow already says which way it blows, so the words say what it does to
  // the shot. Spelling out "→ L→R" beside the arrow was saying it twice.
  let label: string;
  if (Math.abs(helping) >= Math.abs(crossing) * 2) {
    label = helping > 0 ? 'TAIL' : 'HEAD';
  } else if (Math.abs(crossing) >= Math.abs(helping) * 2) {
    label = 'CROSS';
  } else {
    label = helping > 0 ? 'TAIL/CROSS' : 'HEAD/CROSS';
  }

  // The shot plays up the screen: a tail wind's arrow points up, and a wind
  // crossing to the player's right points right.
  const screenAngle = Math.atan2(helping, crossing);
  const index = (Math.round((Math.PI / 2 - screenAngle) / (Math.PI / 4)) + 8) % 8;

  return {
    speed: Math.round(speed * 10) / 10,
    helping,
    crossing,
    label,
    arrow: ARROWS[index]
  };
}

/** The one-line readout for the HUD. */
export function describeWind(wind: Wind, aimAngleRadians: number): string {
  if (wind.speedMetresPerSecond < 0.5) return 'CALM';

  const reading = readWindForAim(wind, aimAngleRadians);
  return `${reading.speed.toFixed(1)} m/s ${reading.arrow} ${reading.label}`;
}
