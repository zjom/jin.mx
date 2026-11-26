// @ts-check

// A questionnaire as a form to read and to change: every question in order,
// drawn as it is asked, with its wording and its settings editable in place

import { languagesOf, lint, localize, TYPES, WITH_OPTIONS } from "../../shared/schema.js";
import { LANG_NAMES, LANG_TAGS, LANGS, words } from "../../shared/words.js";
import { h } from "../dom.js";
import { renderField } from "../fields.js";
import {
  addQuestion,
  duplicate,
  isNumeric,
  isRecord,
  move,
  opOf,
  OPS,
  problemsByQuestion,
  readText,
  renameId,
  setLanguages,
  SETTINGS,
  setType,
  slug,
  unique,
  valuesOf,
  withOp,
  writeText,
} from "./draft.js";

const LENGTH = ["text", "long", "email", "url", "tel"];

/** @param {string} type @param {string} key @returns {string} what a setting is called for this type */
const nameOf = (type, key) => {
  const length = LENGTH.includes(type);
  if (key === "min") return length ? "Shortest, in characters" : type === "multi" ? "Choose at least" : "Lowest";
  if (key === "max") {
    if (length) return "Longest, in characters";
    return { multi: "Choose at most", rating: "Out of", file: "Files at most" }[type] ?? "Highest";
  }
  return (
    {
      placeholder: "Placeholder",
      step: "Step",
      integer: "Whole numbers only",
      prefix: "Before the number",
      suffix: "After the number",
      yes: "Yes reads",
      no: "No reads",
      label: "The agreement reads",
      earliest: "Earliest",
      latest: "Latest",
      accept: "File types",
      maxSize: "Megabytes each",
    }[key] ?? key
  );
};

/** @param {HTMLTextAreaElement} t */
const grow = (t) => {
  t.style.height = "auto";
  // Not in view yet: let it be, and fit() will come back for it
  t.style.height = t.scrollHeight ? `${t.scrollHeight}px` : "";
};

/** @param {string} text @param {() => unknown} onclick @param {Record<string, any>} [more] */
const tool = (text, onclick, more = {}) => h("button", { class: "tool", type: "button", onclick, ...more }, text);

/** @param {string} label @param {Node | Node[]} control @param {string} [cls] */
const setting = (label, control, cls = "") => h("label", { class: `set ${cls}` }, h("span", {}, label), control);

/** @param {string} label @param {boolean} checked @param {(on: boolean) => void} onchange */
const check = (label, checked, onchange) => {
  const input = h("input", { class: "sr", type: "checkbox", checked, onchange: () => onchange(input.checked) });
  return h("label", { class: "check" }, input, h("span", {}, label));
};

/**
 * @param {Record<string, any>} draft the definition, which is changed in place; its questions are all objects
 * @param {{ onChange: () => void }} on
 * @returns {{ el: HTMLElement, draft: Record<string, any>, fit: () => void }}
 */
export const mountEditor = (draft, { onChange }) => {
  let langs = languagesOf(draft);
  let lang = langs[0];
  let several = langs.length > 1;
  // Options made here take their value from their label until they are saved
  const fresh = new WeakSet();
  // Questions whose settings are showing
  const open = new WeakSet();
  /** @type {{ el: HTMLElement, problems: HTMLElement }[]} */
  let blocks = [];
  const general = h("ul", { class: "problems" });
  const el = h("div", { class: "editor" });

  const fit = () => el.querySelectorAll("textarea.ed").forEach((t) => grow(/** @type {HTMLTextAreaElement} */ (t)));

  const recheck = () => {
    /** @type {string[]} */
    let errors;
    try {
      errors = lint(draft);
    } catch (e) {
      errors = [/** @type {Error} */ (e).message];
    }
    const found = problemsByQuestion(errors);
    /** @param {HTMLElement} list @param {string[]} messages */
    const say = (list, messages) => list.replaceChildren(...messages.map((m) => h("li", {}, m)));
    say(general, found.general);
    blocks.forEach((b, i) => say(b.problems, found.at.get(i) ?? []));
  };

  const changed = () => {
    recheck();
    onChange();
  };

  /** @param {Record<string, any>} q @returns {Record<string, any>} q as it reads in the language showing */
  const said = (q) => {
    try {
      return localize(/** @type {any} */ ({ title: "", languages: draft.languages, questions: [q] }), lang).questions[0];
    } catch {
      return q;
    }
  };

  // --- text ------------------------------------------------------------------

  /**
   * A text of the questionnaire, written where it is read
   * @param {() => unknown} get @param {(v: unknown) => void} set
   * @param {{ cls?: string, placeholder?: string, lines?: boolean, keep?: boolean, after?: () => void }} [o]
   *   lines: may run to several paragraphs; keep: stays in the file even when empty
   */
  const text = (get, set, { cls = "", placeholder = "", lines = false, keep = false, after } = {}) => {
    const t = h("textarea", {
      class: `ed ${cls}`,
      rows: 1,
      lang: LANG_TAGS[lang] ?? lang,
      value: readText(get(), lang),
      // Not yet written in this language: what it says in the first one
      placeholder: (several && readText(get(), langs[0])) || placeholder,
      "aria-label": placeholder,
    });
    t.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Enter" && !lines && !e.isComposing) e.preventDefault();
    });
    t.addEventListener("input", () => {
      if (!lines && t.value.includes("\n")) t.value = t.value.replace(/\s*\n\s*/g, " ");
      grow(t);
      let v = writeText(get(), t.value, lang, langs);
      if (v === undefined && keep) v = several ? {} : "";
      set(v);
      after?.();
      changed();
    });
    return t;
  };

  /** @param {Record<string, any>} o @param {string | number} k @returns {[() => unknown, (v: unknown) => void]} */
  const at = (o, k) => [
    () => o[k],
    (v) => {
      if (v === undefined) delete o[k];
      else o[k] = v;
    },
  ];

  /** @param {"submit" | "outro"} part @param {string} k @returns {[() => unknown, (v: unknown) => void]} */
  const inPart = (part, k) => [
    () => (isRecord(draft[part]) ? draft[part][k] : undefined),
    (v) => {
      const p = isRecord(draft[part]) ? draft[part] : (draft[part] = {});
      if (v === undefined) delete p[k];
      else p[k] = v;
      if (!Object.keys(p).length) delete draft[part];
    },
  ];

  // --- lists: options, rows, columns ----------------------------------------

  /**
   * @param {Record<string, any>} q @param {"options" | "rows" | "columns"} key
   * @param {string} noun what one of them is called @param {() => void} again draws the question afresh
   */
  const listOf = (q, key, noun, again) => {
    const idKey = key === "rows" ? "id" : "value";
    /** @type {any[]} */
    const list = Array.isArray(q[key]) ? q[key] : [];
    const multi = q.type === "multi";

    const add = () => {
      const all = Array.isArray(q[key]) ? q[key] : (q[key] = []);
      if (several) {
        const made = { [idKey]: unique(noun, all.map((o) => (isRecord(o) ? o[idKey] : o))), label: {} };
        fresh.add(made);
        all.push(made);
      } else all.push("");
      again();
      changed();
      /** @type {HTMLElement | null} */ (
        blocks[draft.questions.indexOf(q)]?.el.querySelector(`[data-list="${key}"] .opt-ed:last-of-type textarea`)
      )?.focus();
    };

    const rows = list.map((_, i) => {
      const item = () => list[i];
      const value = isRecord(item())
        ? h("input", {
            class: "val",
            value: String(item()[idKey] ?? ""),
            spellcheck: false,
            autocapitalize: "none",
            "aria-label": `${noun} ${idKey}`,
            title: `What is kept as the answer`,
            oninput: () => {
              const was = item()[idKey];
              fresh.delete(item());
              // A number stays a number
              item()[idKey] = typeof was === "number" && value.value.trim() !== "" && Number.isFinite(Number(value.value)) ? Number(value.value) : value.value;
              changed();
            },
          })
        : null;
      const label = text(
        () => (isRecord(item()) ? item().label : String(item())),
        (v) => {
          const o = item();
          if (isRecord(o)) {
            if (v === undefined) delete o.label;
            else o.label = v;
            if (fresh.has(o) && lang === langs[0]) {
              const others = list.filter((x) => x !== o).map((x) => (isRecord(x) ? x[idKey] : x));
              o[idKey] = unique(slug(readText(v, lang)) || noun, others);
              if (value) value.value = o[idKey];
            }
          } else if (!several && typeof o === "string") list[i] = v ?? "";
          // Something plain that now needs a label of its own
          else list[i] = { [idKey]: o, label: v ?? (several ? {} : "") };
        },
        { cls: "lbl", placeholder: (isRecord(item()) && String(item()[idKey] ?? "")) || `An ${noun}`.replace(/^An (?![aeiou])/, "A ") },
      );
      label.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
        if (e.key === "Enter" && !e.isComposing && i === list.length - 1) add();
      });
      /** @param {1 | -1} by */
      const shift = (by) => {
        if (!move(list, i, by)) return;
        again();
        changed();
      };
      return h(
        "div",
        { class: "opt opt-ed" },
        h("span", { class: "key", "aria-hidden": "true" }, key === "rows" ? "" : "abcdefghijklmnopqrstuvwxyz"[i] ?? ""),
        h("div", { class: "lblwrap" }, label, value),
        h(
          "span",
          { class: "tools" },
          tool("↑", () => shift(-1), { "aria-label": "Move up", disabled: i === 0 }),
          tool("↓", () => shift(1), { "aria-label": "Move down", disabled: i === list.length - 1 }),
          tool(
            "×",
            () => {
              list.splice(i, 1);
              again();
              changed();
            },
            { "aria-label": `Remove this ${noun}` },
          ),
        ),
      );
    });

    return h(
      "div",
      { class: "list", "data-list": key },
      key !== "options" && h("p", { class: "listname" }, key === "rows" ? "Rows" : "Columns"),
      h("div", { class: "opts" }, rows),
      h(
        "div",
        { class: "under" },
        tool(`+ ${noun}`, add),
        key === "options" &&
          (q.type === "choice" || multi) &&
          check("And “Other”, with room to write", q.other === true, (on) => {
            if (on) q.other = true;
            else delete q.other;
            changed();
          }),
      ),
    );
  };

  // --- the control, as it is asked ------------------------------------------

  /** @param {Record<string, any>} q @param {() => void} again */
  const controlOf = (q, again) => {
    if (q.type === "statement") return [];
    if (WITH_OPTIONS.includes(q.type)) return [listOf(q, "options", "option", again)];
    if (q.type === "matrix") return [listOf(q, "rows", "row", again), listOf(q, "columns", "column", again)];
    try {
      const drawn = renderField(/** @type {any} */ (said(q)), undefined, () => {}, "", {
        upload: () => Promise.reject(new Error("only a picture")),
        lang,
        t: words(lang),
      });
      return drawn ? [h("div", { class: "asked", inert: true }, drawn)] : [];
    } catch {
      return [h("p", { class: "note" }, "It cannot be drawn until what is below is fixed.")];
    }
  };

  // --- shown if --------------------------------------------------------------

  /** @param {Record<string, any>} q @returns {string} its condition in words, or nothing */
  const conditionSaid = (q) => {
    const c = q.showIf;
    if (!isRecord(c)) return "";
    const values = valuesOf(said(draft.questions.find((/** @type {any} */ p) => p.id === c.id) ?? {}));
    /** @param {unknown} v */
    const name = (v) => values?.find((o) => o.value === v)?.label ?? String(v);
    const how = {
      answered: "is answered",
      equals: `is ${name(c.equals)}`,
      not: `is not ${name(c.not)}`,
      in: `is one of ${(Array.isArray(c.in) ? c.in : []).map(name).join(", ")}`,
      includes: `includes ${name(c.includes)}`,
      atLeast: `is at least ${c.atLeast}`,
      atMost: `is at most ${c.atMost}`,
      between: `is ${c.atLeast} to ${c.atMost}`,
    }[opOf(c)];
    return `shown if ${c.id} ${how}`;
  };

  /**
   * @param {Record<string, any>} q @param {number} i
   * @param {() => void} again draws the question afresh @param {() => void} quietly notes a change without drawing
   */
  const conditionOf = (q, i, again, quietly) => {
    const c = isRecord(q.showIf) ? q.showIf : null;
    const earlier = draft.questions.slice(0, i).filter((/** @type {any} */ p) => p.type !== "statement" && typeof p.id === "string");
    const target = c ? draft.questions.find((/** @type {any} */ p) => p.id === c.id) : null;
    const values = target ? valuesOf(said(target)) : null;
    const op = c ? opOf(c) : "";

    const which = h(
      "select",
      {
        class: "line",
        onchange: () => {
          if (which.value) q.showIf = { id: which.value };
          else delete q.showIf;
          again();
        },
      },
      h("option", { value: "" }, "Always"),
      c && !earlier.includes(target) && h("option", { value: c.id, selected: true }, `${c.id} (not an earlier question)`),
      earlier.map((/** @type {any} */ p) => {
        const title = readText(p.title, lang) || readText(p.title, langs[0]);
        return h("option", { value: p.id, selected: p.id === c?.id }, `${p.id} · ${title.length > 40 ? `${title.slice(0, 40)}…` : title}`);
      }),
    );
    if (!c) return [setting("Shown", which, "wide")];

    const how = h(
      "select",
      {
        class: "line",
        onchange: () => {
          q.showIf = withOp(c, how.value, target && said(target));
          again();
        },
      },
      OPS.map(([value, label]) => h("option", { value, selected: value === op }, label)),
    );

    /** @param {string} key which part of the condition @returns {Node} somewhere to give one value */
    const one = (key) => {
      if (values && key !== "atLeast" && key !== "atMost") {
        const known = values.some((o) => o.value === c[key]);
        const pick = h(
          "select",
          {
            class: "line",
            onchange: () => {
              const picked = values[Number(pick.value)];
              if (!picked || pick.value === "") return;
              c[key] = picked.value;
              quietly();
            },
          },
          !known && h("option", { value: "", selected: true }, c[key] === undefined || c[key] === "" ? "Choose" : String(c[key])),
          values.map((o, j) => h("option", { value: String(j), selected: o.value === c[key] }, o.label)),
        );
        return pick;
      }
      const number = key === "atLeast" || key === "atMost" || isNumeric(target);
      const input = h("input", {
        class: "line",
        type: number ? "number" : "text",
        step: "any",
        value: c[key] ?? "",
        oninput: () => {
          c[key] = number ? (Number.isNaN(input.valueAsNumber) ? 0 : input.valueAsNumber) : input.value;
          quietly();
        },
      });
      return input;
    };

    /** @type {(Node | false)[]} */
    let value = [];
    if (op === "equals" || op === "not" || op === "includes" || op === "atLeast" || op === "atMost") value = [setting("This", one(op))];
    else if (op === "between") value = [setting("From", one("atLeast")), setting("To", one("atMost"))];
    else if (op === "in" && values) {
      const picked = Array.isArray(c.in) ? c.in : [];
      value = [
        h(
          "div",
          { class: "set wide" },
          h("span", {}, "Any of"),
          h(
            "div",
            { class: "checks" },
            values.map((o) =>
              check(o.label, picked.includes(o.value), (on) => {
                const now = Array.isArray(c.in) ? c.in : [];
                c.in = values.map((x) => x.value).filter((x) => (x === o.value ? on : now.includes(x)));
                quietly();
              }),
            ),
          ),
        ),
      ];
    } else if (op === "in") {
      const input = h("input", {
        class: "line",
        value: (Array.isArray(c.in) ? c.in : []).join(", "),
        placeholder: "one, two, three",
        oninput: () => {
          c.in = input.value
            .split(",")
            .map((/** @type {string} */ s) => s.trim())
            .filter(Boolean)
            .map((/** @type {string} */ s) => (isNumeric(target) && Number.isFinite(Number(s)) ? Number(s) : s));
          quietly();
        },
      });
      value = [setting("Any of, with commas between", input, "wide")];
    }
    return [setting("Shown if", which, "wide"), setting("How", how), ...value];
  };

  // --- settings --------------------------------------------------------------

  /**
   * @param {Record<string, any>} q @param {number} i
   * @param {() => void} again draws the question afresh @param {() => void} redraw draws only its control
   * @param {() => void} quietly
   */
  const settingsOf = (q, i, again, redraw, quietly) => {
    const keys = SETTINGS[q.type] ?? [];
    /** @param {string} key */
    const number = (key) => {
      const input = h("input", {
        class: "line",
        type: "number",
        step: "any",
        value: typeof q[key] === "number" ? q[key] : "",
        oninput: () => {
          if (Number.isNaN(input.valueAsNumber)) delete q[key];
          else q[key] = input.valueAsNumber;
          redraw();
          changed();
        },
      });
      return setting(nameOf(q.type, key), input);
    };
    /** @param {string} key @param {string} [type] */
    const plain = (key, type = "text") => {
      const input = h("input", {
        class: "line",
        type,
        value: typeof q[key] === "string" ? q[key] : "",
        oninput: () => {
          if (input.value) q[key] = input.value;
          else delete q[key];
          redraw();
          changed();
        },
      });
      return setting(nameOf(q.type, key), input);
    };
    /** @param {string} key @param {string} [hint] */
    const worded = (key, hint = "") => setting(nameOf(q.type, key), text(...at(q, key), { cls: "line", placeholder: hint, after: redraw }));

    const id = h("input", {
      class: "line mono",
      value: q.id ?? "",
      spellcheck: false,
      autocapitalize: "none",
      onchange: () => {
        const to = id.value.trim();
        const taken = draft.questions.some((/** @type {any} */ p) => p !== q && p.id === to);
        if (!to || taken) {
          id.value = q.id ?? "";
          return;
        }
        if (typeof q.id === "string" && q.id) renameId(draft, q.id, to);
        else q.id = to;
        changed();
        paint();
      },
    });

    const t = words(lang);
    /** @type {Record<string, () => Node | Node[] | false>} */
    const made = {
      placeholder: () => worded("placeholder"),
      min: () => (q.type === "rating" ? false : number("min")),
      max: () => number("max"),
      step: () => number("step"),
      integer: () =>
        h(
          "div",
          { class: "set" },
          check(nameOf(q.type, "integer"), q.integer === true, (on) => {
            if (on) q.integer = true;
            else delete q.integer;
            changed();
          }),
        ),
      // A unit reads the same in any language unless it was written otherwise
      prefix: () => (isRecord(q.prefix) ? worded("prefix") : plain("prefix")),
      suffix: () => (isRecord(q.suffix) ? worded("suffix") : plain("suffix")),
      yes: () => worded("yes", t("yes")),
      no: () => worded("no", t("no")),
      label: () => setting(nameOf(q.type, "label"), text(...at(q, "label"), { cls: "line", placeholder: t("agree"), after: redraw }), "wide"),
      earliest: () => plain("earliest", "date"),
      latest: () => plain("latest", "date"),
      maxSize: () => number("maxSize"),
      accept: () => {
        const input = h("input", {
          class: "line",
          value: Array.isArray(q.accept) ? q.accept.join(" ") : "",
          placeholder: "pdf png jpg",
          spellcheck: false,
          autocapitalize: "none",
          oninput: () => {
            const kinds = input.value.split(/[\s,]+/).map((/** @type {string} */ s) => s.replace(/^\./, "")).filter(Boolean);
            if (kinds.length) q.accept = kinds;
            else delete q.accept;
            redraw();
            changed();
          },
        });
        return setting(nameOf(q.type, "accept"), input);
      },
      labels: () => {
        /** @param {number} j */
        const end = (j) =>
          text(
            () => (Array.isArray(q.labels) ? q.labels[j] : undefined),
            (v) => {
              const both = Array.isArray(q.labels) && q.labels.length === 2 ? q.labels : (q.labels = several ? [{}, {}] : ["", ""]);
              both[j] = v ?? (several ? {} : "");
              if (both.every((/** @type {unknown} */ x) => x === "" || (isRecord(x) && !Object.keys(x).length))) delete q.labels;
            },
            { cls: "line", after: redraw },
          );
        return [setting("At the low end", end(0)), setting("At the high end", end(1))];
      },
    };

    return h(
      "div",
      { class: "settings" },
      setting("Id, which its answers are kept under", id),
      q.type !== "statement" && setting("In place of its number", text(...at(q, "eyebrow"), { cls: "line" })),
      q.type === "statement" && setting("Above the title", text(...at(q, "eyebrow"), { cls: "line" })),
      keys.flatMap((k) => made[k]?.() || []),
      conditionOf(q, i, again, quietly),
      h(
        "div",
        { class: "set wide under" },
        tool("Duplicate", () => {
          open.add(duplicate(draft, i));
          changed();
          paint();
          blocks[i + 1]?.el.scrollIntoView({ block: "nearest" });
        }),
        tool("Remove", () => {
          const asked = draft.questions.filter((/** @type {any} */ p) => isRecord(p.showIf) && p.showIf.id === q.id).length;
          if (!confirm(`Remove ${q.id}?${asked ? ` ${asked} later question${asked > 1 ? "s depend" : " depends"} on it.` : ""}`)) return;
          draft.questions.splice(i, 1);
          changed();
          paint();
        }),
      ),
    );
  };

  // --- one question ----------------------------------------------------------

  /** @param {Record<string, any>} q @param {number} i @returns {{ el: HTMLElement, problems: HTMLElement }} */
  const block = (q, i) => {
    const asked = draft.questions.filter((/** @type {any} */ p) => p.type !== "statement");
    const n = asked.indexOf(q) + 1;
    const again = () => repaint(i);
    const control = h("div", { class: "field" });
    const redraw = () => control.replaceChildren(...controlOf(q, again));
    const condition = h("span", { class: "cond" }, conditionSaid(q));
    const quietly = () => {
      condition.textContent = conditionSaid(q);
      changed();
    };
    const problems = h("ul", { class: "problems" });
    const isOpen = open.has(q);

    const type = h(
      "select",
      {
        class: "tool",
        "aria-label": "Type",
        onchange: () => {
          setType(q, type.value);
          changed();
          // Whether it is numbered changes the numbers after it
          paint();
          /** @type {HTMLElement | null} */ (blocks[i]?.el.querySelector("select.tool"))?.focus();
        },
      },
      !TYPES.includes(q.type) && h("option", { value: q.type ?? "", selected: true }, String(q.type ?? "no type")),
      TYPES.map((t) => h("option", { value: t, selected: t === q.type }, t)),
    );
    const required = tool(
      q.required ? "required" : "optional",
      () => {
        if (q.required) delete q.required;
        else q.required = true;
        required.textContent = q.required ? "required" : "optional";
        required.setAttribute("aria-pressed", String(q.required === true));
        changed();
      },
      { "aria-pressed": String(q.required === true), title: "Whether it must be answered" },
    );
    /** @param {1 | -1} by */
    const shift = (by) => {
      if (!move(draft.questions, i, by)) return;
      changed();
      paint();
      const now = blocks[i + by]?.el;
      now?.scrollIntoView({ block: "nearest" });
      /** @type {HTMLElement | null} */ (now?.querySelector(`[data-move="${by}"]`))?.focus();
    };

    redraw();
    const el = h(
      "section",
      { class: `q ${isOpen ? "is-open" : ""}` },
      h(
        "div",
        { class: "qmeta" },
        h("span", { class: "n" }, q.type === "statement" ? "—" : String(n).padStart(2, "0")),
        type,
        q.type !== "statement" && required,
        condition,
        h(
          "span",
          { class: "tools" },
          tool("↑", () => shift(-1), { "aria-label": "Move up", "data-move": "-1", disabled: i === 0 }),
          tool("↓", () => shift(1), { "aria-label": "Move down", "data-move": "1", disabled: i === draft.questions.length - 1 }),
          tool(
            "Settings",
            () => {
              if (isOpen) open.delete(q);
              else open.add(q);
              again();
              /** @type {HTMLElement | null} */ (blocks[i]?.el.querySelector("[aria-expanded]"))?.focus();
            },
            { "aria-expanded": String(isOpen) },
          ),
        ),
      ),
      text(...at(q, "title"), { cls: "qtitle", placeholder: q.type === "statement" ? "Something to say" : "The question", keep: true }),
      text(...at(q, "body"), { cls: "qbody", placeholder: "A quieter line under it", lines: true }),
      control,
      isOpen && settingsOf(q, i, again, redraw, quietly),
      problems,
    );
    return { el, problems };
  };

  /** @param {number} i draws one question afresh, where it is */
  const repaint = (i) => {
    const made = block(draft.questions[i], i);
    blocks[i].el.replaceWith(made.el);
    blocks[i] = made;
    recheck();
    fit();
  };

  // --- the whole of it -------------------------------------------------------

  const head = () => {
    const pick = h(
      "div",
      { class: "checks" },
      LANGS.map((l) =>
        check(LANG_NAMES[l] ?? l, langs.includes(l), (on) => {
          const next = on ? [...langs, l] : langs.filter((x) => x !== l);
          if (next.length) setLanguages(draft, next);
          changed();
          paint();
        }),
      ),
    );
    const first = h(
      "select",
      {
        class: "line",
        onchange: () => {
          setLanguages(draft, [first.value, ...langs.filter((l) => l !== first.value)]);
          changed();
          paint();
        },
      },
      langs.map((l) => h("option", { value: l, selected: l === langs[0] }, LANG_NAMES[l] ?? l)),
    );
    const audience = h(
      "select",
      {
        class: "line",
        onchange: () => {
          if (audience.value === "invite" || "audience" in draft) draft.audience = audience.value;
          changed();
        },
      },
      h("option", { value: "general", selected: draft.audience !== "invite" }, "Anyone with the address"),
      h("option", { value: "invite", selected: draft.audience === "invite" }, "Only through a link made for them"),
    );
    return h(
      "div",
      { class: "edhead" },
      text(...at(draft, "title"), { cls: "qtitle", placeholder: "What it is called", keep: true }),
      h(
        "div",
        { class: "settings" },
        h("div", { class: "set" }, h("span", {}, "Written in"), pick),
        several && setting("Opens in, unless they ask otherwise", first),
        setting("Who can answer", audience, several ? "wide" : ""),
      ),
      general,
    );
  };

  const ends = () => {
    const t = words(lang);
    return [
      h(
        "section",
        { class: "q" },
        h("div", { class: "qmeta" }, h("span", { class: "n" }, "The last card, where it is sent")),
        text(...inPart("submit", "title"), { cls: "qtitle", placeholder: t("submitTitle") }),
        text(...inPart("submit", "body"), { cls: "qbody", placeholder: t("submitBody"), lines: true }),
        h("div", { class: "field" }, text(...inPart("submit", "label"), { cls: "sendlabel", placeholder: t("send") })),
      ),
      h(
        "section",
        { class: "q" },
        h("div", { class: "qmeta" }, h("span", { class: "n" }, "After it is sent")),
        text(...inPart("outro", "title"), { cls: "qtitle", placeholder: t("outroTitle") }),
        text(...inPart("outro", "body"), { cls: "qbody", placeholder: t("outroBody"), lines: true }),
      ),
    ];
  };

  const paint = () => {
    langs = languagesOf(draft);
    several = langs.length > 1;
    if (!langs.includes(lang)) lang = langs[0];
    blocks = draft.questions.map(block);
    el.replaceChildren(
      ...[
        several &&
          h(
            "div",
            { class: "edbar", role: "group", "aria-label": "Language showing" },
            langs.map((l) =>
              tool(
                LANG_NAMES[l] ?? l,
                () => {
                  lang = l;
                  paint();
                },
                { "aria-pressed": String(l === lang), lang: LANG_TAGS[l] ?? l },
              ),
            ),
          ),
        head(),
        ...blocks.map((b) => b.el),
        h(
          "div",
          { class: "under more" },
          tool("+ question", () => {
            addQuestion(draft);
            changed();
            paint();
            const made = blocks[blocks.length - 1].el;
            made.scrollIntoView({ block: "center" });
            /** @type {HTMLElement | null} */ (made.querySelector(".qtitle"))?.focus({ preventScroll: true });
          }),
        ),
        ...ends(),
      ].filter(Boolean),
    );
    recheck();
    fit();
    // Not in the page until whoever asked for it puts it there
    requestAnimationFrame(fit);
  };

  addEventListener("resize", fit);
  paint();
  return { el, draft, fit };
};
