// @ts-check

/**
 * @typedef {{ speed: number, size: number, trailLen: number }} Planet
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ W: number, H: number, dpr: number, cx: number, cy: number, R: number }} View
 * @typedef {{ angle: number, trail: readonly Point[] }} State
 * @typedef {{ from: Point, to: Point, alpha: number }} Segment
 * @typedef {{
 *   win: Window,
 *   canvas: HTMLCanvasElement,
 *   ctx: CanvasRenderingContext2D,
 *   planet: Planet,
 *   ink: string,
 * }} Env
 */

/** @type {Planet} */
const PLANET = { speed: 0.9, size: 3, trailLen: 90 };
const INK = "#cdcdcd";
const MAX_DT = 0.05;

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
    R: Math.min(W, H) * 0.3,
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
 * @param {number} angle
 * @returns {State}
 */
const initialState = (angle) => ({ angle, trail: [] });

/**
 * @param {View} view
 * @param {number} angle
 * @returns {Point}
 */
const orbitPosition = (view, angle) => ({
  x: view.cx + view.R * Math.cos(angle),
  y: view.cy + view.R * Math.sin(angle),
});

/**
 * @param {State} state
 * @param {View} view
 * @param {Planet} planet
 * @param {number} dt seconds since the previous frame
 * @returns {State}
 */
const step = (state, view, planet, dt) => {
  const angle = state.angle + planet.speed * dt;
  const trail = [...state.trail, orbitPosition(view, angle)];
  return { angle, trail: trail.slice(-planet.trailLen) };
};

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
 * @param {readonly Point[]} trail
 * @param {string} ink
 * @returns {void}
 */
const drawTrail = (ctx, trail, ink) => {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  trailSegments(trail).forEach(({ from, to, alpha }) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point} pos
 * @param {number} size
 * @param {string} ink
 * @returns {void}
 */
const drawPlanet = (ctx, pos, size, ink) => {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {State} state must have a non-empty trail
 * @param {Planet} planet
 * @param {string} ink
 * @returns {void}
 */
const render = (ctx, view, state, planet, ink) => {
  ctx.clearRect(0, 0, view.W, view.H);
  drawTrail(ctx, state.trail, ink);
  drawPlanet(ctx, state.trail[state.trail.length - 1], planet.size, ink);
};

// Each frame re-measures the viewport; on a size change the canvas is
// resized and the trail cleared, replacing the old resize listener.
/**
 * @param {Env} env
 * @param {View} view
 * @param {State} state
 * @param {DOMHighResTimeStamp} last
 * @returns {FrameRequestCallback}
 */
const tick = (env, view, state, last) => (now) => {
  const current = measure(env.win);
  const resized = !sameView(view, current);
  if (resized) applyView(env.canvas, env.ctx, current);

  const dt = Math.min((now - last) / 1000, MAX_DT);
  const prev = resized ? initialState(state.angle) : state;
  const next = step(prev, current, env.planet, dt);
  render(env.ctx, current, next, env.planet, env.ink);

  env.win.requestAnimationFrame(tick(env, current, next, now));
};

/**
 * @param {Window} win
 * @param {Document} doc
 * @param {string} canvasId
 * @param {Planet} planet
 * @param {string} ink
 * @returns {void}
 */
const start = (win, doc, canvasId, planet, ink) => {
  const canvas = doc.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`#${canvasId} is not a canvas`);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const env = { win, canvas, ctx, planet, ink };
  const view = measure(win);
  applyView(canvas, ctx, view);
  win.requestAnimationFrame(tick(env, view, initialState(0), win.performance.now()));
};

/**
 * @param {Window} win
 * @param {Document} doc
 * @param {string} canvasId
 * @returns {void}
 */
export const initOrbiter = (win, doc, canvasId) => start(win, doc, canvasId, PLANET, INK);
