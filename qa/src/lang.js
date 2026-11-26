// @ts-check

import { LANG_NAMES, LANG_TAGS, LANGS, words } from "../shared/words.js";

const KEY = "qa:lang";

/** @returns {string | null} the language chosen with the switch on an earlier visit */
const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * The language to open in when nothing says otherwise: the one chosen here
 * before, else the first the browser asks for that is on offer
 * @param {string[]} [languages] those on offer, the default first
 */
export const guessLang = (languages = LANGS) => {
  const wanted = [stored(), ...(navigator.languages ?? [navigator.language])];
  for (const tag of wanted) {
    const lang = String(tag ?? "").toLowerCase().split("-")[0];
    if (languages.includes(lang)) return lang;
  }
  return languages[0];
};

/**
 * Puts the page itself in a language: its lang attribute, which also picks
 * the fonts, and the labels of the fixed controls
 * @param {string} lang
 */
export const applyLang = (lang) => {
  const t = words(lang);
  document.documentElement.lang = LANG_TAGS[lang] ?? lang;
  document.getElementById("bar")?.setAttribute("aria-label", t("progress"));
  document.getElementById("theme")?.setAttribute("aria-label", t("darkMode"));
  document.getElementById("lang")?.setAttribute("aria-label", t("language"));
};

/**
 * The switch: every language by its own name, the current one marked. It is
 * only shown when there is more than one
 * @param {HTMLButtonElement} button
 * @param {string[]} languages
 * @param {string} current
 * @param {(lang: string) => boolean} onChange false if the change could not be made just now
 */
export const initLang = (button, languages, current, onChange) => {
  if (languages.length < 2) return;
  const names = languages.map((l) => {
    const el = document.createElement("span");
    el.lang = LANG_TAGS[l] ?? l;
    el.textContent = LANG_NAMES[l] ?? l;
    return el;
  });
  const paint = () => names.forEach((el, i) => el.classList.toggle("is-on", languages[i] === current));
  button.replaceChildren(...names);
  button.hidden = false;
  paint();

  button.addEventListener("click", () => {
    const next = languages[(languages.indexOf(current) + 1) % languages.length];
    if (!onChange(next)) return;
    current = next;
    applyLang(next);
    paint();
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the choice lasts for this visit only
    }
  });
};
