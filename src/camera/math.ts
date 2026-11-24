export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : Math.min(value, max);
}

/** Wraps an angle into (−π, π]. */
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
