// @ts-check

// Who is asking for /admin. Cloudflare Access stands in front of it and signs
// every request it lets through; nothing here trusts a request without that
// signature, so a mistake in the Access setup closes the door instead of
// opening it

/**
 * @typedef {{ ACCESS_TEAM_DOMAIN?: string, ACCESS_AUD?: string }} AccessEnv
 */

const KEYS_FOR = 60 * 60 * 1000;
const REFETCH_AFTER = 60 * 1000;
const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

/** @type {{ team: string, at: number, keys: Map<string, CryptoKey> }} */
let held = { team: "", at: 0, keys: new Map() };

/** @param {string} part a base64url part of a token */
const bytes = (part) =>
  Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** @param {string} part */
const read = (part) => JSON.parse(new TextDecoder().decode(bytes(part)));

/**
 * The team's signing keys. They rotate, so a key we have not seen is looked
 * for once more, but not more than once a minute
 * @param {string} team @param {boolean} [again]
 */
const keysOf = async (team, again = false) => {
  const age = Date.now() - held.at;
  if (held.team === team && age < (again ? REFETCH_AFTER : KEYS_FOR)) return held.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access keys: http ${res.status}`);
  const { keys } = /** @type {{ keys: (JsonWebKey & { kid: string })[] }} */ (await res.json());
  const map = new Map();
  for (const jwk of keys) {
    map.set(
      jwk.kid,
      await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
    );
  }
  held = { team, at: Date.now(), keys: map };
  return map;
};

/**
 * @param {Request} request @param {AccessEnv} env
 * @returns {Promise<string | null>} who Access says this is: an email, or the
 * name of a service token. null when it does not say, and then the answer is no
 */
export const identify = async (request, env) => {
  // Development has no Access in front of it. Cloudflare only hands this
  // worker requests for its own domain, so this cannot be reached from outside
  if (LOCAL.includes(new URL(request.url).hostname)) return "local";

  const team = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!team || !audience || !token) return null;
  try {
    const [head, body, signature, ...more] = token.split(".");
    if (!signature || more.length) return null;
    const { alg, kid } = read(head);
    if (alg !== "RS256") return null;
    const key = (await keysOf(team)).get(kid) ?? (await keysOf(team, true)).get(kid);
    if (!key) return null;
    const signed = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      bytes(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!signed) return null;

    const claims = read(body);
    const now = Date.now() / 1000;
    const forUs = [claims.aud].flat().includes(audience);
    if (claims.iss !== `https://${team}` || !forUs) return null;
    if (!(claims.exp > now) || claims.nbf > now + 60) return null;
    return claims.email || claims.common_name || claims.sub || null;
  } catch (e) {
    console.error(e);
    return null;
  }
};
