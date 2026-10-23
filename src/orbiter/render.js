// @ts-check

import { TRAIL_BANDS } from "./config.js";
import { awake, coreRadius } from "./physics.js";

/**
 * @typedef {import("./types.js").Point} Point
 * @typedef {import("./types.js").View} View
 * @typedef {import("./types.js").Core} Core
 * @typedef {import("./types.js").State} State
 */

// Trail: thin line fading toward its tail. Segment i has alpha
// ((i + 1) / len)², rising along the trail, so each band of equal
// (quantised) alpha is one contiguous run, stroked as a single polyline.
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {readonly Point[]} trail in viewport units
 * @param {number} opacity
 * @returns {void}
 */
const drawTrail = (ctx, view, trail, opacity) => {
  const { cx, cy, S } = view;
  const len = trail.length;
  let band = -1;
  for (let i = 0; i < len - 1; i++) {
    const b = Math.min(Math.floor(((i + 1) / len) ** 2 * TRAIL_BANDS), TRAIL_BANDS - 1);
    if (b !== band) {
      if (band >= 0) ctx.stroke();
      band = b;
      ctx.globalAlpha = ((b + 0.5) / TRAIL_BANDS) * opacity;
      ctx.beginPath();
      ctx.moveTo(cx + trail[i].x * S, cy + trail[i].y * S);
    }
    ctx.lineTo(cx + trail[i + 1].x * S, cy + trail[i + 1].y * S);
  }
  if (band >= 0) ctx.stroke();
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {Point} pos in viewport units
 * @param {number} size
 * @param {number} opacity
 * @returns {void}
 */
const drawPlanet = (ctx, view, pos, size, opacity) => {
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(view.cx + pos.x * view.S, view.cy + pos.y * view.S, size, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.shadowColor = ink;
  ctx.shadowBlur = 4 + r * 2;
  ctx.globalAlpha = awake(core, time);
  ctx.beginPath();
  ctx.arc(view.cx, view.cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @param {State} state every body must have a non-empty trail
 * @param {string} ink
 * @returns {void}
 */
export const render = (ctx, view, { bodies, core, time }, ink) => {
  ctx.clearRect(0, 0, view.W, view.H);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { planet, trail } of bodies) {
    drawTrail(ctx, view, trail, planet.opacity);
    drawPlanet(ctx, view, trail[trail.length - 1], planet.size, planet.opacity);
  }
  if (core) drawCore(ctx, view, core, time, ink);
  ctx.globalAlpha = 1;
};
