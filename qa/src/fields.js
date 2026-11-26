// @ts-check

// One control per question type. Each takes the question, its saved answer
// and a setter, and returns the element to place under the title

import { fileProblem, fileRules, rangeOf, toOptions, toRows } from "../shared/schema.js";
import { h } from "./dom.js";

/**
 * @typedef {import("../shared/schema.js").Question} Question
 * @typedef {import("../shared/schema.js").Option} Option
 * @typedef {(value: unknown) => void} Setter
 * @typedef {import("./session.js").Session["upload"]} Upload
 * @typedef {(q: Question, value: any, set: Setter, labelId: string, upload: Upload) => HTMLElement | null} Field
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** @param {unknown} v */
const otherOf = (v) =>
  typeof v === "object" && v !== null && "other" in v ? String(v.other) : null;

/**
 * A single line of text
 * @param {Record<string, any>} attrs
 * @returns {Field}
 */
const line =
  ({ placeholder, onblur, ...attrs }) =>
  (q, value, set, labelId) =>
    h("input", {
      class: "line",
      type: "text",
      value: value ?? "",
      placeholder: q.placeholder ?? placeholder ?? "",
      "aria-labelledby": labelId,
      oninput: (/** @type {any} */ e) => set(e.target.value),
      onblur: onblur && ((/** @type {any} */ e) => onblur(e, set)),
      ...attrs,
    });

/** @type {Field} */
const long = (q, value, set, labelId) => {
  const el = h("textarea", {
    class: "line",
    rows: 1,
    value: value ?? "",
    placeholder: q.placeholder ?? "",
    "aria-labelledby": labelId,
  });
  const grow = () => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  el.addEventListener("input", () => {
    grow();
    set(el.value);
  });
  // scrollHeight is 0 until the card is in the page
  requestAnimationFrame(grow);
  return el;
};

/** @type {Field} */
const number = (q, value, set, labelId) =>
  h("input", {
    class: "line",
    type: "number",
    inputMode: q.integer ? "numeric" : "decimal",
    min: q.min,
    max: q.max,
    step: q.step ?? (q.integer ? 1 : "any"),
    value: value ?? "",
    placeholder: q.placeholder ?? "",
    "aria-labelledby": labelId,
    oninput: (/** @type {any} */ e) =>
      set(Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber),
  });

/**
 * A list to pick one or several from, optionally ending in a free text row
 * @param {object} o
 * @param {Question} o.q
 * @param {Option[]} o.options
 * @param {any} o.value
 * @param {Setter} o.set
 * @param {string} o.labelId
 * @param {boolean} [o.multi]
 * @param {string[]} [o.keys] shortcut key per option; letters by default
 */
const list = ({ q, options, value, set, labelId, multi = false, keys }) => {
  const type = multi ? "checkbox" : "radio";
  /** @type {any[]} */
  const picked = multi ? (Array.isArray(value) ? value : []) : [value];
  let otherText = picked.map(otherOf).find((t) => t !== null) ?? "";

  /** @type {HTMLInputElement[]} */
  const inputs = [];
  /** @type {HTMLInputElement | null} */
  let otherInput = null;
  /** @type {HTMLInputElement | null} */
  let otherBox = null;
  /** @type {HTMLInputElement | null} the radio currently chosen */
  let chosen = null;

  const emit = () => {
    /** @type {unknown[]} */
    const out = options.filter((_, i) => inputs[i].checked).map((o) => o.value);
    if (otherBox?.checked) out.push({ other: otherText });
    set(multi ? out : out[0]);
  };

  /**
   * @param {string} label
   * @param {number} i
   * @param {boolean} checked
   */
  const row = (label, i, checked) => {
    const input = h("input", { class: "sr", type, name: q.id, checked });
    if (checked) chosen = input;
    input.addEventListener("click", () => {
      // A radio, once chosen, cannot be cleared by the browser; a second
      // press clears it, so an optional question can go back to unanswered
      if (!multi) {
        if (chosen === input) input.checked = false;
        chosen = input.checked ? input : null;
      }
      if (input === otherBox && input.checked) otherInput?.focus();
      emit();
    });
    const key = keys ? keys[i] : LETTERS[i];
    return {
      input,
      label: h(
        "label",
        { class: "opt", "data-key": key },
        input,
        h("span", { class: "key", "aria-hidden": "true" }, key ?? ""),
        h("span", { class: "lbl" }, label),
        h("span", { class: multi ? "mark square" : "mark", "aria-hidden": "true" }),
      ),
    };
  };

  const rows = options.map((o, i) => {
    const r = row(o.label, i, picked.includes(o.value));
    inputs.push(r.input);
    return r.label;
  });

  if (q.other) {
    const r = row("Other", options.length, picked.some((v) => otherOf(v) !== null));
    otherBox = r.input;
    otherInput = h("input", {
      class: "line other",
      type: "text",
      value: otherText,
      placeholder: "Tell us more",
      "aria-label": "Other",
      oninput: (/** @type {any} */ e) => {
        otherText = e.target.value;
        emit();
      },
    });
    rows.push(h("div", { class: "otherwrap" }, r.label, otherInput));
  }

  return h(
    "div",
    { class: "opts", role: multi ? "group" : "radiogroup", "aria-labelledby": labelId },
    rows,
  );
};

/** @type {Field} */
const choice = (q, value, set, labelId) =>
  list({ q, options: toOptions(q.options), value, set, labelId });

/** @type {Field} */
const multi = (q, value, set, labelId) =>
  list({ q, options: toOptions(q.options), value, set, labelId, multi: true });

/** @type {Field} */
const boolean = (q, value, set, labelId) =>
  list({
    q: { ...q, other: false },
    options: [
      { value: true, label: q.yes ?? "Yes" },
      { value: false, label: q.no ?? "No" },
    ],
    keys: ["y", "n"],
    value,
    set,
    labelId,
  });

/** @type {Field} */
const consent = (q, value, set, labelId) =>
  list({
    q: { ...q, other: false },
    options: [{ value: true, label: q.label ?? "I agree" }],
    keys: ["y"],
    multi: true,
    value: value === true ? [true] : [],
    set: (v) => set(/** @type {unknown[]} */ (v).length ? true : undefined),
    labelId,
  });

/** @type {Field} */
const select = (q, value, set, labelId) => {
  const options = toOptions(q.options);
  const at = options.findIndex((o) => o.value === value);
  return h(
    "select",
    {
      class: "line",
      "aria-labelledby": labelId,
      onchange: (/** @type {any} */ e) => set(options[Number(e.target.value)]?.value),
    },
    h("option", { value: "", selected: at < 0 }, q.placeholder ?? "Choose"),
    options.map((o, i) => h("option", { value: String(i), selected: i === at }, o.label)),
  );
};

/**
 * A row of steps to pick one from: numerals for a scale, marks for a rating
 * @param {"scale" | "rating"} kind
 * @returns {Field}
 */
const steps = (kind) => (q, value, set, labelId) => {
  const { min, max } = rangeOf(q);
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  let current = value;
  /** @type {HTMLInputElement[]} */
  const inputs = [];
  const labels = values.map((v) => {
    const input = h("input", { class: "sr", type: "radio", name: q.id, checked: v === value });
    input.addEventListener("click", () => {
      if (current === v) input.checked = false;
      current = input.checked ? v : undefined;
      set(current);
    });
    inputs.push(input);
    return h(
      "label",
      { class: "step", "data-key": v >= 0 && v <= 9 ? String(v) : null, "aria-label": String(v) },
      input,
      kind === "scale" ? h("span", { class: "num" }, String(v)) : h("span", { class: "pip" }),
    );
  });
  return h(
    "div",
    { class: `steps ${kind}`, role: "radiogroup", "aria-labelledby": labelId },
    h("div", { class: "track" }, labels),
    q.labels && h("div", { class: "ends" }, h("span", {}, q.labels[0]), h("span", {}, q.labels[1])),
  );
};

/** @type {Field} */
const slider = (q, value, set, labelId) => {
  const { min, max, step } = rangeOf(q);
  /** @param {unknown} v */
  const show = (v) => (typeof v === "number" ? `${q.prefix ?? ""}${v}${q.suffix ?? ""}` : "—");
  const out = h("output", { class: "readout" }, show(value));
  const input = h("input", {
    type: "range",
    min,
    max,
    step,
    value: value ?? (min + max) / 2,
    "aria-labelledby": labelId,
  });
  const update = () => {
    out.textContent = show(input.valueAsNumber);
    input.classList.add("is-set");
    set(input.valueAsNumber);
  };
  input.classList.toggle("is-set", typeof value === "number");
  input.addEventListener("input", update);
  // A press without a move still means "this value"
  input.addEventListener("pointerup", update);
  return h(
    "div",
    { class: "slider" },
    out,
    input,
    q.labels && h("div", { class: "ends" }, h("span", {}, q.labels[0]), h("span", {}, q.labels[1])),
  );
};

/** @type {Field} */
const rank = (q, value, set, labelId) => {
  const options = toOptions(q.options);
  /** @type {unknown[]} */
  let order = Array.isArray(value) ? value.filter((v) => options.some((o) => o.value === v)) : [];
  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  const paint = () => {
    options.forEach((o, i) => {
      const place = order.indexOf(o.value);
      buttons[i].setAttribute("aria-pressed", String(place >= 0));
      /** @type {HTMLElement} */ (buttons[i].firstChild).textContent = place >= 0 ? String(place + 1) : "";
    });
    wrap.classList.toggle("is-ranking", order.length > 0);
  };
  options.forEach((o, i) => {
    buttons.push(
      h(
        "button",
        {
          class: "opt",
          type: "button",
          "data-key": LETTERS[i],
          onclick: () => {
            order = order.includes(o.value) ? order.filter((v) => v !== o.value) : [...order, o.value];
            paint();
            set(order);
          },
        },
        h("span", { class: "key place" }),
        h("span", { class: "lbl" }, o.label),
      ),
    );
  });
  const wrap = h("div", { class: "opts rank", role: "group", "aria-labelledby": labelId }, buttons);
  paint();
  return wrap;
};

/** @type {Field} */
const matrix = (q, value, set, labelId) => {
  const columns = toOptions(q.columns);
  /** @type {Record<string, unknown>} */
  const picked = typeof value === "object" && value !== null ? { ...value } : {};
  const ends = q.labels ?? [columns[0].label, columns[columns.length - 1].label];
  const rows = toRows(q).map((row) => {
    const said = h("span", { class: "said" });
    const paint = () => {
      said.textContent = columns.find((c) => c.value === picked[row.id])?.label ?? "";
    };
    paint();
    const dots = columns.map((c) => {
      const input = h("input", {
        class: "sr",
        type: "radio",
        name: `${q.id}.${row.id}`,
        checked: picked[row.id] === c.value,
      });
      input.addEventListener("click", () => {
        if (picked[row.id] === c.value) {
          input.checked = false;
          delete picked[row.id];
        } else picked[row.id] = c.value;
        paint();
        set({ ...picked });
      });
      return h("label", { class: "step", "aria-label": c.label }, input, h("span", { class: "pip" }));
    });
    return h(
      "div",
      { class: "mrow", role: "radiogroup", "aria-label": row.label },
      h("div", { class: "mlabel" }, h("span", {}, row.label), said),
      h("div", { class: "track" }, dots),
    );
  });
  return h(
    "div",
    { class: "matrix steps", role: "group", "aria-labelledby": labelId },
    rows,
    h("div", { class: "ends" }, h("span", {}, ends[0]), h("span", {}, ends[1])),
  );
};

/** @param {number} bytes */
const sizeOf = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** @type {Field} */
const file = (q, value, set, labelId, upload) => {
  const { max, maxBytes, accept, open } = fileRules(q);
  /** @type {import("../shared/schema.js").StoredFile[]} */
  let stored = Array.isArray(value) ? [...value] : [];
  let sending = 0;

  const list = h("ul", { class: "filelist" });
  const note = h("p", { class: "filenote", role: "status" });
  const input = h("input", {
    class: "sr",
    type: "file",
    multiple: max > 1,
    accept: accept.map((e) => `.${e}`).join(","),
    "aria-labelledby": labelId,
  });
  const pick = h("label", { class: "pick" }, input, h("span", {}));
  const limits = `${open ? "" : `${accept.join(", ").toUpperCase()} · `}Up to ${maxBytes / 1024 / 1024} MB${max > 1 ? ` each · ${max} at most` : ""}`;
  const wrap = h("div", { class: "files" }, list, pick, note);

  const paint = () => {
    const full = stored.length + sending >= max;
    pick.hidden = full;
    /** @type {HTMLElement} */ (pick.lastChild).textContent = stored.length + sending ? "Add another" : max > 1 ? "Choose files" : "Choose a file";
    // The deck will not move on while this is set
    if (sending) wrap.dataset.busy = "Still uploading. One moment.";
    else delete wrap.dataset.busy;
  };

  /** @param {string} name @param {number} size @param {() => void} onRemove */
  const row = (name, size, onRemove) => {
    const el = h(
      "li",
      { class: "file" },
      h("span", { class: "fname" }, name),
      h("span", { class: "fsize" }, sizeOf(size)),
      h("button", { class: "fremove", type: "button", "aria-label": `Remove ${name}`, onclick: onRemove }, "×"),
    );
    list.append(el);
    return el;
  };

  /** @param {import("../shared/schema.js").StoredFile} f */
  const show = (f) => {
    const el = row(f.name, f.size, () => {
      stored = stored.filter((x) => x !== f);
      el.remove();
      note.textContent = limits;
      paint();
      set(stored);
    });
    return el;
  };

  /** @param {File[]} files */
  const add = async (files) => {
    note.textContent = limits;
    for (const f of files) {
      if (stored.length + sending >= max) {
        note.textContent = max > 1 ? `No more than ${max}, please.` : "Only one file here; remove it to choose another.";
        break;
      }
      const problem = fileProblem(q, f);
      if (problem) {
        note.textContent = problem;
        continue;
      }
      sending++;
      const el = row(f.name, f.size, () => {});
      el.classList.add("is-sending");
      paint();
      upload(q.id, f, (done) => el.style.setProperty("--p", String(done)))
        .then((saved) => {
          stored.push(saved);
          el.replaceWith(show(saved));
          el.remove();
          set(stored);
        })
        .catch((e) => {
          el.remove();
          note.textContent =
            e?.status === 429
              ? "Too many uploads just now. Please try again in a minute."
              : e?.status === 413 || e?.status === 415
                ? (fileProblem(q, f) ?? "That file can’t be added here.")
                : "That didn’t upload. Please try again.";
        })
        .finally(() => {
          sending--;
          paint();
        });
    }
  };

  input.addEventListener("change", () => {
    add([...(input.files ?? [])]);
    input.value = "";
  });

  // Files can also be dropped anywhere on the card, once it is in the page
  requestAnimationFrame(() => {
    const card = wrap.closest(".card");
    card?.addEventListener("dragover", (e) => {
      e.preventDefault();
      wrap.classList.add("is-over");
    });
    card?.addEventListener("dragleave", () => wrap.classList.remove("is-over"));
    card?.addEventListener("drop", (e) => {
      e.preventDefault();
      wrap.classList.remove("is-over");
      add([.../** @type {DragEvent} */ (e).dataTransfer?.files ?? []]);
    });
  });

  stored.forEach(show);
  note.textContent = limits;
  paint();
  return wrap;
};

/** @type {Record<string, Field>} */
const FIELDS = {
  statement: () => null,
  text: line({ maxLength: 500 }),
  long,
  email: line({ type: "email", inputMode: "email", autocomplete: "email", autocapitalize: "off", spellcheck: false, placeholder: "name@example.com" }),
  url: line({
    type: "url",
    inputMode: "url",
    autocapitalize: "off",
    spellcheck: false,
    placeholder: "example.com",
    // People leave the scheme off; the browser's own check would refuse that
    onblur: (/** @type {any} */ e, /** @type {Setter} */ set) => {
      const v = e.target.value.trim();
      if (v && !/^[a-z][a-z\d+.-]*:/i.test(v)) set((e.target.value = `https://${v}`));
    },
  }),
  tel: line({ type: "tel", inputMode: "tel", autocomplete: "tel" }),
  number,
  choice,
  multi,
  select,
  boolean,
  consent,
  rating: steps("rating"),
  scale: steps("scale"),
  slider,
  date: (q, value, set, labelId) =>
    line({ type: "date", min: q.earliest, max: q.latest })(q, value, set, labelId),
  time: line({ type: "time" }),
  rank,
  matrix,
  file,
};

/** @type {Field} */
export const renderField = (q, value, set, labelId, upload) =>
  FIELDS[q.type](q, value, set, labelId, upload);
