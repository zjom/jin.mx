// @ts-check

import { CORE_MASS, INK, MAX_DT, PLANET, START_RADIUS, START_SPEED } from "./config.js";
import { centreMass, launch, newCore, randomBody, step } from "./physics.js";
import { render } from "./render.js";
import { applyView, measure, sameView } from "./view.js";

/**
 * @typedef {import("./types.js").Body} Body
 * @typedef {import("./types.js").State} State
 * @typedef {import("./types.js").Controls} Controls
 */

/**
 * @param {Body} initial
 * @returns {State}
 */
const fresh = (initial) => ({ bodies: [initial], core: null, time: 0 });

// Each frame re-measures the viewport and resizes the canvas on a change,
// in place of a resize listener. Requests made through the controls are
// applied at the start of the next frame: a reset swaps everything for a
// fresh copy of the initial body, then a collapse births the singularity,
// then spawned bodies join.
/**
 * @param {Window} win
 * @param {HTMLCanvasElement} canvas
 * @returns {Controls} spawn a random body; reset back to the single initial
 *   body; collapse the centre into a singularity
 */
export const initOrbiter = (win, canvas) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const initial = launch(PLANET, START_RADIUS, 0, START_SPEED);
  let spawns = 0;
  let resetting = false;
  let collapsing = false;

  let view = measure(win);
  applyView(canvas, ctx, view);
  let state = fresh(initial);
  let last = win.performance.now();

  /** @type {FrameRequestCallback} */
  const tick = (now) => {
    const current = measure(win);
    if (!sameView(view, current)) applyView(canvas, ctx, current);
    view = current;

    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const base = resetting ? fresh(initial) : state;
    const core = collapsing && !base.core ? newCore(CORE_MASS, base.time) : base.core;
    const gm = centreMass({ core, time: base.time });
    const joined = [...base.bodies];
    for (; spawns > 0; spawns--) joined.push(randomBody(Math.random, gm));
    resetting = false;
    collapsing = false;

    state = step({ ...base, core, bodies: joined }, dt);
    render(ctx, view, state, INK);
    win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);

  return {
    spawn: () => {
      spawns++;
    },
    reset: () => {
      spawns = 0;
      collapsing = false;
      resetting = true;
    },
    collapse: () => {
      collapsing = true;
    },
  };
};
