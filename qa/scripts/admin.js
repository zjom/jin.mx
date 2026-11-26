// @ts-check

// How the scripts here reach /api/admin: the same way the admin page does,
// except that they sign in with a Cloudflare Access service token

const SITE = "https://qa.jin.mx";
const LOCAL = process.env.QA_LOCAL ?? "http://localhost:5173";

/**
 * @param {boolean} local the development server instead of the site
 * @returns {{ site: string, call: (method: string, path: string, body?: unknown) => Promise<{ status: number, data: any }> }}
 */
export const connect = (local) => {
  const { CF_ACCESS_CLIENT_ID: id, CF_ACCESS_CLIENT_SECRET: secret } = process.env;
  if (!local && !(id && secret)) {
    console.error("set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to an Access service token, or use --local");
    process.exit(1);
  }
  const site = local ? LOCAL : SITE;
  return {
    site,
    async call(method, path, body) {
      /** @type {Record<string, string>} */
      const headers = local ? {} : { "CF-Access-Client-Id": String(id), "CF-Access-Client-Secret": String(secret) };
      if (body !== undefined) headers["content-type"] = "application/json";
      let res;
      try {
        res = await fetch(`${site}/api/admin/${path}`, {
          method,
          headers,
          redirect: "manual",
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        });
      } catch {
        console.error(local ? `nothing is answering at ${site}; is pnpm dev running?` : `could not reach ${site}`);
        process.exit(1);
      }
      // Access sends whoever it does not know to its sign-in page
      if (res.status >= 300 && res.status < 400) {
        console.error("Cloudflare Access did not accept the service token");
        process.exit(1);
      }
      return { status: res.status, data: await res.json().catch(() => ({})) };
    },
  };
};
