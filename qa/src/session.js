// @ts-check

// Where a questionnaire comes from and where its answers go. A general
// questionnaire keeps progress on this device until it is submitted; a
// customer link keeps it on the server, so the same url resumes anywhere

/**
 * @typedef {import("../shared/schema.js").Definition} Definition
 * @typedef {import("../shared/schema.js").Answers} Answers
 * @typedef {import("../shared/schema.js").Problem} Problem
 *
 * @typedef {{ kind: "general", slug: string } | { kind: "invite", token: string }} Route
 *
 * @typedef {object} Session
 * @property {Definition} definition
 * @property {Record<string, string>} vars filled into {{name}} in the text
 * @property {Answers} answers
 * @property {string | null} position id of the question to resume at
 * @property {boolean} submitted
 * @property {(answers: Answers, position: string) => void} save
 * @property {() => void} flush send anything unsaved now; the page is going away
 * @property {(answers: Answers) => Promise<{ ok: true } | { ok: false, problem: Problem }>} submit
 * @property {(fn: (online: boolean) => void) => void} onStatus
 * @property {(questionId: string, file: File, onProgress: (done: number) => void) => Promise<import("../shared/schema.js").StoredFile>} upload
 */

const SAVE_DELAY = 600;
const MAX_RETRY = 30000;

export class HttpError extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`http ${status}`);
    this.status = status;
  }
}

/**
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @returns {Promise<any>} the response; a 422 is an answer, not an error
 */
const api = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 422) throw new HttpError(res.status);
  return res.json();
};

/**
 * Sends one file, reporting how much has gone. fetch cannot report that
 * @param {string} url
 * @param {File} file
 * @param {(done: number) => void} onProgress 0 to 1
 * @returns {Promise<import("../shared/schema.js").StoredFile>}
 */
const sendFile = (url, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status !== 200) return reject(new HttpError(xhr.status));
      resolve(JSON.parse(xhr.responseText).file);
    };
    xhr.onerror = () => reject(new HttpError(0));
    xhr.send(file);
  });

/** @param {string} key */
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};

/** @param {string} key @param {unknown} [value] omitted: forget the key */
const write = (key, value) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage is full or blocked; progress lasts for this visit only
  }
};

/** @param {string} slug @returns {Promise<Session>} */
const openGeneral = async (slug) => {
  const url = `/api/q/${encodeURIComponent(slug)}`;
  const key = `qa:${slug}`;
  const { definition } = await api("GET", url);
  const saved = read(key);
  return {
    definition,
    vars: {},
    answers: saved?.answers ?? {},
    position: saved?.position ?? null,
    submitted: false,
    save: (answers, position) => write(key, { answers, position }),
    flush: () => {},
    submit: async (answers) => {
      const result = await api("POST", url, { answers });
      if (result.ok) write(key);
      return result;
    },
    onStatus: () => {},
    upload: (id, file, onProgress) => sendFile(`${url}/files/${encodeURIComponent(id)}`, file, onProgress),
  };
};

/** @param {string} token @returns {Promise<Session>} */
const openInvite = async (token) => {
  const url = `/api/i/${encodeURIComponent(token)}`;
  // Holds only what the server has not confirmed yet
  const key = `qa:for:${token}`;
  const remote = await api("GET", url);

  // Unless the server has heard from another device since, it wins
  /** @type {{ answers: Answers, position: string, at: number } | null} */
  let pending = read(key);
  if (remote.submitted || !(pending && pending.at > Date.parse(remote.updatedAt))) {
    pending = null;
    write(key);
  }
  let timer = 0;
  let sending = false;
  let failures = 0;
  /** @type {(online: boolean) => void} */
  let report = () => {};

  const push = async () => {
    clearTimeout(timer);
    if (sending || !pending) return;
    const body = pending;
    sending = true;
    try {
      await api("PUT", url, body);
      failures = 0;
      if (pending === body) {
        pending = null;
        write(key);
      }
      report(true);
    } catch (e) {
      // Submitted or withdrawn elsewhere: there is nothing left to save to
      if (e instanceof HttpError && (e.status === 409 || e.status === 404)) {
        pending = null;
        write(key);
      } else {
        failures++;
        report(false);
      }
    } finally {
      sending = false;
      if (pending) timer = window.setTimeout(push, failures ? Math.min(MAX_RETRY, 500 * 2 ** failures) : 0);
    }
  };

  window.addEventListener("online", push);
  if (pending) push();

  return {
    definition: remote.definition,
    vars: remote.vars,
    answers: pending?.answers ?? remote.answers,
    position: pending?.position ?? remote.position,
    submitted: remote.submitted,
    save: (answers, position) => {
      pending = structuredClone({ answers, position, at: Date.now() });
      write(key, pending);
      clearTimeout(timer);
      timer = window.setTimeout(push, SAVE_DELAY);
    },
    flush: () => {
      if (!pending) return;
      clearTimeout(timer);
      fetch(url, {
        method: "PUT",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pending),
      }).catch(() => {});
    },
    submit: async (answers) => {
      clearTimeout(timer);
      const result = await api("POST", url, { answers });
      if (result.ok) {
        pending = null;
        write(key);
      }
      return result;
    },
    onStatus: (fn) => {
      report = fn;
    },
    upload: (id, file, onProgress) => sendFile(`${url}/files/${encodeURIComponent(id)}`, file, onProgress),
  };
};

/** @param {Route} route @returns {Promise<Session>} */
export const openSession = (route) =>
  route.kind === "general" ? openGeneral(route.slug) : openInvite(route.token);
