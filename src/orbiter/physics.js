// @ts-check

import {
  CAPTURE,
  CORE_DELAY,
  CORE_RAMP,
  CORE_SIZE,
  DRAG,
  DRAG_NEAR,
  ESCAPE_RADIUS,
  GM,
  LAUNCH_MAX_RADIUS,
  MEAL,
  PLANET,
  PULSE_DECAY,
  SOFT_BODY,
  SOFT_CENTRE,
  START_RADIUS,
  SUBSTEP,
} from "./config.js";

/**
 * @typedef {import("./types.js").Planet} Planet
 * @typedef {import("./types.js").Point} Point
 * @typedef {import("./types.js").Body} Body
 * @typedef {import("./types.js").Core} Core
 * @typedef {import("./types.js").State} State
 * @typedef {{ planet: Planet, pos: Point, vel: Point, trail: readonly Point[] }} Live
 *   a body being stepped, whose pos and vel are mutated in place
 * @typedef {{ bodies: Live[], core: Core | null, time: number }} Sim
 */

/**
 * @param {number} lo
 * @param {number} hi
 * @param {() => number} rand
 * @returns {number}
 */
const between = (lo, hi, rand) => lo + (hi - lo) * rand();

/**
 * @param {Planet} planet
 * @param {number} r launch distance from the centre
 * @param {number} angle launch direction from the centre
 * @param {number} speed tangential speed; negative orbits anticlockwise
 * @returns {Body}
 */
export const launch = (planet, r, angle, speed) => ({
  planet,
  pos: { x: r * Math.cos(angle), y: r * Math.sin(angle) },
  vel: { x: -speed * Math.sin(angle), y: speed * Math.cos(angle) },
  trail: [],
});

// A fainter, lighter sibling of PLANET on a random elliptical orbit. A
// tangential launch at k × circular speed has its far apsis at
// r·k²/(2−k²), so k is capped to keep that inside LAUNCH_MAX_RADIUS.
/**
 * @param {() => number} rand uniform in [0, 1)
 * @param {number} gm the centre's current pull
 * @returns {Body}
 */
export const randomBody = (rand, gm) => {
  const size = between(1.5, 3, rand);
  const planet = {
    size,
    trailLen: Math.round(between(50, 130, rand)),
    opacity: between(0.25, 0.75, rand),
    mass: PLANET.mass * (size / PLANET.size) ** 2,
  };
  const r = between(0.12, LAUNCH_MAX_RADIUS, rand);
  const kMax = Math.min(1.12, Math.sqrt((2 * LAUNCH_MAX_RADIUS) / (r + LAUNCH_MAX_RADIUS)));
  const k = between(0.85, kMax, rand);
  const dir = rand() < 0.5 ? -1 : 1;
  return launch(planet, r, between(0, Math.PI * 2, rand), dir * k * Math.sqrt(gm / r));
};

/**
 * @param {number} x
 * @returns {number}
 */
const smoothstep = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

// How far the singularity has woken, 0–1
/**
 * @param {Core} core
 * @param {number} time
 * @returns {number}
 */
export const awake = (core, time) => smoothstep((time - core.born - CORE_DELAY) / CORE_RAMP);

/**
 * @param {{ core: Core | null, time: number }} state
 * @returns {number}
 */
export const centreMass = ({ core, time }) =>
  core ? GM + (core.mass - GM) * awake(core, time) : GM;

// Radius in viewport units, swelling briefly after each meal
/**
 * @param {Core} core
 * @param {number} time
 * @returns {number}
 */
export const coreRadius = (core, time) =>
  CORE_SIZE * Math.sqrt(core.mass / GM) * awake(core, time) * (1 + 0.4 * core.pulse);

/**
 * @param {number} mass
 * @param {number} time
 * @returns {Core}
 */
export const newCore = (mass, time) => ({ mass, born: time, pulse: 0 });

// Gravity from the fixed centre plus every other body, written into ax/ay.
// Softening is shared, so each pair is visited once and pulls both ways.
/**
 * @param {readonly Live[]} bodies
 * @param {number} gm the centre's pull
 * @param {Float64Array} ax
 * @param {Float64Array} ay
 * @returns {void}
 */
const accelerate = (bodies, gm, ax, ay) => {
  const n = bodies.length;
  const soft2 = SOFT_CENTRE * SOFT_CENTRE;
  for (let i = 0; i < n; i++) {
    const { x, y } = bodies[i].pos;
    const d2 = x * x + y * y + soft2;
    const f = gm / (d2 * Math.sqrt(d2));
    ax[i] = -x * f;
    ay[i] = -y * f;
  }
  const bodySoft2 = SOFT_BODY * SOFT_BODY;
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dy * dy + bodySoft2;
      const f = 1 / (d2 * Math.sqrt(d2));
      ax[i] += dx * f * b.planet.mass;
      ay[i] += dy * f * b.planet.mass;
      ax[j] -= dx * f * a.planet.mass;
      ay[j] -= dy * f * a.planet.mass;
    }
  }
};

// Far out and unbound from the centre: it is not coming back
/**
 * @param {Body} body
 * @param {number} gm the centre's pull
 * @returns {boolean}
 */
const escaped = ({ pos, vel }, gm) => {
  const r = Math.hypot(pos.x, pos.y);
  return r > ESCAPE_RADIUS && (vel.x ** 2 + vel.y ** 2) / 2 > gm / r;
};

// Bodies inside the capture radius feed the core
/**
 * @param {Sim} sim
 * @returns {void}
 */
const feed = (sim) => {
  const { core, time } = sim;
  if (!core || awake(core, time) === 0) return;
  const reach = CAPTURE * coreRadius(core, time);
  let gained = 0;
  sim.bodies = sim.bodies.filter((b) => {
    if (Math.hypot(b.pos.x, b.pos.y) >= reach) return true;
    gained += MEAL * (b.planet.mass / PLANET.mass);
    return false;
  });
  if (gained === 0) return;
  core.mass += gained;
  core.pulse = 1;
};

// One semi-implicit Euler step, in place
/**
 * @param {Sim} sim
 * @param {number} h
 * @param {Float64Array} ax scratch, at least as long as sim.bodies
 * @param {Float64Array} ay
 * @returns {void}
 */
const advance = (sim, h, ax, ay) => {
  const { bodies, core } = sim;
  accelerate(bodies, centreMass(sim), ax, ay);
  sim.time += h;
  const drag = core ? DRAG * Math.sqrt(core.mass / GM) * awake(core, sim.time) : 0;
  for (let i = 0; i < bodies.length; i++) {
    const { pos, vel } = bodies[i];
    const near = START_RADIUS / Math.max(Math.hypot(pos.x, pos.y), DRAG_NEAR);
    const keep = Math.exp(-drag * near * h);
    vel.x = (vel.x + ax[i] * h) * keep;
    vel.y = (vel.y + ay[i] * h) * keep;
    pos.x += vel.x * h;
    pos.y += vel.y * h;
  }
  if (core) core.pulse *= Math.exp(-PULSE_DECAY * h);
  feed(sim);
};

// Advances a copy of the state by dt in fixed substeps; the input is left
// untouched, so trails can keep sharing earlier positions
/**
 * @param {State} state
 * @param {number} dt seconds since the previous frame
 * @returns {State}
 */
export const step = (state, dt) => {
  const n = Math.max(1, Math.ceil(dt / SUBSTEP));
  /** @type {Sim} */
  const sim = {
    bodies: state.bodies.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } })),
    core: state.core && { ...state.core },
    time: state.time,
  };
  const ax = new Float64Array(sim.bodies.length);
  const ay = new Float64Array(sim.bodies.length);
  for (let i = 0; i < n; i++) advance(sim, dt / n, ax, ay);

  const gm = centreMass(sim);
  return {
    core: sim.core,
    time: sim.time,
    bodies: sim.bodies
      .filter((body) => !escaped(body, gm))
      .map((body) => ({
        ...body,
        trail: [
          ...body.trail.slice(Math.max(0, body.trail.length + 1 - body.planet.trailLen)),
          body.pos,
        ],
      })),
  };
};
