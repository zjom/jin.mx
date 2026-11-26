// @ts-check

// Changes to a questionnaire while it is being edited as a form. Nothing here
// touches the page. Everything is changed in place, so that a definition
// that was only looked at comes out exactly as it went in

import { languagesOf, TEXTS, toOptions } from "../../shared/schema.js";

/** @param {unknown} v @returns {v is Record<string, any>} */
export const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

// --- text: a string, or one string per language ------------------------------

/** @param {unknown} v a text @param {string} lang @returns {string} how it reads in lang */
export const readText = (v, lang) => {
  if (isRecord(v)) return typeof v[lang] === "string" ? v[lang] : "";
  return typeof v === "string" ? v : "";
};

/**
 * @param {unknown} old the text as it is
 * @param {string} text how it should now read in lang
 * @param {string} lang
 * @param {string[]} langs the questionnaire's languages
 * @returns {string | Record<string, string> | undefined} the text to keep; undefined when nothing is left of it
 */
export const writeText = (old, text, lang, langs) => {
  if (langs.length < 2) return text || undefined;
  /** @type {Record<string, string>} */
  const record = isRecord(old) ? old : typeof old === "string" && old ? { [langs[0]]: old } : {};
  if (text) record[lang] = text;
  else delete record[lang];
  return Object.keys(record).length ? record : undefined;
};

/**
 * Rewrites every text for another set of languages. From one to several,
 * what is written becomes the first language's; from several to one, only
 * the remaining language's wording is kept
 * @param {Record<string, any>} def
 * @param {string[]} next the first is the default
 */
export const setLanguages = (def, next) => {
  const prev = languagesOf(def);
  const several = next.length > 1;
  const from = next.includes(prev[0]) ? prev[0] : next[0];
  if ("languages" in def || several || next[0] !== "en") def.languages = next;

  /** @param {unknown} v */
  const conv = (v) => {
    if (several) {
      if (typeof v === "string") return { [from]: v };
      if (isRecord(v)) for (const k of Object.keys(v)) if (!next.includes(k)) delete v[k];
      return v;
    }
    return isRecord(v) ? (v[next[0]] ?? v[prev[0]] ?? "") : v;
  };
  /** @param {Record<string, any>} holder @param {string} key @param {boolean} [plain] a string is enough in any case */
  const apply = (holder, key, plain = false) => {
    if (!(key in holder) || (plain && several && !isRecord(holder[key]))) return;
    const v = conv(holder[key]);
    if (v === "" && key !== "title") delete holder[key];
    else holder[key] = v;
  };
  /** @param {any[]} list options, columns or rows @param {"value" | "id"} idKey */
  const items = (list, idKey) => {
    list.forEach((o, i) => {
      if (isRecord(o)) {
        if (o.label === undefined && several && typeof o[idKey] === "string") o.label = o[idKey];
        apply(o, "label");
        if (!several && (o.label === undefined || o.label === o[idKey])) list[i] = o[idKey];
      } else if (several && typeof o === "string") list[i] = { [idKey]: o, label: conv(o) };
    });
  };

  apply(def, "title");
  for (const part of ["submit", "outro"]) {
    if (isRecord(def[part])) for (const k of Object.keys(def[part])) apply(def[part], k);
  }
  for (const q of Array.isArray(def.questions) ? def.questions : []) {
    if (!isRecord(q)) continue;
    for (const key of TEXTS) apply(q, key, key === "prefix" || key === "suffix");
    if (Array.isArray(q.labels)) q.labels = q.labels.map(conv);
    if (Array.isArray(q.options)) items(q.options, "value");
    if (Array.isArray(q.columns)) items(q.columns, "value");
    if (Array.isArray(q.rows)) items(q.rows, "id");
  }
};

// --- names -------------------------------------------------------------------

/** @param {string} s @returns {string} s as a value or an id: lowercase, words joined by - */
export const slug = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** @param {string} base @param {unknown[]} taken @returns {string} base, numbered if it is in use */
export const unique = (base, taken) => {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

// --- questions ---------------------------------------------------------------

// What each type reads besides what every question has
const LENGTHS = ["placeholder", "min", "max"];
export const SETTINGS = /** @type {Record<string, string[]>} */ ({
  statement: [],
  text: LENGTHS,
  long: LENGTHS,
  email: LENGTHS,
  url: LENGTHS,
  tel: LENGTHS,
  number: ["placeholder", "min", "max", "step", "integer"],
  choice: ["options", "other"],
  multi: ["options", "other", "min", "max"],
  select: ["options", "placeholder"],
  boolean: ["yes", "no"],
  consent: ["label"],
  rating: ["max"],
  scale: ["min", "max", "labels"],
  slider: ["min", "max", "step", "prefix", "suffix", "labels"],
  date: ["earliest", "latest"],
  time: [],
  rank: ["options"],
  matrix: ["rows", "columns", "labels"],
  file: ["accept", "max", "maxSize"],
});
const KNOWN = [...new Set(Object.values(SETTINGS).flat())];

/**
 * Makes q another type. What the new type has no use for is dropped; what
 * the form does not know about is left alone
 * @param {Record<string, any>} q @param {string} type
 */
export const setType = (q, type) => {
  const keeps = SETTINGS[type] ?? [];
  // The same word means something else: a length, a count, a value
  const meant = (/** @type {string} */ t) => (LENGTHS === SETTINGS[t] ? "length" : t === "multi" || t === "file" ? "count" : "value");
  if (meant(q.type) !== meant(type)) for (const k of ["min", "max", "step"]) delete q[k];
  q.type = type;
  for (const k of KNOWN) if (!keeps.includes(k)) delete q[k];
  for (const k of ["options", "rows", "columns"]) if (keeps.includes(k) && !Array.isArray(q[k])) q[k] = [];
};

/** @param {Record<string, any>} def @returns {Record<string, any>} a new question, at the end */
export const addQuestion = (def) => {
  const ids = def.questions.map((/** @type {any} */ q) => q.id);
  let n = def.questions.length + 1;
  while (ids.includes(`q${n}`)) n++;
  const q = { id: `q${n}`, type: "text" };
  def.questions.push(q);
  return q;
};

/** @param {Record<string, any>} def @param {number} i @returns {Record<string, any>} the copy, placed after it */
export const duplicate = (def, i) => {
  const copy = structuredClone(def.questions[i]);
  copy.id = unique(`${copy.id}-copy`, def.questions.map((/** @type {any} */ q) => q.id));
  def.questions.splice(i + 1, 0, copy);
  return copy;
};

/** @param {any[]} list @param {number} i @param {1 | -1} by @returns {boolean} whether it moved */
export const move = (list, i, by) => {
  const to = i + by;
  if (to < 0 || to >= list.length) return false;
  [list[i], list[to]] = [list[to], list[i]];
  return true;
};

/**
 * @param {Record<string, any>} def @param {string} from @param {string} to
 * Renames a question, and with it every condition that asks about it
 */
export const renameId = (def, from, to) => {
  for (const q of def.questions) {
    if (q.id === from) q.id = to;
    if (isRecord(q.showIf) && q.showIf.id === from) q.showIf.id = to;
  }
};

// --- conditions --------------------------------------------------------------

export const OPS = /** @type {[string, string][]} */ ([
  ["answered", "is answered"],
  ["equals", "is"],
  ["not", "is not"],
  ["in", "is one of"],
  ["includes", "includes"],
  ["atLeast", "is at least"],
  ["atMost", "is at most"],
  ["between", "is between"],
]);

const NUMERIC = ["number", "rating", "scale", "slider"];

/** @param {Record<string, any>} c a condition @returns {string} which of OPS it is, read as the questionnaire reads it */
export const opOf = (c) => {
  if ("equals" in c) return "equals";
  if ("not" in c) return "not";
  if (c.in) return "in";
  if ("includes" in c) return "includes";
  if (c.atLeast !== undefined && c.atMost !== undefined) return "between";
  if (c.atLeast !== undefined) return "atLeast";
  if (c.atMost !== undefined) return "atMost";
  return "answered";
};

/**
 * @param {Record<string, any> | null | undefined} q the question a condition asks about, with its texts in one language
 * @returns {{ value: any, label: string }[] | null} the answers it can have, when they can be listed
 */
export const valuesOf = (q) => {
  if (!q) return null;
  if (["choice", "select", "multi", "rank"].includes(q.type)) return toOptions(Array.isArray(q.options) ? q.options : []);
  if (q.type === "boolean") return [{ value: true, label: q.yes || "Yes" }, { value: false, label: q.no || "No" }];
  if (q.type === "consent") return [{ value: true, label: "Agreed" }];
  return null;
};

/** @param {Record<string, any> | null | undefined} q @returns {boolean} whether its answer is a number */
export const isNumeric = (q) => NUMERIC.includes(q?.type);

/**
 * @param {Record<string, any>} c the condition as it is
 * @param {string} op one of OPS
 * @param {Record<string, any> | null | undefined} target the question it asks about
 * @returns {Record<string, any>} the same question asked another way, keeping what it compared with where that still makes sense
 */
export const withOp = (c, op, target) => {
  const was = c.equals ?? c.not ?? c.includes ?? (Array.isArray(c.in) ? c.in[0] : undefined);
  const one = was ?? valuesOf(target)?.[0]?.value ?? (isNumeric(target) ? 0 : "");
  const low = typeof c.atLeast === "number" ? c.atLeast : typeof was === "number" ? was : 0;
  const high = typeof c.atMost === "number" ? c.atMost : Math.max(low, 10);
  switch (op) {
    case "equals":
    case "not":
    case "includes":
      return { id: c.id, [op]: one };
    case "in":
      return { id: c.id, in: was === undefined ? [] : [was] };
    case "atLeast":
      return { id: c.id, atLeast: low };
    case "atMost":
      return { id: c.id, atMost: typeof c.atMost === "number" ? c.atMost : low };
    case "between":
      return { id: c.id, atLeast: low, atMost: high };
    default:
      return { id: c.id };
  }
};

// --- problems ----------------------------------------------------------------

/**
 * @param {string[]} errors what lint said
 * @returns {{ general: string[], at: Map<number, string[]> }} the same, each beside the question it is about
 */
export const problemsByQuestion = (errors) => {
  /** @type {string[]} */
  const general = [];
  /** @type {Map<number, string[]>} */
  const at = new Map();
  for (const e of errors) {
    const m = /^questions\[(\d+)\](?: \([^)]*\))?: (.*)$/s.exec(e);
    if (!m) general.push(e);
    else at.set(Number(m[1]), [...(at.get(Number(m[1])) ?? []), m[2]]);
  }
  return { general, at };
};

/** @returns {Record<string, any>} somewhere to start from */
export const blank = () => ({ title: "", questions: [{ id: "q1", type: "text" }] });
