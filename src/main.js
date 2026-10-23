// @ts-check

import { initOrbiter } from "./orbiter/index.js";
import { watchShake } from "./shake.js";
import { initTitle } from "./title.js";

const canvas = document.getElementById("ca");
const titleEl = document.getElementById("landing-title");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#ca is not a canvas");
if (!titleEl) throw new Error("#landing-title missing");

const orbits = initOrbiter(window, canvas);
const title = initTitle(window, titleEl, orbits.collapse);

// Escape on desktop, a shake on mobile, back to the lone orbiter and 金
const resetAll = () => {
  orbits.reset();
  title.reset();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") resetAll();
});
const shake = watchShake(window, resetAll);

// Every press launches another orbiter
titleEl.addEventListener("click", () => {
  shake.permit();
  orbits.spawn();
  title.press();
});
