// @ts-check

/** @param {unknown} data @param {number} [status] */
export const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** @param {number} status @param {string} error */
export const fail = (status, error) => json({ ok: false, error }, status);

/** @param {string} text @returns {any} what it holds, or {} if it is not JSON */
export const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

// The current revision of a questionnaire that is being served
export const CURRENT = `FROM questionnaires q JOIN revisions r ON r.slug = q.slug AND r.revision = q.revision`;
