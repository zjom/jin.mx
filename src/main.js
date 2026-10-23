import { initOrbiter } from "./orbiter.js";
import { watchShake } from "./shake.js";

const orbits = initOrbiter(window, document, "ca", "landing-title");

// Each click fades and shrinks 金 a little; the hundredth collapses it into
// a singularity that takes over the orbits' centre
const SINGULAR_AT = 50;
const MIN_INK = 0.4;
const MIN_SCALE = 0.3;
let clicks = 0;

const title = document.getElementById("landing-title");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** @param {number} n */
const setClicks = (n) => {
  clicks = n;
  const progress = Math.min(n / SINGULAR_AT, 1);
  title?.style.setProperty("--ink", String(1 - (1 - MIN_INK) * progress));
  title?.style.setProperty("--scale", String(1 - (1 - MIN_SCALE) * progress));
  title?.classList.toggle("is-singular", n >= SINGULAR_AT);
  if (n === SINGULAR_AT) orbits.collapse();
};

// Escape on desktop, a shake on mobile, back to the lone orbiter and 金
const resetAll = () => {
  orbits.reset();
  setClicks(0);
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") resetAll();
});
const shake = watchShake(window, resetAll);

// A quiet press: the character dips, then exhales a faint glow
title?.addEventListener("click", () => {
  shake.permit();
  setClicks(clicks + 1);
  if (reduceMotion.matches) return;
  title.getAnimations().forEach((a) => a.cancel());
  title.animate(
    [
      { transform: "scale(1)", opacity: 1, textShadow: "0 0 0 rgb(205 205 205 / 0)" },
      {
        opacity: 0.7,
        textShadow: "0 0 0 rgb(205 205 205 / 0)",
        offset: 0.15,
      },
      {
        transform: "scale(1)",
        opacity: 1,
        textShadow: "0 0 0.25em rgb(205 205 205 / 0.35)",
        offset: 0.45,
      },
      { transform: "scale(1)", opacity: 1, textShadow: "0 0 0.6em rgb(205 205 205 / 0)" },
    ],
    { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
});
