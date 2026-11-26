// @ts-check

import "@fontsource-variable/geist/wght.css";
import "./style.css";

import { languagesOf } from "../shared/schema.js";
import { words } from "../shared/words.js";
import { mountDeck } from "./deck.js";
import { h } from "./dom.js";
import { applyLang, guessLang, initLang } from "./lang.js";
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
  // Until a questionnaire says which languages it has, the browser's will do
  const t = words(guessLang());
  const where = route();
  if (!where) return say(t("nothing"), t("useLink"));
  /** @type {import("./session.js").Session} */
  let session;
  try {
    session = await openSession(where);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return say(t("nothing"), t("expired"));
    return say(t("loadFailed"), t("refresh"));
  }
  applyLang(session.lang);
  const deck = mountDeck({ stage, bar, foot }, session);
  initLang(
    /** @type {HTMLButtonElement} */ (document.getElementById("lang")),
    languagesOf(session.definition),
    session.lang,
    deck.setLang,
  );
};

start();
