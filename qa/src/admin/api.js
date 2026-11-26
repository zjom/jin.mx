// @ts-check

export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const RELOADED = "qa:admin:reloaded";

/**
 * When the login runs out, Cloudflare Access answers with a redirect to its
 * sign-in page, which only a whole page can follow. Once is enough: if that
 * did not help, say so instead of reloading for ever
 * @returns {Promise<never>}
 */
const signInAgain = () => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED));
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    // no storage: one reload is still the best there is
  }
  if (Date.now() - last < 15000) throw new HttpError(401, "You are signed out. Reload the page to sign in.");
  location.reload();
  return new Promise(() => {});
};

/**
 * @param {string} method
 * @param {string} path what follows /api/admin/
 * @param {unknown} [body] sent as JSON; a string is sent as it is
 * @returns {Promise<any>} the answer; a 422 is an answer too, with what is wrong
 */
export const api = async (method, path, body) => {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    redirect: "manual",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  if (res.type === "opaqueredirect") return signInAgain();
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 422) throw new HttpError(res.status, data.error ?? `http ${res.status}`);
  return data;
};
