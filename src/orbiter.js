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
 * @typedef {{ from: Point, to: Point, alpha: number }} Segment
 * @typedef {{
 *   win: Window,
 *   canvas: HTMLCanvasElement,
 *   ctx: CanvasRenderingContext2D,
 *   ink: string,
 *   pending: ((gm: number) => Body)[],
 *   initial: Body,
 *   reset: boolean,
 *   collapse: boolean,
 * }} Env
 * @typedef {{ reset: () => void, collapse: () => void }} Controls
 */

// The original orbit: radius 0.3 at 0.9 rad/s fixes the centre's pull
const START_RADIUS = 0.3;
const START_SPEED = 0.9 * START_RADIUS;
const GM = START_SPEED ** 2 * START_RADIUS;

/** @type {Planet} */
const PLANET = { size: 3, trailLen: 90, opacity: 1, mass: GM * 0.06 };
const INK = "#cdcdcd";
const MAX_DT = 0.05;
const SUBSTEP = 1 / 240;
// Spawned orbits are launched to stay within min(W, H)
const LAUNCH_MAX_RADIUS = 0.46;
// Escaped bodies are dropped once this far out
const ESCAPE_RADIUS = 5;
// Softening keeps close passes from flinging bodies off at huge speeds
const SOFT_BODY = 0.03;
const SOFT_CENTRE = 0.01;

// The singularity wakes after CORE_DELAY (while 金 collapses), then over
// CORE_RAMP its pull rises to CORE_MASS × the old centre's
const CORE_MASS = GM * 3;
const CORE_DELAY = 1.5;
const CORE_RAMP = 2.5;
// Mass gained per swallowed body, per PLANET.mass of the body
const MEAL = GM * 1.2;
// Drawn radius per √(mass / GM); bodies inside CAPTURE × that are swallowed
const CORE_SIZE = 0.003;
const CAPTURE = 2;
// Gentle drag, rising with the core's mass and nearness to it, so orbits
// spiral in one by one rather than together
const DRAG = 0.005;
const DRAG_NEAR = 0.05;
const PULSE_DECAY = 4;

// Viewport geometry derived from the window
/**
 * @param {Window} win
 * @returns {View}
 */
const measure = (win) => {
  const W = win.innerWidth;
  const H = win.innerHeight;
  return {
    W,
    H,
    dpr: win.devicePixelRatio || 1,
    cx: W / 2,
    cy: H / 2,
    S: Math.min(W, H),
  };
};

/**
 * @param {View} a
 * @param {View} b
 * @returns {boolean}
 */
const sameView = (a, b) => a.W === b.W && a.H === b.H && a.dpr === b.dpr;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @returns {void}
 */
const applyView = (canvas, ctx, view) => {
  canvas.width = view.W * view.dpr;
  canvas.height = view.H * view.dpr;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
};

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
const launch = (planet, r, angle, speed) => ({
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
const randomBody = (rand, gm) => {
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
 * @param {Point} from
 * @param {Point} to
 * @param {number} gm
 * @param {number} soft
 * @returns {Point}
 */
const pull = (from, to, gm, soft) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const f = gm / (dx * dx + dy * dy + soft * soft) ** 1.5;
  return { x: dx * f, y: dy * f };
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
const awake = (core, time) => smoothstep((time - core.born - CORE_DELAY) / CORE_RAMP);

/**
 * @param {State} state
 * @returns {number}
 */
const centreMass = ({ core, time }) =>
  core ? GM + (core.mass - GM) * awake(core, time) : GM;

// Radius in viewport units, swelling briefly after each meal
/**
 * @param {Core} core
 * @param {number} time
 * @returns {number}
 */
const coreRadius = (core, time) =>
  CORE_SIZE * Math.sqrt(core.mass / GM) * awake(core, time) * (1 + 0.4 * core.pulse);

// Gravity from the fixed centre plus every other body
/**
 * @param {readonly Body[]} bodies
 * @param {number} gm the centre's pull
 * @returns {Point[]}
 */
const accelerations = (bodies, gm) =>
  bodies.map((body, i) =>
    bodies.reduce(
      (acc, other, j) => {
        if (i === j) return acc;
        const p = pull(body.pos, other.pos, other.planet.mass, SOFT_BODY);
        return { x: acc.x + p.x, y: acc.y + p.y };
      },
      pull(body.pos, { x: 0, y: 0 }, gm, SOFT_CENTRE),
    ),
  );

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
 * @param {State} state
 * @returns {State}
 */
const feed = (state) => {
  const { core, time, bodies } = state;
  if (!core || awake(core, time) === 0) return state;
  const reach = CAPTURE * coreRadius(core, time);
  const caught = bodies.filter(({ pos }) => Math.hypot(pos.x, pos.y) < reach);
  if (caught.length === 0) return state;
  const gained = caught.reduce((m, b) => m + MEAL * (b.planet.mass / PLANET.mass), 0);
  return {
    time,
    bodies: bodies.filter((b) => !caught.includes(b)),
    core: { ...core, mass: core.mass + gained, pulse: 1 },
  };
};

// One semi-implicit Euler step
/**
 * @param {State} state
 * @param {number} h
 * @returns {State}
 */
const integrate = (state, h) => {
  const gm = centreMass(state);
  const acc = accelerations(state.bodies, gm);
  const { core } = state;
  const time = state.time + h;
  const drag = core ? DRAG * Math.sqrt(core.mass / GM) * awake(core, time) : 0;
  const bodies = state.bodies.map((body, i) => {
    const near = START_RADIUS / Math.max(Math.hypot(body.pos.x, body.pos.y), DRAG_NEAR);
    const keep = Math.exp(-drag * near * h);
    const vel = {
      x: (body.vel.x + acc[i].x * h) * keep,
      y: (body.vel.y + acc[i].y * h) * keep,
    };
    const pos = { x: body.pos.x + vel.x * h, y: body.pos.y + vel.y * h };
    return { ...body, pos, vel };
  });
  const settled = core && { ...core, pulse: core.pulse * Math.exp(-PULSE_DECAY * h) };
  return feed({ bodies, core: settled, time });
};

/**
 * @param {State} state
 * @param {number} dt seconds since the previous frame
 * @returns {State}
 */
const step = (state, dt) => {
  const n = Math.max(1, Math.ceil(dt / SUBSTEP));
  const moved = Array.from({ length: n }).reduce(
    /** @param {State} st */ (st) => integrate(st, dt / n),
    state,
  );
  const gm = centreMass(moved);
  return {
    ...moved,
    bodies: moved.bodies
      .filter((body) => !escaped(body, gm))
      .map((body) => ({
        ...body,
        trail: [...body.trail, body.pos].slice(-body.planet.trailLen),
      })),
  };
};

/**
 * @param {View} view
 * @param {Point} p
 * @returns {Point}
 */
const toScreen = (view, p) => ({ x: view.cx + p.x * view.S, y: view.cy + p.y * view.S });

// Trail: thin line fading toward its tail
/**
 * @param {readonly Point[]} trail
 * @returns {Segment[]}
 */
const trailSegments = (trail) =>
  trail.slice(1).map((to, i) => ({
    from: trail[i],
    to,
    alpha: ((i + 1) / trail.length) ** 2,
  }));

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {readonly Point[]} trail in screen pixels
 * @param {string} ink
 * @param {number} opacity
 * @returns {void}
 */
const drawTrail = (ctx, trail, ink, opacity) => {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  trailSegments(trail).forEach(({ from, to, alpha }) => {
    ctx.globalAlpha = alpha * opacity;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point} pos in screen pixels
 * @param {number} size
 * @param {string} ink
 * @param {number} opacity
 * @returns {void}
 */
const drawPlanet = (ctx, pos, size, ink, opacity) => {
  ctx.fillStyle = ink;
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
};

// A glowing point, drawn over the bodies it is about to swallow
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {Core} core
 * @param {number} time
 * @param {string} ink
 * @returns {void}
 */
const drawCore = (ctx, view, core, time, ink) => {
  const r = coreRadius(core, time) * view.S;
  if (r <= 0) return;
  ctx.fillStyle = ink;
  ctx.shadowColor = ink;
  ctx.shadowBlur = 4 + r * 2;
  ctx.globalAlpha = awake(core, time);
  ctx.beginPath();
  ctx.arc(view.cx, view.cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {State} state every body must have a non-empty trail
 * @param {string} ink
 * @returns {void}
 */
const render = (ctx, view, { bodies, core, time }, ink) => {
  ctx.clearRect(0, 0, view.W, view.H);
  bodies.forEach(({ planet, trail }) => {
    const screen = trail.map((p) => toScreen(view, p));
    drawTrail(ctx, screen, ink, planet.opacity);
    drawPlanet(ctx, screen[screen.length - 1], planet.size, ink, planet.opacity);
  });
  if (core) drawCore(ctx, view, core, time, ink);
};

/**
 * @param {Body} initial
 * @returns {State}
 */
const fresh = (initial) => ({ bodies: [initial], core: null, time: 0 });

// Each frame re-measures the viewport and resizes the canvas on a change,
// replacing the old resize listener. Bodies queued in env.pending (by
// clicks) join on the next frame; env.reset swaps everything for a fresh
// copy of the initial body first, and env.collapse births the singularity.
/**
 * @param {Env} env
 * @param {View} view
 * @param {State} state
 * @param {DOMHighResTimeStamp} last
 * @returns {FrameRequestCallback}
 */
const tick = (env, view, state, last) => (now) => {
  const current = measure(env.win);
  if (!sameView(view, current)) applyView(env.canvas, env.ctx, current);

  const dt = Math.min((now - last) / 1000, MAX_DT);
  const base = env.reset ? fresh(env.initial) : state;
  const born = env.collapse && !base.core;
  const core = born ? { mass: CORE_MASS, born: base.time, pulse: 0 } : base.core;
  env.reset = false;
  env.collapse = false;
  const gm = centreMass({ ...base, core });
  const joined = [...base.bodies, ...env.pending.splice(0).map((make) => make(gm))];
  const next = step({ ...base, core, bodies: joined }, dt);
  render(env.ctx, current, next, env.ink);

  env.win.requestAnimationFrame(tick(env, current, next, now));
};

/**
 * @param {Window} win
 * @param {Document} doc
 * @param {string} canvasId
 * @param {string} triggerId element whose clicks spawn new bodies
 * @param {Planet} planet
 * @param {string} ink
 * @returns {Controls}
 */
const start = (win, doc, canvasId, triggerId, planet, ink) => {
  const canvas = doc.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`#${canvasId} is not a canvas`);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  /** @type {Env} */
  const env = {
    win,
    canvas,
    ctx,
    ink,
    pending: [],
    initial: launch(planet, START_RADIUS, 0, START_SPEED),
    reset: false,
    collapse: false,
  };
  doc.getElementById(triggerId)?.addEventListener("click", () => {
    env.pending.push((gm) => randomBody(Math.random, gm));
  });

  const view = measure(win);
  applyView(canvas, ctx, view);
  win.requestAnimationFrame(tick(env, view, fresh(env.initial), win.performance.now()));
  return {
    reset: () => {
      env.pending.length = 0;
      env.collapse = false;
      env.reset = true;
    },
    collapse: () => {
      env.collapse = true;
    },
  };
};

/**
 * @param {Window} win
 * @param {Document} doc
 * @param {string} canvasId
 * @param {string} triggerId
 * @returns {Controls} reset back to the single initial body; collapse the
 *   centre into a singularity
 */
export const initOrbiter = (win, doc, canvasId, triggerId) =>
  start(win, doc, canvasId, triggerId, PLANET, INK);
