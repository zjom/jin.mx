import "./style.css";
import { initOrbiter } from "./orbiter.js";
import { watchShake } from "./shake.js";

const reset = initOrbiter(window, document, "ca", "landing-title");

// Escape on desktop, a shake on mobile, back to the lone orbiter
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") reset();
});
const shake = watchShake(window, reset);

// A quiet press: the character dips, then exhales a faint glow
const title = document.getElementById("landing-title");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
title?.addEventListener("click", () => {
  shake.permit();
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
