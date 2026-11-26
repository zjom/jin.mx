// @ts-check

// Refuses to build when a questionnaire file is malformed

import { readdirSync, readFileSync } from "node:fs";
import { lint } from "../shared/schema.js";
import { LANGS, WORDS } from "../shared/words.js";

const dir = new URL("../questionnaires/", import.meta.url);
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  /** @type {string[]} */
  let errors;
  try {
    errors = lint(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(file)) errors.push("file name must be lowercase letters, digits and -");
    if (file === "for.json" || file === "api.json") errors.push("this name is taken by the site itself");
  } catch (e) {
    errors = [`not valid JSON: ${/** @type {Error} */ (e).message}`];
  }
  for (const error of errors) console.error(`questionnaires/${file}: ${error}`);
  failed ||= errors.length > 0;
}

// The site's own phrases must exist in every language it offers
for (const lang of LANGS) {
  for (const key of Object.keys(WORDS.en)) {
    if (WORDS[lang]?.[key]) continue;
    console.error(`shared/words.js: "${key}" is missing in ${lang}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
