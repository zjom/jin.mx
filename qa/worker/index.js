// @ts-check

import { fileProblem, fileRules, firstProblem, languagesOf, resolve } from "../shared/schema.js";
import { words } from "../shared/words.js";
import { identify } from "./access.js";
import { admin } from "./admin.js";
import { CURRENT, fail, json, parse } from "./http.js";
import { notify } from "./notify.js";

/**
 * @typedef {import("../shared/schema.js").Definition} Definition
 * @typedef {{ limit: (o: { key: string }) => Promise<{ success: boolean }> }} Limiter
 * @typedef {{ DB: any, FILES: any, ASSETS: { fetch: (r: Request) => Promise<Response> }, SUBMIT_LIMIT?: Limiter, UPLOAD_LIMIT?: Limiter } & import("./access.js").AccessEnv & import("./notify.js").NotifyEnv} Env
 * @typedef {{ waitUntil: (p: Promise<unknown>) => void }} Ctx
 */

const MAX_BODY = 64 * 1024;
const TOKEN = /^[\w-]{16,64}$/;

/**
 * @param {Request} request
 * @returns {Promise<{ answers: Record<string, unknown>, position: unknown, lang: unknown } | null>} the body, or null if unusable
 */
const readBody = async (request) => {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(text);
    const a = body?.answers;
    if (typeof a !== "object" || a === null || Array.isArray(a)) return null;
    return { answers: a, position: body.position, lang: body.lang };
  } catch {
    return null;
  }
};

/**
 * @param {Definition} def @param {unknown} lang what the page says it is showing
 * @returns {string | null} that language, if the questionnaire is written in it
 */
const langIn = (def, lang) => (languagesOf(def).includes(/** @type {string} */ (lang)) ? /** @type {string} */ (lang) : null);

/**
 * Only answers to questions that exist; nothing else reaches the database
 * @param {Definition} def
 * @param {Record<string, unknown>} answers
 */
const known = (def, answers) =>
  Object.fromEntries(
    def.questions.filter((q) => q.id in answers).map((q) => [q.id, answers[q.id]]),
  );

/** @param {Request} request @param {Limiter | undefined} limiter */
const allowed = async (request, limiter) =>
  !limiter || (await limiter.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" })).success;

/**
 * Stores one file for a file question. The key it returns is what the answer
 * holds; scope ties it to one questionnaire or one customer link
 * @param {Request} request @param {Env} env @param {Definition} definition
 * @param {string} scope @param {string} questionId
 */
const upload = async (request, env, definition, scope, questionId) => {
  const q = definition.questions.find((x) => x.id === questionId && x.type === "file");
  if (!q || request.method !== "POST") return fail(404, "not found");
  if (!(await allowed(request, env.UPLOAD_LIMIT))) return fail(429, "too many uploads");
  if (Number(request.headers.get("content-length")) > fileRules(q).maxBytes) return fail(413, "too large");

  let name;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "")
      .replace(/[\u0000-\u001f\\/]/g, "")
      .slice(0, 255);
  } catch {
    return fail(400, "bad request");
  }
  const body = await request.arrayBuffer();
  const problem = fileProblem(q, { name, size: body.byteLength });
  if (problem) return fail(body.byteLength > fileRules(q).maxBytes ? 413 : 415, problem);

  const type = request.headers.get("content-type") ?? "application/octet-stream";
  const key = `${scope}/${questionId}/${crypto.randomUUID()}`;
  await env.FILES.put(key, body, {
    httpMetadata: {
      contentType: type,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
  return json({ ok: true, file: { key, name, size: body.byteLength, type } });
};

/**
 * @param {Env} env @param {Definition} definition
 * @param {Record<string, unknown>} answers already checked for shape
 * @param {string} scope @param {string} lang
 * @returns {Promise<import("../shared/schema.js").Problem | null>} a file answer that names something we do not hold
 */
const missingFile = async (env, definition, answers, scope, lang) => {
  for (const q of definition.questions) {
    if (q.type !== "file") continue;
    for (const file of /** @type {{ key: string }[]} */ (answers[q.id] ?? [])) {
      if (!file.key.startsWith(`${scope}/${q.id}/`) || !(await env.FILES.head(file.key))) {
        return { id: q.id, message: words(lang)("fileAgain") };
      }
    }
  }
  return null;
};

/**
 * A general questionnaire: read it, or submit it
 * @param {Request} request @param {Env} env @param {Ctx} ctx @param {string} slug @param {string[]} rest
 */
const general = async (request, env, ctx, slug, rest) => {
  const found = await env.DB.prepare(
    `SELECT q.revision, r.definition ${CURRENT} WHERE q.slug = ? AND q.archived_at IS NULL`,
  )
    .bind(slug)
    .first();
  const definition = /** @type {Definition | null} */ (found && JSON.parse(found.definition));
  if (!definition || definition.audience === "invite") return fail(404, "not found");

  const scope = `q/${slug}`;
  if (rest[0] === "files") return upload(request, env, definition, scope, rest[1]);
  if (request.method === "GET") return json({ slug, definition });
  if (request.method !== "POST") return fail(405, "method not allowed");

  if (!(await allowed(request, env.SUBMIT_LIMIT))) return fail(429, "too many submissions");
  const body = await readBody(request);
  if (!body) return fail(400, "bad request");
  const sent = body.answers;
  const lang = langIn(definition, body.lang) ?? languagesOf(definition)[0];
  const problem =
    firstProblem(definition, sent, lang) ??
    (await missingFile(env, definition, resolve(definition, sent).answers, scope, lang));
  if (problem) return json({ ok: false, problem }, 422);

  const id = crypto.randomUUID();
  const answers = resolve(definition, sent).answers;
  await env.DB.prepare(
    "INSERT INTO responses (id, questionnaire, answers, lang, revision, submitted_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, slug, JSON.stringify(answers), lang, found.revision, new Date().toISOString())
    .run();
  const { origin } = new URL(request.url);
  ctx.waitUntil(notify(env, { slug, definition, answers, lang, origin, path: `response/${id}` }));
  return json({ ok: true });
};

/**
 * A customer's link: read it with their progress, save progress, or submit
 * @param {Request} request @param {Env} env @param {Ctx} ctx @param {string} token @param {string[]} rest
 */
const invite = async (request, env, ctx, token, rest) => {
  if (!TOKEN.test(token)) return fail(404, "not found");
  // A link that was revoked, or whose questionnaire was archived, is not found
  const row = await env.DB.prepare(
    `SELECT i.questionnaire, i.customer, i.vars, i.answers, i.position, i.lang, i.updated_at, i.submitted_at,
       q.revision, r.definition
     FROM invites i JOIN questionnaires q ON q.slug = i.questionnaire AND q.archived_at IS NULL
     JOIN revisions r ON r.slug = q.slug AND r.revision = q.revision
     WHERE i.token = ? AND i.revoked_at IS NULL`,
  )
    .bind(token)
    .first();
  if (!row) return fail(404, "not found");
  const definition = /** @type {Definition} */ (JSON.parse(row.definition));

  const scope = `i/${token}`;
  if (rest[0] === "files") {
    if (row.submitted_at) return fail(409, "already submitted");
    return upload(request, env, definition, scope, rest[1]);
  }
  if (request.method === "GET") {
    return json({
      slug: row.questionnaire,
      definition,
      vars: { ...parse(row.vars), customer: row.customer },
      answers: row.submitted_at ? {} : parse(row.answers),
      position: row.position,
      lang: langIn(definition, row.lang),
      updatedAt: row.updated_at,
      submitted: Boolean(row.submitted_at),
    });
  }
  if (request.method !== "PUT" && request.method !== "POST") return fail(405, "method not allowed");
  if (row.submitted_at) return fail(409, "already submitted");

  const body = await readBody(request);
  if (!body) return fail(400, "bad request");
  const sent = body.answers;
  // The language last used is kept, so the link opens in it on any device
  const lang = langIn(definition, body.lang) ?? langIn(definition, row.lang);
  const now = new Date().toISOString();

  if (request.method === "PUT") {
    await env.DB.prepare(
      "UPDATE invites SET answers = ?, position = ?, lang = ?, updated_at = ? WHERE token = ? AND submitted_at IS NULL",
    )
      .bind(
        JSON.stringify(known(definition, sent)),
        typeof body.position === "string" ? body.position.slice(0, 64) : null,
        lang,
        now,
        token,
      )
      .run();
    return json({ ok: true });
  }

  const said = lang ?? languagesOf(definition)[0];
  const problem =
    firstProblem(definition, sent, said) ??
    (await missingFile(env, definition, resolve(definition, sent).answers, scope, said));
  if (problem) return json({ ok: false, problem }, 422);
  const answers = resolve(definition, sent).answers;
  const done = await env.DB.prepare(
    "UPDATE invites SET answers = ?, position = NULL, lang = ?, revision = ?, updated_at = ?, submitted_at = ? WHERE token = ? AND submitted_at IS NULL",
  )
    .bind(JSON.stringify(answers), said, row.revision, now, now, token)
    .run();
  // Sent twice at once, only the one that was saved is told
  if (done.meta.changes) {
    ctx.waitUntil(
      notify(env, {
        slug: row.questionnaire,
        definition,
        answers,
        lang: said,
        origin: new URL(request.url).origin,
        path: `invite/${token}`,
        customer: row.customer,
        vars: parse(row.vars),
      }),
    );
  }
  return json({ ok: true });
};

export default {
  /** @param {Request} request @param {Env} env @param {Ctx} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const [, api, kind, id, ...rest] = url.pathname.split("/");
    try {
      // /admin and /api/admin are for whoever Cloudflare Access let in
      if (api === "admin" || (api === "api" && kind === "admin")) {
        const who = await identify(request, env);
        if (!who) return fail(403, "forbidden");
        if (api === "api") return await admin(request, env, who, id ? [id, ...rest] : []);
        // The page is one address; where it is inside itself comes after the #
        return url.pathname === "/admin" ? env.ASSETS.fetch(request) : Response.redirect(`${url.origin}/admin`, 302);
      }
      // /api/<kind>/<id>, or /api/<kind>/<id>/files/<question> to add a file
      const shaped = rest.length === 0 || (rest.length === 2 && rest[0] === "files");
      if (api !== "api" || !id || !shaped) return fail(404, "not found");
      if (kind === "q") return await general(request, env, ctx, id, rest);
      if (kind === "i") return await invite(request, env, ctx, id, rest);
    } catch (e) {
      console.error(e);
      return fail(500, "something went wrong");
    }
    return fail(404, "not found");
  },
};
