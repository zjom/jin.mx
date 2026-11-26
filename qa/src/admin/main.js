// @ts-check

// /admin: the questionnaires, their links, and what has been answered. One
// page; where it is inside itself is kept after the # so that back works

import "@fontsource-variable/geist/wght.css";
import "../style.css";
import "./admin.css";

import { languagesOf, slugProblem } from "../../shared/schema.js";
import { LANG_NAMES } from "../../shared/words.js";
import { h } from "../dom.js";
import { initTheme } from "../theme.js";
import { answersOf } from "./answers.js";
import { api } from "./api.js";

const app = /** @type {HTMLElement} */ (document.getElementById("app"));
initTheme(/** @type {HTMLButtonElement} */ (document.getElementById("theme")));

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
/** @param {string | null | undefined} iso */
const when = (iso) => (iso ? DATE.format(new Date(iso)) : "");

const STATUS = /** @type {Record<string, string>} */ ({
  waiting: "Not started",
  started: "In progress",
  sent: "Sent",
  revoked: "Revoked",
});

/** @param {string} href @param {string} text */
const crumb = (href, text) => h("a", { class: "crumb", href }, `← ${text}`);

/** @param {string} text @param {() => unknown} onclick @param {string} [cls] */
const act = (text, onclick, cls = "") => h("button", { class: `act ${cls}`, type: "button", onclick }, text);

/** @param {string} text @param {string} href @param {Record<string, any>} [more] */
const link = (text, href, more = {}) => h("a", { class: "act", href, ...more }, text);

/** @param {string} label @param {Node} field @param {string} [note] */
const labelled = (label, field, note) =>
  h("label", { class: "lab" }, h("span", {}, label), field, note && h("small", {}, note));

/**
 * Copies, and says so on the button for a moment
 * @param {string} text @param {string} [label]
 */
const copier = (text, label = "Copy link") => {
  const button = act(label, async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      prompt("Copy this link", text);
    }
    setTimeout(() => (button.textContent = label), 1600);
  });
  return button;
};

/** @param {string} slug */
const pathTo = (slug) => `#/q/${encodeURIComponent(slug)}`;

// --- the list ---------------------------------------------------------------

const home = async () => {
  const { questionnaires } = await api("GET", "questionnaires");
  return [
    h("p", { class: "eyebrow" }, "Admin"),
    h("h1", { class: "title" }, "Questionnaires"),
    h(
      "ul",
      { class: "rows" },
      questionnaires.map((/** @type {any} */ q) =>
        h(
          "li",
          { class: `row ${q.archived ? "is-off" : ""}` },
          h(
            "a",
            { class: "main", href: pathTo(q.slug) },
            h("span", { class: "name" }, q.title),
            h(
              "span",
              { class: "sub" },
              [
                `/${q.slug}`,
                q.languages.map((/** @type {string} */ l) => LANG_NAMES[l] ?? l).join(" "),
                q.audience === "invite" && "links only",
                q.archived && "archived",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
          h("span", { class: "meta" }, `${q.open} open`, h("br"), `${q.sent} sent`),
        ),
      ),
    ),
    !questionnaires.length && h("p", { class: "body" }, "There are none yet."),
    h("div", { class: "acts" }, link("Import a questionnaire", "#/import")),
  ];
};

// --- one questionnaire ------------------------------------------------------

/** @param {string} slug */
const questionnaire = async (slug) => {
  const [q, { invites }, { submissions }] = await Promise.all([
    api("GET", `questionnaires/${encodeURIComponent(slug)}`),
    api("GET", `invites?questionnaire=${encodeURIComponent(slug)}`),
    api("GET", `submissions?questionnaire=${encodeURIComponent(slug)}`),
  ]);
  const open = q.definition.audience !== "invite";
  const walkIns = submissions.filter((/** @type {any} */ s) => s.kind === "response");
  const latest = q.revisions[0];

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(q.definition, null, 2)], { type: "application/json" }));
    h("a", { href: url, download: `${slug}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const archive = async () => {
    if (!q.archived && !confirm(`Archive /${slug}? Its address and its links stop working until it is restored.`)) return;
    await api(q.archived ? "POST" : "DELETE", `questionnaires/${encodeURIComponent(slug)}${q.archived ? "/restore" : ""}`);
    render();
  };

  return [
    crumb("#/", "Questionnaires"),
    h("h1", { class: "title" }, q.title),
    h(
      "p",
      { class: "body" },
      `/${slug} · revision ${q.revision} · ${when(latest?.at)}`,
      q.archived && " · archived",
      h("br"),
      open ? "Anyone with the address can answer it." : "Only reachable through a link.",
    ),
    h(
      "div",
      { class: "acts" },
      !q.archived && link("New link", `${pathTo(slug)}/invite`),
      open && !q.archived && link("Open", `/${slug}`, { target: "_blank", rel: "noopener" }),
      link("Update", `#/import/${encodeURIComponent(slug)}`),
      act("Download JSON", download),
      link("Export CSV", `/api/admin/submissions?questionnaire=${encodeURIComponent(slug)}&format=csv`),
      act(q.archived ? "Restore" : "Archive", archive, "quiet"),
    ),

    h("h2", { class: "section" }, `Links · ${invites.length}`),
    invites.length
      ? h(
          "ul",
          { class: "rows" },
          invites.map((/** @type {any} */ i) => {
            const url = `${location.origin}/for/${i.token}`;
            const revoke = async () => {
              const off = i.status !== "revoked";
              if (off && !confirm(`Revoke the link for ${i.customer}? It stops working until it is restored.`)) return;
              await api(off ? "DELETE" : "POST", `invites/${i.token}${off ? "" : "/restore"}`);
              render();
            };
            return h(
              "li",
              { class: `row ${i.status === "revoked" ? "is-off" : ""}` },
              h(
                "a",
                { class: "main", href: `#/a/invite/${i.token}` },
                h("span", { class: "name" }, i.customer),
                h(
                  "span",
                  { class: "sub" },
                  [
                    STATUS[i.status],
                    i.status === "started" && `${i.answered} answered`,
                    when(i.submittedAt ?? (i.status === "started" ? i.updatedAt : i.createdAt)),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ),
              ),
              h(
                "span",
                { class: "meta" },
                i.status !== "revoked" && i.status !== "sent" && copier(url, "Copy"),
                i.status !== "sent" && act(i.status === "revoked" ? "Restore" : "Revoke", revoke, "quiet"),
              ),
            );
          }),
        )
      : h("p", { class: "note" }, "No links have been made for it."),

    (open || walkIns.length > 0) && h("h2", { class: "section" }, `Sent from its address · ${walkIns.length}`),
    walkIns.length > 0 &&
      h(
        "ul",
        { class: "rows" },
        walkIns.map((/** @type {any} */ s) =>
          h(
            "li",
            { class: "row" },
            h(
              "a",
              { class: "main", href: `#/a/response/${s.id}` },
              h("span", { class: "name" }, when(s.submittedAt)),
              h("span", { class: "sub" }, [LANG_NAMES[s.lang] ?? s.lang, `revision ${s.revision ?? "?"}`].filter(Boolean).join(" · ")),
            ),
          ),
        ),
      ),
    open && !walkIns.length && h("p", { class: "note" }, "Nothing has been sent yet."),
  ];
};

// --- a new link -------------------------------------------------------------

/** @param {string} slug */
const newLink = async (slug) => {
  const q = await api("GET", `questionnaires/${encodeURIComponent(slug)}`);
  const languages = languagesOf(q.definition);
  // Every {{name}} its text uses, besides the customer's own
  const names = [
    ...new Set([...JSON.stringify(q.definition).matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1])),
  ].filter((n) => n !== "customer");

  const customer = h("input", { class: "line", name: "customer", required: true, maxLength: 200, autocomplete: "off" });
  const fills = names.map((n) => h("input", { class: "line", name: n, autocomplete: "off" }));
  const lang = h(
    "select",
    { class: "line" },
    h("option", { value: "" }, "Their browser’s language"),
    languages.map((l) => h("option", { value: l }, LANG_NAMES[l] ?? l)),
  );
  const error = h("p", { class: "error", role: "alert" });
  const out = h("div", {});

  const form = h(
    "form",
    {
      class: "form",
      onsubmit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        error.textContent = "";
        try {
          const made = await api("POST", "invites", {
            questionnaire: slug,
            customer: customer.value,
            lang: lang.value || null,
            vars: Object.fromEntries(fills.map((f) => [f.name, f.value])),
          });
          const shown = h("input", { class: "line", readOnly: true, value: made.url, onfocus: () => shown.select() });
          out.replaceChildren(
            h("h2", { class: "section" }, `For ${customer.value.trim()}`),
            shown,
            h(
              "div",
              { class: "acts" },
              copier(made.url),
              "share" in navigator && act("Share", () => navigator.share({ url: made.url }).catch(() => {})),
              link("Done", pathTo(slug)),
            ),
          );
          form.reset();
          out.scrollIntoView({ block: "nearest" });
        } catch (e) {
          error.textContent = /** @type {Error} */ (e).message;
        }
      },
    },
    labelled("Customer", customer, "Fills {{customer}} in its text."),
    fills.map((f) => labelled(f.name, f, `Fills {{${f.name}}}.`)),
    languages.length > 1 && labelled("Opens in", lang),
    h("button", { class: "send", type: "submit" }, "Make the link"),
    error,
  );

  return [crumb(pathTo(slug), q.title), h("h1", { class: "title" }, "A new link"), form, out];
};

// --- import -----------------------------------------------------------------

/** @param {string} [slug] the questionnaire to update; a new one if left out */
const importer = async (slug) => {
  const existing = slug ? await api("GET", `questionnaires/${encodeURIComponent(slug)}`) : null;

  const name = h("input", {
    class: "line",
    value: slug ?? "",
    readOnly: Boolean(slug),
    placeholder: "discovery",
    autocapitalize: "none",
    autocomplete: "off",
    spellcheck: false,
  });
  const text = h("textarea", {
    class: "line code",
    rows: 12,
    spellcheck: false,
    autocapitalize: "none",
    placeholder: '{ "title": "…", "questions": [ … ] }',
    value: existing ? JSON.stringify(existing.definition, null, 2) : "",
  });
  const result = h("div", { class: "result", role: "status" });
  const clear = () => result.replaceChildren();
  name.addEventListener("input", clear);
  text.addEventListener("input", clear);

  const file = h("input", {
    type: "file",
    class: "sr",
    accept: ".json,application/json",
    onchange: async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      text.value = await picked.text();
      if (!slug && !name.value) {
        name.value = picked.name
          .replace(/\.json$/i, "")
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
      file.value = "";
      clear();
    },
  });

  /** @param {boolean} dry only check */
  const send = async (dry) => {
    const to = name.value.trim();
    const named = slugProblem(to);
    if (named) return result.replaceChildren(h("ul", { class: "problems" }, h("li", {}, named)));
    if (!text.value.trim()) return result.replaceChildren(h("ul", { class: "problems" }, h("li", {}, "there is nothing to import")));
    try {
      const r = await api("PUT", `questionnaires/${encodeURIComponent(to)}${dry ? "?dry" : ""}`, text.value);
      if (!r.ok) {
        return result.replaceChildren(
          h("p", { class: "note" }, `${r.errors.length} to fix before it can be saved:`),
          h("ul", { class: "problems" }, r.errors.map((/** @type {string} */ e) => h("li", {}, e))),
        );
      }
      if (r.saved) return void (location.hash = pathTo(to));
      if (r.unchanged) return result.replaceChildren(h("p", { class: "note" }, `Nothing to save: /${to} already says exactly this.`));
      result.replaceChildren(
        h(
          "p",
          { class: "note" },
          r.isNew ? `It is well formed, and will be new at /${to}.` : `It is well formed, and will be revision ${r.revision} of /${to}.`,
        ),
        r.warnings.length > 0 && h("ul", { class: "problems" }, r.warnings.map((/** @type {string} */ w) => h("li", {}, w))),
        h("button", { class: "send", type: "button", onclick: () => send(false) }, r.warnings.length ? "Save anyway" : "Save"),
      );
      result.scrollIntoView({ block: "nearest" });
    } catch (e) {
      result.replaceChildren(h("ul", { class: "problems" }, h("li", {}, /** @type {Error} */ (e).message)));
    }
  };

  return [
    existing ? crumb(pathTo(/** @type {string} */ (slug)), existing.title) : crumb("#/", "Questionnaires"),
    h("h1", { class: "title" }, existing ? "Update it" : "Import a questionnaire"),
    h(
      "div",
      { class: "form" },
      labelled("Name", name, existing ? undefined : "Also its address: qa.jin.mx/name."),
      h(
        "div",
        { class: "lab" },
        h("span", {}, "JSON"),
        text,
        h("label", { class: "pick" }, file, "Choose a file instead"),
      ),
      h("button", { class: "send", type: "button", onclick: () => send(true) }, "Check it"),
      result,
    ),
  ];
};

// --- answers ----------------------------------------------------------------

/** @param {string} kind invite or response @param {string} id */
const answers = async (kind, id) => {
  const a = await api("GET", `${kind === "invite" ? "invites" : "submissions"}/${encodeURIComponent(id)}`);
  const url = `${location.origin}/for/${id}`;
  return [
    crumb(pathTo(a.questionnaire), `/${a.questionnaire}`),
    h("h1", { class: "title" }, a.customer ?? "From its address"),
    h(
      "p",
      { class: "body" },
      [
        STATUS[a.status],
        when(a.submittedAt ?? a.updatedAt),
        a.lang && (LANG_NAMES[a.lang] ?? a.lang),
        a.submittedAt && a.revision && `revision ${a.revision}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
    kind === "invite" && (a.status === "waiting" || a.status === "started") && h("div", { class: "acts" }, copier(url)),
    a.definition ? answersOf(a) : h("p", { class: "note" }, "Its questionnaire is gone."),
  ];
};

// --- which of them is showing ----------------------------------------------

let turn = 0;

const render = async () => {
  const mine = ++turn;
  let parts;
  try {
    parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = [];
  }
  const [first, second, third] = parts;
  let view = home;
  if (first === "import") view = () => importer(second);
  else if (first === "q" && second) view = third === "invite" ? () => newLink(second) : () => questionnaire(second);
  else if (first === "a" && third) view = () => answers(second, third);

  app.setAttribute("aria-busy", "true");
  /** @type {any[]} */
  let nodes;
  try {
    nodes = await view();
  } catch (e) {
    const gone = /** @type {any} */ (e).status === 404;
    nodes = [
      crumb("#/", "Questionnaires"),
      h("h1", { class: "title" }, gone ? "There is nothing here." : "That did not work."),
      h("p", { class: "body" }, gone ? "It may have been removed." : /** @type {Error} */ (e).message),
    ];
  }
  // Another place was asked for while this one was loading
  if (mine !== turn) return;
  app.replaceChildren(...nodes.flat().filter(Boolean));
  app.removeAttribute("aria-busy");
  scrollTo(0, 0);
};

addEventListener("hashchange", render);
render();
