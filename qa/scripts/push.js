// @ts-check

// Imports questionnaires written here into the site, as /admin does.
//
//   pnpm push [name ...] [--local]
//
// With no names, every file in questionnaires/ is sent. One that the site
// already has word for word is left alone; anything else becomes its next
// revision. --local sends to the development server instead

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { connect } from "./admin.js";

const args = process.argv.slice(2);
const local = args.includes("--local");
const dir = new URL("../questionnaires/", import.meta.url);
const named = args.filter((a) => a !== "--local").map((a) => a.replace(/\.json$/, ""));
const slugs = named.length
  ? named
  : readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));

const { site, call } = connect(local);
let failed = false;

for (const slug of slugs) {
  const file = new URL(`${slug}.json`, dir);
  if (!existsSync(file)) {
    console.error(`${slug}: there is no questionnaires/${slug}.json`);
    failed = true;
    continue;
  }
  const { status, data } = await call("PUT", `questionnaires/${encodeURIComponent(slug)}`, readFileSync(file, "utf8"));
  if (!data.ok) {
    for (const error of data.errors ?? [data.error ?? `http ${status}`]) console.error(`${slug}: ${error}`);
    failed = true;
    continue;
  }
  for (const warning of data.warnings) console.error(`${slug}: ${warning}`);
  console.log(data.unchanged ? `${slug}: unchanged` : `${slug}: revision ${data.revision} at ${site}/${slug}`);
}

process.exit(failed ? 1 : 0);
