// @ts-check

import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource-variable/geist/wght.css";
import "./style.css";

import { mountDeck } from "./deck.js";
import { h } from "./dom.js";
import { HttpError, openSession } from "./session.js";
import { initTheme } from "./theme.js";

const stage = /** @type {HTMLElement} */ (document.getElementById("stage"));
const bar = /** @type {HTMLElement} */ (document.getElementById("bar"));
const foot = /** @type {HTMLElement} */ (document.getElementById("foot"));

initTheme(/** @type {HTMLButtonElement} */ (document.getElementById("theme")));

/**
 * /for/<token> is a customer's own link; /<slug> is a general questionnaire
 * @returns {import("./session.js").Route | null}
 */
const route = () => {
  const [first, second, ...rest] = location.pathname.split("/").filter(Boolean);
  if (rest.length) return null;
  if (first === "for" && second) return { kind: "invite", token: second };
  if (first && !second) return { kind: "general", slug: first };
  return null;
};

/** @param {string} title @param {string} body */
const say = (title, body) => {
  stage.replaceChildren(
    h(
      "section",
      { class: "card" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "eyebrow" }),
        h("h1", { class: "title" }, title),
        h("p", { class: "body" }, body),
      ),
    ),
  );
};

const start = async () => {
  const where = route();
  if (!where) return say("Nothing here.", "Please use the link you were sent.");
  try {
    const session = await openSession(where);
    document.title = session.definition.title;
    mountDeck({ stage, bar, foot }, session);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      say("Nothing here.", "This link may have expired. Please check it, or ask for a new one.");
    } else {
      say("That didn’t load.", "Please check your connection and refresh the page.");
    }
  }
};

start();
