// @ts-check

// An email to whoever runs this, each time a questionnaire is sent

import { fill, isBlank, languagesOf, localize, resolve, toOptions, toRows } from "../shared/schema.js";

/**
 * @typedef {import("../shared/schema.js").Definition} Definition
 * @typedef {import("../shared/schema.js").Question} Question
 * @typedef {import("../shared/schema.js").OptionDef} OptionDef
 * @typedef {{ RESEND_API_KEY?: string, NOTIFY_TO?: string, NOTIFY_FROM?: string }} NotifyEnv
 */

/** @param {OptionDef[] | undefined} options @param {unknown} v */
const labelOf = (options, v) => {
  const other = /** @type {any} */ (v)?.other;
  if (typeof other === "string") return other;
  const found = toOptions(options).find((o) => o.value === v);
  return found ? found.label : typeof v === "object" ? JSON.stringify(v) : String(v);
};

/** @param {Question} q @param {unknown} v its answer, which is not blank @returns {string} */
const said = (q, v) => {
  const list = Array.isArray(v) ? v : [];
  switch (q.type) {
    case "choice":
    case "select":
      return labelOf(q.options, v);
    case "multi":
      return list.map((x) => labelOf(q.options, x)).join(", ");
    case "rank":
      return list.map((x, i) => `${i + 1}. ${labelOf(q.options, x)}`).join("\n");
    case "boolean":
      return v ? (q.yes ?? "Yes") : (q.no ?? "No");
    case "consent":
      return "Agreed";
    case "slider":
      return `${q.prefix ?? ""}${v}${q.suffix ?? ""}`;
    case "matrix": {
      const given = /** @type {Record<string, unknown>} */ (v ?? {});
      return toRows(q)
        .filter((r) => r.id in given)
        .map((r) => `${r.label}: ${labelOf(q.columns, given[r.id])}`)
        .join("\n");
    }
    case "file":
      return list.map((f) => f.name).join(", ");
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
};

/**
 * @typedef {object} Sent
 * @property {string} slug
 * @property {Definition} definition
 * @property {Record<string, unknown>} answers as stored
 * @property {string} lang
 * @property {string} origin where /admin is
 * @property {string} path inside /admin, to these answers
 * @property {string} [customer] on a customer link
 * @property {Record<string, string>} [vars]
 */

/** @param {Sent} s @returns {{ subject: string, text: string }} */
export const compose = (s) => {
  const languages = languagesOf(s.definition);
  const def = localize(s.definition, languages.includes(s.lang) ? s.lang : languages[0]);
  const vars = { ...s.vars, customer: s.customer ?? "" };
  const asked = resolve(def, s.answers).questions.filter((q) => q.type !== "statement");
  const title = fill(def.title, vars);
  return {
    subject: s.customer ? `${s.customer} sent ${title}` : `New answers to ${title}`,
    text: [
      `${s.origin}/admin#/a/${s.path}`,
      ...asked.map((q) => `${fill(q.title, vars)}\n${isBlank(s.answers[q.id]) ? "—" : said(q, s.answers[q.id])}`),
    ].join("\n\n"),
  };
};

/**
 * Sends the email. Never throws: the answers are already saved, and a
 * failure here is only logged
 * @param {NotifyEnv} env @param {Sent} sent
 */
export const notify = async (env, sent) => {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "qa.jin.mx <qa@notify.jin.mx>",
        to: env.NOTIFY_TO.split(",").map((x) => x.trim()),
        ...compose(sent),
      }),
    });
    if (!res.ok) console.error("notify", res.status, await res.text());
  } catch (e) {
    console.error("notify", e);
  }
};
