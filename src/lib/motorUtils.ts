/*
 * Utility functions for motor control calculations
 */

// Assuming 30000 pulses = 180 degrees → pulses per degree
export const PULSES_PER_DEGREE = (2 * 30000) / 180; // ~333.33? (from simplectl formula)

export function angleToPulses(angle: number): number {
  const clamped = Math.max(-180, Math.min(180, angle));
  return Math.round(clamped * PULSES_PER_DEGREE);
}

export function pulsesToAngle(pulses: number): number {
  return pulses / PULSES_PER_DEGREE;
}
