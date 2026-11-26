// @ts-check

// /api/admin: everything /admin does. index.js has already made sure of who
// is asking before anything here runs

import { fill, languagesOf, lint, localize, slugProblem } from "../shared/schema.js";
import { CURRENT, fail, json, parse } from "./http.js";

/**
 * @typedef {import("../shared/schema.js").Definition} Definition
 * @typedef {{ DB: any, FILES: any }} Env
 */

const MAX_DEFINITION = 512 * 1024;
const MAX_BODY = 16 * 1024;
const FILE_KEY = /^[qi]\/[\w-]+\/[\w-]+\/[\w-]+$/;

/** @param {Definition} def @returns {string} its title, in its first language and for no one in particular */
const titleOf = (def) => fill(localize(def, languagesOf(def)[0]).title, {});

/** @param {Record<string, any>} row an invite @returns {string} */
const statusOf = (row) =>
  row.revoked_at ? "revoked" : row.submitted_at ? "sent" : row.answers === "{}" ? "waiting" : "started";

/** @param {Record<string, any>} row */
const inviteOut = (row) => ({
  token: row.token,
  questionnaire: row.questionnaire,
  customer: row.customer,
  vars: parse(row.vars),
  lang: row.lang,
  status: statusOf(row),
  answered: Object.keys(parse(row.answers)).length,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
});

/**
 * @param {Env} env @param {string} slug @param {number | null} [revision] the current one if left out
 * @returns {Promise<{ revision: number, definition: Definition, archived: boolean } | null>}
 */
const definitionOf = async (env, slug, revision = null) => {
  const row = revision
    ? await env.DB.prepare(
        "SELECT r.revision, r.definition, q.archived_at FROM revisions r JOIN questionnaires q ON q.slug = r.slug WHERE r.slug = ? AND r.revision = ?",
      )
        .bind(slug, revision)
        .first()
    : await env.DB.prepare(`SELECT q.revision, r.definition, q.archived_at ${CURRENT} WHERE q.slug = ?`)
        .bind(slug)
        .first();
  return row && { revision: row.revision, definition: parse(row.definition), archived: Boolean(row.archived_at) };
};

/** @param {Env} env */
const listQuestionnaires = async (env) => {
  const { results } = await env.DB.prepare(
    `SELECT q.slug, q.revision, q.updated_at, q.archived_at, r.definition,
       (SELECT COUNT(*) FROM invites i WHERE i.questionnaire = q.slug AND i.revoked_at IS NULL AND i.submitted_at IS NULL) AS open,
       (SELECT COUNT(*) FROM submissions s WHERE s.questionnaire = q.slug) AS sent
     ${CURRENT} ORDER BY q.archived_at IS NOT NULL, q.updated_at DESC`,
  ).all();
  return json({
    questionnaires: results.map((/** @type {any} */ row) => {
      const def = parse(row.definition);
      return {
        slug: row.slug,
        title: titleOf(def),
        languages: languagesOf(def),
        audience: def.audience === "invite" ? "invite" : "general",
        revision: row.revision,
        updatedAt: row.updated_at,
        archived: Boolean(row.archived_at),
        open: row.open,
        sent: row.sent,
      };
    }),
  });
};

/** @param {Env} env @param {string} slug @param {URL} url */
const readQuestionnaire = async (env, slug, url) => {
  const found = await definitionOf(env, slug, Number(url.searchParams.get("revision")) || null);
  if (!found) return fail(404, "not found");
  const { results } = await env.DB.prepare(
    "SELECT revision, imported_by, imported_at FROM revisions WHERE slug = ? ORDER BY revision DESC",
  )
    .bind(slug)
    .all();
  return json({
    slug,
    ...found,
    title: titleOf(found.definition),
    revisions: results.map((/** @type {any} */ r) => ({ revision: r.revision, by: r.imported_by, at: r.imported_at })),
  });
};

/**
 * Answers on links still being filled in that a new definition has no
 * question for. They are not lost at once, but the next save drops them
 * @param {Env} env @param {string} slug @param {Definition} def
 * @returns {Promise<string[]>}
 */
const lostAnswers = async (env, slug, def) => {
  const { results } = await env.DB.prepare(
    "SELECT answers FROM invites WHERE questionnaire = ? AND submitted_at IS NULL AND revoked_at IS NULL AND answers != '{}'",
  )
    .bind(slug)
    .all();
  const kept = new Set(def.questions.map((q) => q.id));
  /** @type {Map<string, number>} */
  const lost = new Map();
  for (const row of results) {
    for (const id of Object.keys(parse(row.answers))) {
      if (!kept.has(id)) lost.set(id, (lost.get(id) ?? 0) + 1);
    }
  }
  return [...lost].map(
    ([id, n]) => `"${id}" is gone, and ${n} unfinished ${n === 1 ? "link has" : "links have"} an answer to it`,
  );
};

/**
 * Import: check a definition and, unless this is only a check, serve it
 * @param {Request} request @param {Env} env @param {string} who @param {string} slug @param {boolean} dry
 */
const importQuestionnaire = async (request, env, who, slug, dry) => {
  const named = slugProblem(slug);
  if (named) return json({ ok: false, errors: [named] }, 422);
  const text = await request.text();
  if (text.length > MAX_DEFINITION) return fail(413, "too large");
  let def;
  try {
    def = JSON.parse(text);
  } catch (e) {
    return json({ ok: false, errors: [`not valid JSON: ${/** @type {Error} */ (e).message}`] }, 422);
  }
  const errors = lint(def);
  if (errors.length) return json({ ok: false, errors }, 422);

  const body = JSON.stringify(def);
  const now = await env.DB.prepare(`SELECT q.revision, q.archived_at, r.definition ${CURRENT} WHERE q.slug = ?`)
    .bind(slug)
    .first();
  const same = now?.definition === body;
  const revision = (now?.revision ?? 0) + (same ? 0 : 1);
  const result = {
    ok: true,
    slug,
    revision,
    isNew: !now,
    unchanged: same && !now.archived_at,
    warnings: now && !same ? await lostAnswers(env, slug, def) : [],
  };
  if (dry || result.unchanged) return json({ ...result, saved: false });

  const at = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO questionnaires (slug, revision, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (slug) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at, archived_at = NULL`,
    ).bind(slug, revision, at, at),
  ];
  if (!same) {
    statements.unshift(
      env.DB.prepare(
        "INSERT INTO revisions (slug, revision, definition, imported_by, imported_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(slug, revision, body, who, at),
    );
  }
  await env.DB.batch(statements);
  return json({ ...result, saved: true });
};

/** @param {Env} env @param {string} slug @param {boolean} archived */
const archiveQuestionnaire = async (env, slug, archived) => {
  const done = await env.DB.prepare("UPDATE questionnaires SET archived_at = ? WHERE slug = ?")
    .bind(archived ? new Date().toISOString() : null, slug)
    .run();
  return done.meta.changes ? json({ ok: true }) : fail(404, "not found");
};

/** @param {Env} env @param {URL} url */
const listInvites = async (env, url) => {
  const slug = url.searchParams.get("questionnaire");
  const { results } = await env.DB.prepare(
    `SELECT * FROM invites ${slug ? "WHERE questionnaire = ?" : ""} ORDER BY created_at DESC LIMIT 1000`,
  )
    .bind(...(slug ? [slug] : []))
    .all();
  return json({ invites: results.map(inviteOut) });
};

/** @param {Request} request @param {Env} env @param {URL} url */
const createInvite = async (request, env, url) => {
  const text = await request.text();
  const body = text.length > MAX_BODY ? null : parse(text);
  const customer = typeof body?.customer === "string" ? body.customer.trim() : "";
  if (!customer || customer.length > 200) return fail(400, "a customer name is needed");
  const found = typeof body.questionnaire === "string" ? await definitionOf(env, body.questionnaire) : null;
  if (!found || found.archived) return fail(404, "there is no such questionnaire");

  const lang = body.lang || null;
  const languages = languagesOf(found.definition);
  if (lang !== null && !languages.includes(lang)) return fail(400, `it is only written in: ${languages.join(", ")}`);
  const given = body.vars ?? {};
  if (typeof given !== "object" || Array.isArray(given)) return fail(400, "bad request");
  const vars = Object.fromEntries(
    Object.entries(given)
      .filter(([k, v]) => /^[\w.-]+$/.test(k) && typeof v === "string" && v.trim())
      .map(([k, v]) => [k, v.trim()]),
  );

  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO invites (token, questionnaire, customer, vars, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(token, body.questionnaire, customer, JSON.stringify(vars), lang, now, now)
    .run();
  return json({ ok: true, token, url: `${url.origin}/for/${token}` });
};

/** @param {Env} env @param {string} token @param {boolean} revoked */
const revokeInvite = async (env, token, revoked) => {
  const done = await env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE token = ?")
    .bind(revoked ? new Date().toISOString() : null, token)
    .run();
  return done.meta.changes ? json({ ok: true }) : fail(404, "not found");
};

/**
 * One set of answers with the questions they answer: a customer's link at any
 * stage, or something sent through a general questionnaire
 * @param {Env} env @param {"invites" | "responses"} table @param {string} id
 */
const readAnswers = async (env, table, id) => {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${table === "invites" ? "token" : "id"} = ?`)
    .bind(id)
    .first();
  if (!row) return fail(404, "not found");
  // What was sent is read beside the questions as they were then
  const found =
    (row.submitted_at && row.revision && (await definitionOf(env, row.questionnaire, row.revision))) ||
    (await definitionOf(env, row.questionnaire));
  return json({
    id,
    questionnaire: row.questionnaire,
    customer: row.customer ?? null,
    vars: { ...parse(row.vars ?? "{}"), customer: row.customer ?? "" },
    status: table === "invites" ? statusOf(row) : "sent",
    lang: row.lang,
    revision: found?.revision ?? null,
    updatedAt: row.updated_at ?? row.submitted_at,
    submittedAt: row.submitted_at,
    answers: parse(row.answers),
    definition: found?.definition ?? null,
  });
};

/** @param {unknown} v an answer @returns {string} as it reads in a spreadsheet */
const plain = (v) => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(plain).join("; ");
  if (typeof v === "object") {
    const o = /** @type {Record<string, unknown>} */ (v);
    if (typeof o.other === "string") return o.other;
    if (typeof o.key === "string" && typeof o.name === "string") return o.name;
    return Object.entries(o)
      .map(([k, x]) => `${k}: ${plain(x)}`)
      .join("; ");
  }
  return String(v);
};

/** @param {unknown} v */
const cell = (v) => {
  let s = plain(v);
  // A spreadsheet would run a cell that starts like a formula
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** @param {Env} env @param {URL} url */
const listSubmissions = async (env, url) => {
  const slug = url.searchParams.get("questionnaire");
  const csv = url.searchParams.get("format") === "csv";
  const { results } = await env.DB.prepare(
    `SELECT s.*, EXISTS (SELECT 1 FROM invites i WHERE i.token = s.id) AS invited
     FROM submissions s ${slug ? "WHERE s.questionnaire = ?" : ""} ORDER BY s.submitted_at DESC LIMIT 5000`,
  )
    .bind(...(slug ? [slug] : []))
    .all();
  if (!csv) {
    return json({
      submissions: results.map((/** @type {any} */ r) => ({
        id: r.id,
        kind: r.invited ? "invite" : "response",
        questionnaire: r.questionnaire,
        customer: r.customer,
        lang: r.lang,
        revision: r.revision,
        submittedAt: r.submitted_at,
      })),
    });
  }

  // One column per question now asked, then any that only older answers have
  const found = slug ? await definitionOf(env, slug) : null;
  const rows = results.map((/** @type {any} */ r) => ({ ...r, answers: parse(r.answers) }));
  const ids = new Set(found?.definition.questions.filter((q) => q.type !== "statement").map((q) => q.id));
  for (const r of rows) for (const id of Object.keys(r.answers)) ids.add(id);
  const lines = [["submitted_at", "questionnaire", "customer", "lang", "revision", ...ids].map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.submitted_at, r.questionnaire, r.customer, r.lang, r.revision, ...[...ids].map((id) => r.answers[id])]
        .map(cell)
        .join(","),
    );
  }
  // The mark at the start is how Excel knows the file is UTF-8
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug ?? "submissions"}.csv"`,
      "cache-control": "no-store",
    },
  });
};

/** @param {Env} env @param {string} key */
const readFile = async (env, key) => {
  const file = FILE_KEY.test(key) ? await env.FILES.get(key) : null;
  if (!file) return fail(404, "not found");
  const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
  // Kept with the file when it was stored: its type, and that it is a download
  file.writeHttpMetadata(headers);
  return new Response(file.body, { headers });
};

/**
 * @param {Request} request @param {Env} env
 * @param {string} who @param {string[]} path what follows /api/admin/
 */
export const admin = async (request, env, who, path) => {
  const url = new URL(request.url);
  const { method } = request;
  // The login is a cookie, which a browser would also send for another site's
  // page. A browser says where a change comes from; a script says nothing
  const origin = request.headers.get("origin");
  if (method !== "GET" && origin && origin !== url.origin) return fail(403, "forbidden");

  let what, id, action;
  try {
    [what, id, action] = path.map(decodeURIComponent);
  } catch {
    return fail(400, "bad request");
  }
  const deep = path.length > 3;

  if (what === "files" && method === "GET") return readFile(env, path.slice(1).join("/"));
  if (deep) return fail(404, "not found");

  if (what === "questionnaires") {
    if (!id) return method === "GET" ? listQuestionnaires(env) : fail(405, "method not allowed");
    if (action === "restore" && method === "POST") return archiveQuestionnaire(env, id, false);
    if (action) return fail(404, "not found");
    if (method === "GET") return readQuestionnaire(env, id, url);
    if (method === "PUT") return importQuestionnaire(request, env, who, id, url.searchParams.has("dry"));
    if (method === "DELETE") return archiveQuestionnaire(env, id, true);
    return fail(405, "method not allowed");
  }

  if (what === "invites") {
    if (!id) {
      if (method === "GET") return listInvites(env, url);
      if (method === "POST") return createInvite(request, env, url);
      return fail(405, "method not allowed");
    }
    if (action === "restore" && method === "POST") return revokeInvite(env, id, false);
    if (action) return fail(404, "not found");
    if (method === "GET") return readAnswers(env, "invites", id);
    if (method === "DELETE") return revokeInvite(env, id, true);
    return fail(405, "method not allowed");
  }

  if (what === "submissions" && method === "GET" && !action) {
    return id ? readAnswers(env, "responses", id) : listSubmissions(env, url);
  }

  return fail(404, "not found");
};
