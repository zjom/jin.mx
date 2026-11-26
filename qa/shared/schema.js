// @ts-check

// The questionnaire format, shared by the page and the worker: which
// questions are showing, whether an answer is acceptable, and whether a
// definition file is well formed

/**
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

const WITH_OPTIONS = ["choice", "multi", "select", "rank"];
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
  "pdf png jpg jpeg gif webp heic svg txt csv md rtf doc docx xls xlsx ppt pptx key pages numbers zip".split(" ");

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
 * @returns {string | null} why this file cannot be taken
 */
export const fileProblem = (q, file) => {
  const { maxBytes, accept } = fileRules(q);
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!accept.includes(extension)) return "That kind of file can’t be added here.";
  if (file.size > maxBytes) return `That file is over ${maxBytes / 1024 / 1024} MB.`;
  if (!(file.size > 0)) return "That file is empty.";
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
 * @returns {string | null} what is wrong with the answer, in words for the reader
 */
const checkValue = (q, v) => {
  const bad = "Please answer this one again.";
  switch (q.type) {
    case "text":
    case "long":
    case "email":
    case "url":
    case "tel": {
      if (typeof v !== "string") return bad;
      const s = v.trim();
      const limit = q.max ?? (q.type === "long" ? MAX_LONG : MAX_TEXT);
      if (s.length > limit) return `Please keep this under ${limit} characters.`;
      if (q.min && s.length < q.min) return `A little more, please — at least ${q.min} characters.`;
      if (q.type === "email" && !EMAIL.test(s)) return "That doesn’t look like an email address.";
      if (q.type === "url" && !isUrl(s)) return "That doesn’t look like a web address.";
      if (q.type === "tel" && !TEL.test(s)) return "That doesn’t look like a phone number.";
      return null;
    }
    case "number":
    case "slider": {
      if (typeof v !== "number" || !Number.isFinite(v)) return "Please enter a number.";
      if (q.integer && !Number.isInteger(v)) return "A whole number, please.";
      const { min, max } = q.type === "slider" ? rangeOf(q) : q;
      if (min !== undefined && v < min) return `This can’t be less than ${min}.`;
      if (max !== undefined && v > max) return `This can’t be more than ${max}.`;
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
        return /** @type {string} */ (otherText(v)).length > MAX_TEXT ? "Please keep this shorter." : null;
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
        return "Please keep this shorter.";
      }
      if (q.min && picked.length < q.min) return `Please choose at least ${q.min}.`;
      if (q.max && picked.length > q.max) return `Please choose no more than ${q.max}.`;
      return null;
    }
    case "boolean":
      return typeof v === "boolean" ? null : bad;
    case "consent":
      return v === true ? null : bad;
    case "date": {
      if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) {
        return "Please choose a date.";
      }
      if (q.earliest && v < q.earliest) return "Please choose a later date.";
      if (q.latest && v > q.latest) return "Please choose an earlier date.";
      return null;
    }
    case "time":
      return typeof v === "string" && TIME.test(v) ? null : "Please choose a time.";
    case "rank": {
      if (!Array.isArray(v)) return bad;
      const values = toOptions(q.options).map((o) => o.value);
      if (new Set(v).size !== v.length || !v.every((x) => values.includes(x))) return bad;
      return v.length === values.length ? null : "Please rank every option.";
    }
    case "matrix": {
      if (!isRecord(v)) return bad;
      const rows = toRows(q).map((r) => r.id);
      const columns = toOptions(q.columns).map((o) => o.value);
      const ok = Object.entries(v).every(([k, x]) => rows.includes(k) && columns.includes(/** @type {any} */ (x)));
      if (!ok) return bad;
      return q.required && rows.some((r) => !(r in v)) ? "Please answer every row." : null;
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
      return v.length > max ? `No more than ${max}, please.` : null;
    }
    default:
      return null;
  }
};

/**
 * @param {Question} q
 * @param {unknown} v
 * @returns {string | null} why the reader cannot move on, or null if they can
 */
export const problemWith = (q, v) => {
  if (q.type === "statement") return null;
  if (isBlank(v)) {
    if (!q.required) return null;
    return q.type === "consent" ? "We need your agreement to continue." : "This one is required.";
  }
  return checkValue(q, v);
};

/**
 * @param {Definition} def
 * @param {Answers} answers
 * @returns {Problem | null} the first question that still needs attention
 */
export const firstProblem = (def, answers) => {
  const shown = resolve(def, answers);
  for (const q of shown.questions) {
    const message = problemWith(q, shown.answers[q.id]);
    if (message) return { id: q.id, message };
  }
  return null;
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
  if (typeof def.title !== "string" || !def.title) errors.push("title is missing");
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
    if (typeof q.title !== "string" || !q.title) err("title is missing");
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
