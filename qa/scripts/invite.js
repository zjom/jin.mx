// @ts-check

// Creates a customer's own link to a questionnaire.
//
//   pnpm invite <questionnaire> "<customer name>" [key=value ...] [--local]
//
// The name fills {{customer}} in the questionnaire's text, and each key=value
// fills {{key}}. --local writes to the development database instead

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const local = args.includes("--local");
const [slug, customer, ...pairs] = args.filter((a) => a !== "--local");

if (!slug || !customer || pairs.some((p) => !p.includes("="))) {
  console.error('usage: pnpm invite <questionnaire> "<customer name>" [key=value ...] [--local]');
  process.exit(1);
}
if (!existsSync(new URL(`../questionnaires/${slug}.json`, import.meta.url))) {
  console.error(`there is no questionnaires/${slug}.json`);
  process.exit(1);
}

const vars = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const token = randomBytes(16).toString("base64url");
const now = new Date().toISOString();

/** @param {string} s */
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const sql = `INSERT INTO invites (token, questionnaire, customer, vars, created_at, updated_at) VALUES (${[
  token,
  slug,
  customer,
  JSON.stringify(vars),
  now,
  now,
]
  .map(quote)
  .join(", ")})`;

const run = spawnSync(
  "pnpm",
  ["exec", "wrangler", "d1", "execute", "qa", local ? "--local" : "--remote", "--command", sql],
  { cwd: new URL("..", import.meta.url), stdio: ["inherit", "ignore", "inherit"] },
);
if (run.status !== 0) process.exit(run.status ?? 1);

console.log(`${local ? "http://localhost:5173" : "https://qa.jin.mx"}/for/${token}`);
