// @ts-check

// The questionnaire format, shared by the page and the worker: which
// questions are showing, whether an answer is acceptable, and whether a
// definition file is well formed

import { LANGS, words } from "./words.js";

/**
 * Text is a string or, in a questionnaire with several languages, one string
 * per language. localize() turns the second into the first, and everything
 * that shows text works on its result
 *
 * @typedef {string | Record<string, string>} Text
 * @typedef {string | number | boolean | { value: string | number | boolean, label?: string }} OptionDef
 * @typedef {{ value: string | number | boolean, label: string }} Option
 * @typedef {{ id: string, label: string }} Row
 *
 * @typedef {object} Condition
 * @property {string} id an earlier question
 * @property {unknown} [equals]
 * @property {unknown} [not]
 * @property {unknown[]} [in]
 * @property {unknown} [includes] for multi answers
 * @property {number} [atLeast]
 * @property {number} [atMost]
 *
 * @typedef {object} Question
 * @property {string} id
 * @property {string} type one of TYPES
 * @property {string} title
 * @property {string} [body] a quieter line under the title
 * @property {string} [eyebrow] replaces the question number
 * @property {boolean} [required]
 * @property {Condition} [showIf]
 * @property {string} [placeholder]
 * @property {OptionDef[]} [options] choice, multi, select, rank
 * @property {boolean} [other] choice, multi: a free text option
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {boolean} [integer] number
 * @property {string} [prefix] slider
 * @property {string} [suffix] slider
 * @property {[string, string]} [labels] scale, slider, matrix: the two ends
 * @property {string} [yes] boolean
 * @property {string} [no] boolean
 * @property {string} [label] consent
 * @property {(string | Row)[]} [rows] matrix
 * @property {OptionDef[]} [columns] matrix
 * @property {string} [earliest] date, yyyy-mm-dd
 * @property {string} [latest] date, yyyy-mm-dd
 * @property {string[]} [accept] file: extensions allowed, without the dot
 * @property {number} [maxSize] file: megabytes each
 *
 * @typedef {object} Definition
 * @property {string} title
 * @property {string[]} [languages] the first is the default; English alone if left out
 * @property {"general" | "invite"} [audience] invite: only reachable by a customer link
 * @property {Question[]} questions
 * @property {{ title?: string, body?: string, label?: string }} [submit]
 * @property {{ title?: string, body?: string }} [outro]
 *
 * @typedef {{ key: string, name: string, size: number, type: string }} StoredFile
 * @typedef {Record<string, unknown>} Answers
 * @typedef {{ id: string, message: string }} Problem
 */

export const TYPES = [
  "statement",
  "text",
  "long",
  "email",
  "url",
  "tel",
  "number",
  "choice",
  "multi",
  "select",
  "boolean",
  "consent",
  "rating",
  "scale",
  "slider",
  "date",
  "time",
  "rank",
  "matrix",
  "file",
];

export const WITH_OPTIONS = ["choice", "multi", "select", "rank"];
const MAX_TEXT = 500;
const MAX_LONG = 10000;

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** @param {OptionDef[] | undefined} defs @returns {Option[]} */
export const toOptions = (defs) =>
  (defs ?? []).map((o) =>
    isRecord(o)
      ? { value: o.value, label: o.label ?? String(o.value) }
      : { value: o, label: String(o) },
  );

/** @param {Question} q @returns {Row[]} */
export const toRows = (q) =>
  (q.rows ?? []).map((r) => (typeof r === "string" ? { id: r, label: r } : r));

/** @param {Question} q @returns {{ min: number, max: number, step: number }} */
export const rangeOf = (q) => {
  if (q.type === "rating") return { min: 1, max: q.max ?? 5, step: 1 };
  if (q.type === "scale") return { min: q.min ?? 0, max: q.max ?? 10, step: 1 };
  return { min: q.min ?? 0, max: q.max ?? 100, step: q.step ?? 1 };
};

const MAX_FILE_MB = 25;
const DEFAULT_ACCEPT =
  "pdf png jpg jpeg gif webp heic svg txt csv md xml html rtf doc docx xls xlsx ppt pptx key pages numbers zip".split(" ");

/**
 * @param {Question} q a file question
 * @returns {{ max: number, maxBytes: number, accept: string[], open: boolean }} open: accept was left to the default
 */
export const fileRules = (q) => ({
  max: q.max ?? 1,
  maxBytes: Math.min(q.maxSize ?? 10, MAX_FILE_MB) * 1024 * 1024,
  accept: (q.accept ?? DEFAULT_ACCEPT).map((e) => e.toLowerCase().replace(/^\./, "")),
  open: !q.accept,
});

/**
 * @param {Question} q a file question
 * @param {{ name: string, size: number }} file
 * @param {string} [lang]
 * @returns {string | null} why this file cannot be taken
 */
export const fileProblem = (q, file, lang = "en") => {
  const t = words(lang);
  const { maxBytes, accept } = fileRules(q);
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!accept.includes(extension)) return t("fileKind");
  if (file.size > maxBytes) return t("fileSize", { n: maxBytes / 1024 / 1024 });
  if (!(file.size > 0)) return t("fileEmpty");
  return null;
};

/** @param {unknown} v the free text of an "other" option, if that is what v is */
const otherText = (v) => (isRecord(v) && typeof v.other === "string" ? v.other.trim() : null);

/**
 * Nothing worth keeping: no answer, or an empty one
 * @param {unknown} v
 */
export const isBlank = (v) => {
  if (v === undefined || v === null || v === false) return v !== false;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isBlank);
  if (isRecord(v)) return "other" in v ? !otherText(v) : Object.keys(v).length === 0;
  return false;
};

/**
 * @param {Question} q
 * @param {Answers} answers only those of the questions showing before q
 */
const isVisible = (q, answers) => {
  const c = q.showIf;
  if (!c) return true;
  const v = answers[c.id];
  if ("equals" in c) return v === c.equals;
  if ("not" in c) return v !== c.not;
  if (c.in) return c.in.includes(v);
  if ("includes" in c) return Array.isArray(v) && v.includes(c.includes);
  if (c.atLeast !== undefined || c.atMost !== undefined) {
    return typeof v === "number" && v >= (c.atLeast ?? -Infinity) && v <= (c.atMost ?? Infinity);
  }
  return !isBlank(v);
};

/**
 * The questions currently showing, and the answers that still count. An
 * answer to a hidden question is dropped, so it cannot keep others showing
 * @param {Definition} def
 * @param {Answers} answers
 * @returns {{ questions: Question[], answers: Answers }}
 */
export const resolve = (def, answers) => {
  /** @type {Question[]} */
  const questions = [];
  /** @type {Answers} */
  const kept = {};
  for (const q of def.questions) {
    if (!isVisible(q, kept)) continue;
    questions.push(q);
    const v = answers[q.id];
    if (q.type !== "statement" && !isBlank(v)) kept[q.id] = typeof v === "string" ? v.trim() : v;
  }
  return { questions, answers: kept };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL = /^[+(]?\d[\d\s().-]{4,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** @param {string} s */
const isUrl = (s) => {
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
};

/**
 * @param {Question} q
 * @param {unknown} v never blank
 * @param {import("./words.js").Words} t
 * @returns {string | null} what is wrong with the answer, in words for the reader
 */
const checkValue = (q, v, t) => {
  const bad = t("again");
  switch (q.type) {
    case "text":
    case "long":
    case "email":
    case "url":
    case "tel": {
      if (typeof v !== "string") return bad;
      const s = v.trim();
      const limit = q.max ?? (q.type === "long" ? MAX_LONG : MAX_TEXT);
      if (s.length > limit) return t("tooLong", { n: limit });
      if (q.min && s.length < q.min) return t("tooShort", { n: q.min });
      if (q.type === "email" && !EMAIL.test(s)) return t("email");
      if (q.type === "url" && !isUrl(s)) return t("url");
      if (q.type === "tel" && !TEL.test(s)) return t("tel");
      return null;
    }
    case "number":
    case "slider": {
      if (typeof v !== "number" || !Number.isFinite(v)) return t("number");
      if (q.integer && !Number.isInteger(v)) return t("integer");
      const { min, max } = q.type === "slider" ? rangeOf(q) : q;
      if (min !== undefined && v < min) return t("tooSmall", { n: min });
      if (max !== undefined && v > max) return t("tooBig", { n: max });
      return null;
    }
    case "rating":
    case "scale": {
      const { min, max } = rangeOf(q);
      return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? null : bad;
    }
    case "choice":
    case "select": {
      if (q.type === "choice" && q.other && otherText(v)) {
        return /** @type {string} */ (otherText(v)).length > MAX_TEXT ? t("shorter") : null;
      }
      return toOptions(q.options).some((o) => o.value === v) ? null : bad;
    }
    case "multi": {
      if (!Array.isArray(v)) return bad;
      const picked = v.filter((x) => !isBlank(x));
      const values = toOptions(q.options).map((o) => o.value);
      const known = picked.filter((x) => values.includes(x));
      const others = picked.filter((x) => q.other && otherText(x));
      if (known.length + others.length !== picked.length) return bad;
      if (new Set(known).size !== known.length || others.length > 1) return bad;
      if (others.some((x) => /** @type {string} */ (otherText(x)).length > MAX_TEXT)) {
        return t("shorter");
      }
      if (q.min && picked.length < q.min) return t("atLeast", { n: q.min });
      if (q.max && picked.length > q.max) return t("atMost", { n: q.max });
      return null;
    }
    case "boolean":
      return typeof v === "boolean" ? null : bad;
    case "consent":
      return v === true ? null : bad;
    case "date": {
      if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) {
        return t("date");
      }
      if (q.earliest && v < q.earliest) return t("later");
      if (q.latest && v > q.latest) return t("earlier");
      return null;
    }
    case "time":
      return typeof v === "string" && TIME.test(v) ? null : t("time");
    case "rank": {
      if (!Array.isArray(v)) return bad;
      const values = toOptions(q.options).map((o) => o.value);
      if (new Set(v).size !== v.length || !v.every((x) => values.includes(x))) return bad;
      return v.length === values.length ? null : t("rankAll");
    }
    case "matrix": {
      if (!isRecord(v)) return bad;
      const rows = toRows(q).map((r) => r.id);
      const columns = toOptions(q.columns).map((o) => o.value);
      const ok = Object.entries(v).every(([k, x]) => rows.includes(k) && columns.includes(/** @type {any} */ (x)));
      if (!ok) return bad;
      return q.required && rows.some((r) => !(r in v)) ? t("everyRow") : null;
    }
    case "file": {
      if (!Array.isArray(v)) return bad;
      const ok = v.every(
        (f) =>
          isRecord(f) &&
          typeof f.key === "string" &&
          /^[\w/-]{1,200}$/.test(f.key) &&
          typeof f.name === "string" &&
          f.name.length <= 255 &&
          typeof f.size === "number" &&
          typeof f.type === "string",
      );
      if (!ok || new Set(v.map((f) => f.key)).size !== v.length) return bad;
      const { max } = fileRules(q);
      return v.length > max ? t("tooMany", { n: max }) : null;
    }
    default:
      return null;
  }
};

/**
 * @param {Question} q
 * @param {unknown} v
 * @param {string} [lang] the language to say it in
 * @returns {string | null} why the reader cannot move on, or null if they can
 */
export const problemWith = (q, v, lang = "en") => {
  const t = words(lang);
  if (q.type === "statement") return null;
  if (isBlank(v)) {
    if (!q.required) return null;
    return t(q.type === "consent" ? "consentRequired" : "required");
  }
  return checkValue(q, v, t);
};

/**
 * @param {Definition} def
 * @param {Answers} answers
 * @param {string} [lang]
 * @returns {Problem | null} the first question that still needs attention
 */
export const firstProblem = (def, answers, lang = "en") => {
  const shown = resolve(def, answers);
  for (const q of shown.questions) {
    const message = problemWith(q, shown.answers[q.id], lang);
    if (message) return { id: q.id, message };
  }
  return null;
};

/**
 * @param {{ languages?: string[] }} def
 * @returns {string[]} the languages a questionnaire is written in, the default first
 */
export const languagesOf = (def) =>
  Array.isArray(def.languages) && def.languages.length ? def.languages : ["en"];

// The parts of a question that are text for the reader
export const TEXTS = ["title", "body", "eyebrow", "placeholder", "yes", "no", "label", "prefix", "suffix"];

/**
 * The same questionnaire with every text in one language. Values, ids and
 * conditions are untouched, so answers mean the same in any language
 * @param {Definition} def
 * @param {string} lang
 * @returns {Definition}
 */
export const localize = (def, lang) => {
  const fallback = languagesOf(def)[0];
  /** @param {any} text */
  const say = (text) => (isRecord(text) ? (text[lang] ?? text[fallback] ?? "") : text);
  /** @param {any} part */
  const texts = (part) => part && Object.fromEntries(Object.entries(part).map(([k, v]) => [k, say(v)]));
  /** @param {any[] | undefined} list */
  const options = (list) =>
    list?.map((o) => (isRecord(o) ? { value: o.value, label: say(o.label) ?? String(o.value) } : o));
  return /** @type {Definition} */ ({
    ...def,
    title: say(def.title),
    questions: def.questions.map((/** @type {any} */ q) => {
      const out = { ...q };
      for (const key of TEXTS) if (key in q) out[key] = say(q[key]);
      if (q.labels) out.labels = q.labels.map(say);
      if (q.options) out.options = options(q.options);
      if (q.columns) out.columns = options(q.columns);
      if (q.rows) out.rows = q.rows.map((/** @type {any} */ r) => (isRecord(r) ? { id: r.id, label: say(r.label) } : r));
      return out;
    }),
    submit: texts(def.submit),
    outro: texts(def.outro),
  });
};

/**
 * Fills {{name}} from vars; unknown names become nothing
 * @param {string | undefined} text
 * @param {Record<string, string>} vars
 */
export const fill = (text, vars) =>
  (text ?? "").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name) => vars[name] ?? "").trim();

/**
 * @param {unknown} def a parsed definition file
 * @returns {string[]} everything wrong with it; empty when it is usable
 */
export const lint = (def) => {
  /** @type {string[]} */
  const errors = [];
  if (!isRecord(def)) return ["must be an object"];

  let languages = ["en"];
  if (def.languages !== undefined) {
    const l = def.languages;
    if (!Array.isArray(l) || !l.length || new Set(l).size !== l.length || !l.every((x) => LANGS.includes(x))) {
      errors.push(`languages must be a list from: ${LANGS.join(", ")}`);
    } else languages = l;
  }
  const several = languages.length > 1;
  /**
   * With several languages every text is written once per language, so that
   * nothing can be left untranslated by accident
   * @param {unknown} v @param {boolean} [plain] a string is enough, as for a unit
   * @returns {string | null} what is wrong with a text
   */
  const textProblem = (v, plain = false) => {
    if (typeof v === "string") return several && !plain ? `must be given in each language (${languages.join(", ")})` : null;
    if (!several || !isRecord(v)) return "must be text";
    const missing = languages.filter((l) => typeof v[l] !== "string" || !v[l]);
    if (missing.length) return `is missing ${missing.join(", ")}`;
    const extra = Object.keys(v).filter((k) => !languages.includes(k));
    return extra.length ? `has a language that is not declared: ${extra.join(", ")}` : null;
  };
  /** @param {string} at @param {unknown} v @param {boolean} [plain] */
  const text = (at, v, plain) => {
    const problem = v === undefined ? null : textProblem(v, plain);
    if (problem) errors.push(`${at} ${problem}`);
  };
  /** @param {string} at @param {unknown} list options or columns */
  const optionTexts = (at, list) => {
    if (!Array.isArray(list)) return;
    list.forEach((o, i) => {
      if (isRecord(o)) {
        if (!["string", "number", "boolean"].includes(typeof o.value)) errors.push(`${at}[${i}] has no value`);
        if (several && typeof o.value === "string" && o.label === undefined) errors.push(`${at}[${i}] has no label`);
        text(`${at}[${i}].label`, o.label);
      } else if (several && typeof o === "string") {
        errors.push(`${at}[${i}] must be { value, label } with a label in each language`);
      }
    });
  };

  if (!def.title) errors.push("title is missing");
  else text("title", def.title);
  for (const part of ["submit", "outro"]) {
    const p = def[part];
    if (p === undefined) continue;
    if (!isRecord(p)) errors.push(`${part} must be an object`);
    else for (const [k, v] of Object.entries(p)) text(`${part}.${k}`, v);
  }
  if (def.audience !== undefined && def.audience !== "general" && def.audience !== "invite") {
    errors.push('audience must be "general" or "invite"');
  }
  if (!Array.isArray(def.questions) || def.questions.length === 0) {
    return [...errors, "questions must be a non-empty list"];
  }
  /** @type {Set<string>} */
  const seen = new Set();
  def.questions.forEach((/** @type {any} */ q, i) => {
    const at = `questions[${i}]${isRecord(q) && q.id ? ` (${q.id})` : ""}`;
    /** @param {string} m */
    const err = (m) => errors.push(`${at}: ${m}`);
    if (!isRecord(q)) return err("must be an object");
    if (typeof q.id !== "string" || !/^[\w-]+$/.test(q.id)) err("id must be letters, digits, - or _");
    else if (seen.has(q.id)) err("id is used twice");
    if (!TYPES.includes(q.type)) err(`unknown type "${q.type}"`);
    if (!q.title) err("title is missing");
    for (const key of TEXTS) text(`${at}: ${key}`, q[key], key === "prefix" || key === "suffix");
    if (q.labels !== undefined) {
      if (!Array.isArray(q.labels) || q.labels.length !== 2) err("labels must be the two ends");
      else q.labels.forEach((l, j) => text(`${at}: labels[${j}]`, l));
    }
    optionTexts(`${at}: options`, q.options);
    optionTexts(`${at}: columns`, q.columns);
    if (Array.isArray(q.rows)) {
      q.rows.forEach((r, j) => {
        if (isRecord(r)) {
          if (typeof r.id !== "string" || !r.id) err(`rows[${j}] has no id`);
          text(`${at}: rows[${j}].label`, r.label ?? "");
        } else if (several || typeof r !== "string") {
          err(`rows[${j}] must be ${several ? "{ id, label } with a label in each language" : "text"}`);
        }
      });
    }
    if (WITH_OPTIONS.includes(q.type) && !(Array.isArray(q.options) && q.options.length)) {
      err("options are missing");
    }
    if (q.type === "matrix") {
      if (!(Array.isArray(q.rows) && q.rows.length)) err("rows are missing");
      if (!(Array.isArray(q.columns) && q.columns.length)) err("columns are missing");
    }
    if (["rating", "scale", "slider"].includes(q.type)) {
      const { min, max, step } = rangeOf(q);
      if (!(min < max) || !(step > 0)) err("min must be below max, and step above 0");
      if (q.type !== "slider" && max - min > 10) err("at most 11 steps fit on a screen");
    }
    if (q.type === "file" && q.maxSize > MAX_FILE_MB) err(`maxSize can be at most ${MAX_FILE_MB}`);
    if (q.showIf !== undefined) {
      if (!isRecord(q.showIf) || !seen.has(q.showIf.id)) err("showIf.id must name an earlier question");
    }
    if (typeof q.id === "string") seen.add(q.id);
  });
  return errors;
};

// Addresses the site keeps for itself
const TAKEN = ["for", "api", "admin"];

/**
 * @param {string} slug a questionnaire's name, which is also its address
 * @returns {string | null} what is wrong with it
 */
export const slugProblem = (slug) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return "name must be lowercase letters, digits and -";
  return TAKEN.includes(slug) ? "this name is taken by the site itself" : null;
};
