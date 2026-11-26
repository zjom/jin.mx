// @ts-check

// What someone answered, set beside what they were asked

import { fill, languagesOf, localize, resolve, toOptions, toRows } from "../../shared/schema.js";
import { h } from "../dom.js";

/**
 * @typedef {import("../../shared/schema.js").Question} Question
 * @typedef {import("../../shared/schema.js").OptionDef} OptionDef
 */

/** @param {unknown} v */
const isOther = (v) => typeof v === "object" && v !== null && typeof (/** @type {any} */ (v).other) === "string";

/**
 * @param {OptionDef[] | undefined} options @param {unknown} v
 * @returns {string} the option's label; what was typed for "other"; else the value itself
 */
const labelOf = (options, v) => {
  if (isOther(v)) return /** @type {any} */ (v).other;
  const found = toOptions(options).find((o) => o.value === v);
  return found ? found.label : typeof v === "object" ? JSON.stringify(v) : String(v);
};

/** @param {number} bytes */
const sizeOf = (bytes) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * @param {Question} q @param {unknown} v its answer, which is not blank
 * @returns {Node | string}
 */
const said = (q, v) => {
  const list = Array.isArray(v) ? v : [];
  switch (q.type) {
    case "choice":
    case "select":
      return labelOf(q.options, v);
    case "multi":
      return h("ul", { class: "said-list" }, list.map((x) => h("li", {}, labelOf(q.options, x))));
    case "rank":
      return h("ol", { class: "said-list" }, list.map((x) => h("li", {}, labelOf(q.options, x))));
    case "boolean":
      return v ? (q.yes ?? "Yes") : (q.no ?? "No");
    case "consent":
      return "Agreed";
    case "slider":
      return `${q.prefix ?? ""}${v}${q.suffix ?? ""}`;
    case "matrix": {
      const given = /** @type {Record<string, unknown>} */ (v ?? {});
      return h(
        "ul",
        { class: "said-list" },
        toRows(q)
          .filter((r) => r.id in given)
          .map((r) => h("li", {}, h("span", { class: "of" }, `${r.label} `), labelOf(q.columns, given[r.id]))),
      );
    }
    case "file":
      return h(
        "ul",
        { class: "said-list" },
        list.map((f) =>
          h(
            "li",
            {},
            h("a", { class: "act", href: `/api/admin/files/${f.key}` }, f.name),
            h("span", { class: "of" }, ` ${sizeOf(f.size)}`),
          ),
        ),
      );
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
};

/**
 * @param {{ definition: import("../../shared/schema.js").Definition, answers: Record<string, unknown>, vars: Record<string, string>, lang: string | null }} a
 * @returns {Node}
 */
export const answersOf = (a) => {
  const languages = languagesOf(a.definition);
  const def = localize(a.definition, a.lang && languages.includes(a.lang) ? a.lang : languages[0]);
  // Only the questions these answers lead to; the rest were never shown
  const asked = resolve(def, a.answers).questions.filter((q) => q.type !== "statement");
  const known = new Set(def.questions.map((q) => q.id));
  const strays = Object.keys(a.answers).filter((id) => !known.has(id));

  return h(
    "dl",
    { class: "answers" },
    asked.map((q) => {
      const v = a.answers[q.id];
      const blank = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
      return h(
        "div",
        { class: "qa" },
        h("dt", {}, fill(q.title, a.vars)),
        h("dd", { class: blank ? "is-blank" : "" }, blank ? "—" : said(q, v)),
      );
    }),
    // Answered once, to a question this questionnaire no longer asks
    strays.map((id) =>
      h(
        "div",
        { class: "qa" },
        h("dt", {}, `${id} (no longer asked)`),
        h("dd", {}, typeof a.answers[id] === "string" ? /** @type {string} */ (a.answers[id]) : JSON.stringify(a.answers[id])),
      ),
    ),
  );
};
