// @ts-check

/** @typedef {import("./types.js").Planet} Planet */

// The original orbit: radius 0.3 at 0.9 rad/s fixes the centre's pull
export const START_RADIUS = 0.3;
export const START_SPEED = 0.9 * START_RADIUS;
export const GM = START_SPEED ** 2 * START_RADIUS;

/** @type {Planet} */
export const PLANET = { size: 3, trailLen: 90, opacity: 1, mass: GM * 0.06 };
export const INK = "#cdcdcd";
export const MAX_DT = 0.05;
export const SUBSTEP = 1 / 240;
// Spawned orbits are launched to stay within min(W, H)
export const LAUNCH_MAX_RADIUS = 0.46;
// Escaped bodies are dropped once this far out
export const ESCAPE_RADIUS = 5;
// Softening keeps close passes from flinging bodies off at huge speeds
export const SOFT_BODY = 0.03;
export const SOFT_CENTRE = 0.01;

// The singularity wakes after CORE_DELAY (while 金 collapses), then over
// CORE_RAMP its pull rises to CORE_MASS × the old centre's
export const CORE_MASS = GM * 3;
export const CORE_DELAY = 1.5;
export const CORE_RAMP = 2.5;
// Mass gained per swallowed body, per PLANET.mass of the body
export const MEAL = GM * 1.2;
// Drawn radius per √(mass / GM); bodies inside CAPTURE × that are swallowed
export const CORE_SIZE = 0.003;
export const CAPTURE = 2;
// Gentle drag, rising with the core's mass and nearness to it, so orbits
// spiral in one by one rather than together
export const DRAG = 0.005;
export const DRAG_NEAR = 0.05;
export const PULSE_DECAY = 4;

// Trails are stroked in this many alpha bands, one path each, rather than
// one path per segment
export const TRAIL_BANDS = 24;
