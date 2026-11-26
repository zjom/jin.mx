// @ts-check

import { firstProblem, resolve } from "../shared/schema.js";

/**
 * @typedef {import("../shared/schema.js").Definition} Definition
 * @typedef {{ DB: any, SUBMIT_LIMIT?: { limit: (o: { key: string }) => Promise<{ success: boolean }> } }} Env
 */

// Every file in questionnaires/ is a questionnaire; its name is its slug
const files = /** @type {Record<string, Definition>} */ (
  import.meta.glob("../questionnaires/*.json", { eager: true, import: "default" })
);
const definitions = new Map(
  Object.entries(files).map(([path, def]) => [path.replace(/^.*\/|\.json$/g, ""), def]),
);

const MAX_BODY = 64 * 1024;
const TOKEN = /^[\w-]{16,64}$/;

/** @param {unknown} data @param {number} [status] */
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** @param {number} status @param {string} error */
const fail = (status, error) => json({ ok: false, error }, status);

/**
 * @param {Request} request
 * @returns {Promise<Record<string, unknown> | null>} the body's answers, or null if unusable
 */
const readAnswers = async (request) => {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text);
    const a = body?.answers;
    return typeof a === "object" && a !== null && !Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
};

/**
 * Only answers to questions that exist; nothing else reaches the database
 * @param {Definition} def
 * @param {Record<string, unknown>} answers
 */
const known = (def, answers) =>
  Object.fromEntries(
    def.questions.filter((q) => q.id in answers).map((q) => [q.id, answers[q.id]]),
  );

/** @param {string} text */
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

/**
 * A general questionnaire: read it, or submit it
 * @param {Request} request @param {Env} env @param {string} slug
 */
const general = async (request, env, slug) => {
  const definition = definitions.get(slug);
  if (!definition || definition.audience === "invite") return fail(404, "not found");

  if (request.method === "GET") return json({ slug, definition });
  if (request.method !== "POST") return fail(405, "method not allowed");

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.SUBMIT_LIMIT && !(await env.SUBMIT_LIMIT.limit({ key: ip })).success) {
    return fail(429, "too many submissions");
  }
  const sent = await readAnswers(request);
  if (!sent) return fail(400, "bad request");
  const problem = firstProblem(definition, sent);
  if (problem) return json({ ok: false, problem }, 422);

  await env.DB.prepare(
    "INSERT INTO responses (id, questionnaire, answers, submitted_at) VALUES (?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      slug,
      JSON.stringify(resolve(definition, sent).answers),
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true });
};

/**
 * A customer's link: read it with their progress, save progress, or submit
 * @param {Request} request @param {Env} env @param {string} token
 */
const invite = async (request, env, token) => {
  if (!TOKEN.test(token)) return fail(404, "not found");
  const row = await env.DB.prepare(
    "SELECT questionnaire, customer, vars, answers, position, updated_at, submitted_at FROM invites WHERE token = ?",
  )
    .bind(token)
    .first();
  const definition = row && definitions.get(row.questionnaire);
  if (!definition) return fail(404, "not found");

  if (request.method === "GET") {
    return json({
      slug: row.questionnaire,
      definition,
      vars: { ...parse(row.vars), customer: row.customer },
      answers: row.submitted_at ? {} : parse(row.answers),
      position: row.position,
      updatedAt: row.updated_at,
      submitted: Boolean(row.submitted_at),
    });
  }
  if (request.method !== "PUT" && request.method !== "POST") return fail(405, "method not allowed");
  if (row.submitted_at) return fail(409, "already submitted");

  const sent = await readAnswers(request.clone());
  if (!sent) return fail(400, "bad request");
  const now = new Date().toISOString();

  if (request.method === "PUT") {
    const { position } = await request.json();
    await env.DB.prepare(
      "UPDATE invites SET answers = ?, position = ?, updated_at = ? WHERE token = ? AND submitted_at IS NULL",
    )
      .bind(
        JSON.stringify(known(definition, sent)),
        typeof position === "string" ? position.slice(0, 64) : null,
        now,
        token,
      )
      .run();
    return json({ ok: true });
  }

  const problem = firstProblem(definition, sent);
  if (problem) return json({ ok: false, problem }, 422);
  await env.DB.prepare(
    "UPDATE invites SET answers = ?, position = NULL, updated_at = ?, submitted_at = ? WHERE token = ? AND submitted_at IS NULL",
  )
    .bind(JSON.stringify(resolve(definition, sent).answers), now, now, token)
    .run();
  return json({ ok: true });
};

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const [, api, kind, id, ...rest] = new URL(request.url).pathname.split("/");
    if (api !== "api" || !id || rest.length) return fail(404, "not found");
    try {
      if (kind === "q") return await general(request, env, id);
      if (kind === "i") return await invite(request, env, id);
    } catch (e) {
      console.error(e);
      return fail(500, "something went wrong");
    }
    return fail(404, "not found");
  },
};
