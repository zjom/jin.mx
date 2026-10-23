// @ts-check

/** @typedef {import("./types.js").View} View */

// Viewport geometry derived from the window
/**
 * @param {Window} win
 * @returns {View}
 */
export const measure = (win) => {
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
export const sameView = (a, b) => a.W === b.W && a.H === b.H && a.dpr === b.dpr;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {View} view
 * @returns {void}
 */
export const applyView = (canvas, ctx, view) => {
  canvas.width = view.W * view.dpr;
  canvas.height = view.H * view.dpr;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
};
