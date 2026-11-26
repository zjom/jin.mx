// @ts-check

/**
 * @param {string} tag
 * @param {Record<string, any>} [props] class, on* listeners, properties, else attributes
 * @param {...(Node | string | null | undefined | false | (Node | string | null | undefined | false)[])} kids
 * @returns {any}
 */
export const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el) /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid !== undefined && kid !== null && kid !== false) el.append(kid);
  }
  return el;
};

/**
 * Text as paragraphs, split on blank lines
 * @param {string} text
 * @param {string} cls
 */
export const paragraphs = (text, cls) =>
  text
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => h("p", { class: cls }, p.trim()));
