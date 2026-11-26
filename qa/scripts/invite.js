// @ts-check

// Creates a customer's own link to a questionnaire.
//
//   pnpm invite <questionnaire> "<customer name>" [key=value ...] [--local]
//
// The name fills {{customer}} in the questionnaire's text, and each key=value
// fills {{key}}. lang=zh is not a fill: it is the language the link opens in.
// --local makes the link on the development server instead

import { connect } from "./admin.js";

const args = process.argv.slice(2);
const local = args.includes("--local");
const [questionnaire, customer, ...pairs] = args.filter((a) => a !== "--local");

if (!questionnaire || !customer || pairs.some((p) => !p.includes("="))) {
  console.error('usage: pnpm invite <questionnaire> "<customer name>" [key=value ...] [--local]');
  process.exit(1);
}

const { lang = null, ...vars } = Object.fromEntries(
  pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]),
);
const { status, data } = await connect(local).call("POST", "invites", { questionnaire, customer, vars, lang });
if (!data.ok) {
  console.error(data.error ?? `http ${status}`);
  process.exit(1);
}
console.log(data.url);
