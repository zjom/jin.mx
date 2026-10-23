// @ts-check

/**
 * Positions and velocities are in viewport units: relative to the centre
 * and scaled by S = min(W, H), so a resize rescales orbits instead of
 * breaking them.
 *
 * @typedef {{ size: number, trailLen: number, opacity: number, mass: number }} Planet
 *   mass is G·m in viewport units (the centre's is GM)
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ W: number, H: number, dpr: number, cx: number, cy: number, S: number }} View
 * @typedef {{ planet: Planet, pos: Point, vel: Point, trail: readonly Point[] }} Body
 * @typedef {{ mass: number, born: number, pulse: number }} Core
 *   the singularity at the centre: mass is its full G·M, born the sim time
 *   it was created, pulse a 0–1 swell left by its last meal
 * @typedef {{ bodies: readonly Body[], core: Core | null, time: number }} State
 * @typedef {{ spawn: () => void, reset: () => void, collapse: () => void }} Controls
 */

export {};
