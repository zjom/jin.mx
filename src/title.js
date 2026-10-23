// @ts-check

// Each press fades and shrinks 金 a little; the SINGULAR_AT-th collapses it
// into a singularity that takes over the orbits' centre
const SINGULAR_AT = 50;
const MIN_INK = 0.4;
const MIN_SCALE = 0.3;

// A quiet press: the character dips, then exhales a faint glow
/** @type {Keyframe[]} */
const PRESS_KEYFRAMES = [
  { opacity: 1, textShadow: "0 0 0 rgb(205 205 205 / 0)" },
  { opacity: 0.7, textShadow: "0 0 0 rgb(205 205 205 / 0)", offset: 0.15 },
  { opacity: 1, textShadow: "0 0 0.25em rgb(205 205 205 / 0.35)", offset: 0.45 },
  { opacity: 1, textShadow: "0 0 0.6em rgb(205 205 205 / 0)" },
];
/** @type {KeyframeAnimationOptions} */
const PRESS_TIMING = { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

/**
 * @param {Window} win
 * @param {HTMLElement} title
 * @param {() => void} onSingular called once the presses reach SINGULAR_AT
 * @returns {{ press: () => void, reset: () => void }}
 */
export const initTitle = (win, title, onSingular) => {
  const reduceMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let presses = 0;

  /** @param {number} n */
  const setPresses = (n) => {
    presses = n;
    const progress = Math.min(n / SINGULAR_AT, 1);
    title.style.setProperty("--ink", String(1 - (1 - MIN_INK) * progress));
    title.style.setProperty("--scale", String(1 - (1 - MIN_SCALE) * progress));
    title.classList.toggle("is-singular", n >= SINGULAR_AT);
    if (n === SINGULAR_AT) onSingular();
  };

  return {
    press: () => {
      setPresses(presses + 1);
      if (reduceMotion.matches) return;
      title.getAnimations().forEach((a) => a.cancel());
      title.animate(PRESS_KEYFRAMES, PRESS_TIMING);
    },
    // Snap straight back to full ink rather than transitioning in
    reset: () => {
      title.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      title.classList.add("is-resetting");
      setPresses(0);
      void title.offsetWidth;
      title.classList.remove("is-resetting");
    },
  };
};
