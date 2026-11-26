// @ts-check

// The deck: one question per card, moved between by swiping. A swipe left
// throws the card away and the next rises from beneath; a swipe right pulls
// the previous card back from where it went. A swipe that cannot be honoured
// (a required question unanswered, nothing before the first card) still
// follows the finger, against growing resistance, then springs back

import { fill, problemWith, resolve } from "../shared/schema.js";
import { h, paragraphs } from "./dom.js";
import { renderField } from "./fields.js";

/**
 * @typedef {import("../shared/schema.js").Question} Question
 * @typedef {import("./session.js").Session} Session
 * @typedef {{ el: HTMLElement, fail: (message: string) => void }} Card
 * @typedef {{ dir: 1 | -1, top: HTMLElement, under: HTMLElement, next: Card, slide: Question } | { dir: 1 | -1, refused: string }} Move
 */

// The card after the last question, where the answers are sent
const SUBMIT = /** @type {Question} */ ({ id: "$submit", type: "$submit", title: "" });

const COMMIT_DISTANCE = 0.22; // of the width
const COMMIT_SPEED = 0.45; // px per ms
const TRAVEL = 1.15; // widths a thrown card covers
const TILT = 7; // degrees, at full travel
const GIVE = 96; // px a refused card can be pulled
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const SPRING = "cubic-bezier(0.3, 1.7, 0.45, 1)";
const TYPING = "input:not([type=radio], [type=checkbox], [type=range]), textarea, select";

/** @param {number} n */
const clamp = (n) => Math.min(1, Math.max(0, n));

/**
 * @param {object} ui
 * @param {HTMLElement} ui.stage
 * @param {HTMLElement} ui.bar
 * @param {HTMLElement} ui.foot
 * @param {Session} session
 */
export const mountDeck = ({ stage, bar, foot }, session) => {
  const def = session.definition;
  const answers = { ...session.answers };
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /** @type {Question[]} */
  let slides = [];
  /** @type {Question} */
  let current;
  /** @type {Card} */
  let card;
  let busy = false;
  let done = false;
  let online = true;
  let hinted = false;

  const recompute = () => {
    slides = [...resolve(def, answers).questions, SUBMIT];
  };
  const index = () => slides.indexOf(current);

  const paintProgress = () => {
    const p = done ? 1 : index() / (slides.length - 1);
    bar.style.setProperty("--p", String(p));
    bar.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  };

  const paintFoot = () => {
    if (!online) foot.textContent = "Offline — your answers will be saved when you’re back.";
    else if (hinted || done) foot.textContent = "";
    else foot.textContent = finePointer ? "Press Enter ↵ or drag left to continue" : "Swipe left to continue";
  };

  // --- cards ---------------------------------------------------------------

  /**
   * @param {string} eyebrow
   * @param {string} title
   * @param {string} [body]
   * @param {...(Node | null)} rest
   * @returns {Card}
   */
  const frame = (eyebrow, title, body, ...rest) => {
    const error = h("p", { class: "error", role: "alert" });
    const el = h(
      "section",
      { class: "card" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "eyebrow" }, eyebrow),
        h("h1", { class: "title", tabIndex: -1 }, title),
        body && paragraphs(body, "body"),
        rest,
        error,
      ),
    );
    return {
      el,
      fail: (message) => {
        error.textContent = message;
      },
    };
  };

  /** @param {Question} slide @returns {Card} */
  const build = (slide) => {
    if (slide === SUBMIT) {
      const button = h("button", { class: "send", type: "button", onclick: () => submit(button) },
        def.submit?.label ?? "Send");
      return frame(
        "",
        fill(def.submit?.title, session.vars) || "That’s everything.",
        fill(def.submit?.body, session.vars) || "Swipe back to review your answers, or send them now.",
        button,
      );
    }
    const asked = slides.filter((s) => s !== SUBMIT && s.type !== "statement");
    const n = asked.indexOf(slide) + 1;
    const pad = String(asked.length).length < 2 ? 2 : String(asked.length).length;
    const eyebrow =
      slide.eyebrow !== undefined
        ? fill(slide.eyebrow, session.vars)
        : slide.type === "statement"
          ? ""
          : `${String(n).padStart(pad, "0")} / ${String(asked.length).padStart(pad, "0")}${slide.required ? "" : "  ·  Optional"}`;

    const made = frame(eyebrow, fill(slide.title, session.vars), fill(slide.body, session.vars));
    const title = /** @type {HTMLElement} */ (made.el.querySelector(".title"));
    title.id = `title-${slide.id}`;
    const field = renderField(
      slide,
      answers[slide.id],
      (value) => {
        if (value === undefined) delete answers[slide.id];
        else answers[slide.id] = value;
        made.fail("");
        recompute();
        paintProgress();
        session.save(answers, current.id);
      },
      title.id,
    );
    if (field) made.el.querySelector(".error")?.before(h("div", { class: "field" }, field));
    return made;
  };

  const focusCard = () => {
    // Somewhere to type gets the caret; anything else is a key press away
    const control = finePointer ? card.el.querySelector(`.field > :is(${TYPING}), .send`) : null;
    /** @type {HTMLElement} */ (control ?? card.el.querySelector(".title")).focus({ preventScroll: true });
  };

  // --- motion --------------------------------------------------------------

  /**
   * Where both cards are when the top one is p of the way off to the left
   * @param {number} p
   */
  const pose = (p) => {
    const still = reduceMotion.matches;
    const rise = clamp((p - 0.12) / 0.7);
    return {
      top: {
        transform: still ? "none" : `translate3d(${-p * TRAVEL * 100}%, 0, 0) rotate(${-p * TILT}deg)`,
        opacity: String(1 - clamp(p * 1.5)),
      },
      under: {
        transform: still ? "none" : `translate3d(0, ${(1 - rise) * 14}px, 0) scale(${0.97 + 0.03 * rise})`,
        opacity: String(rise * rise),
      },
    };
  };

  /** @param {HTMLElement} el @param {{ transform: string, opacity: string }} style */
  const set = (el, style) => {
    el.style.transform = style.transform;
    el.style.opacity = style.opacity;
  };

  /**
   * @param {HTMLElement} el
   * @param {{ transform: string, opacity: string }} to
   * @param {number} ms
   * @param {string} easing
   */
  const tween = async (el, to, ms, easing) => {
    const animation = el.animate([to], { duration: reduceMotion.matches ? 120 : ms, easing, fill: "forwards" });
    await animation.finished;
    set(el, to);
    animation.cancel();
  };

  /**
   * Sets up a move in one direction: either two cards ready to animate, or
   * the reason it cannot happen
   * @param {1 | -1} dir
   * @returns {Move}
   */
  const begin = (dir) => {
    if (dir === 1) {
      const message = current === SUBMIT ? "" : (problemWith(current, answers[current.id]) ?? null);
      if (current === SUBMIT || message !== null) return { dir, refused: message ?? "" };
    } else if (index() === 0) return { dir, refused: "" };

    const slide = slides[index() + dir];
    const next = build(slide);
    next.el.inert = true;
    if (dir === 1) {
      stage.prepend(next.el);
      set(next.el, pose(0).under);
      return { dir, top: card.el, under: next.el, next, slide };
    }
    stage.append(next.el);
    set(next.el, pose(1).top);
    return { dir, top: next.el, under: card.el, next, slide };
  };

  /**
   * @param {Move} move
   * @param {number} p progress of the top card towards off-screen
   */
  const paint = (move, p) => {
    if ("refused" in move) return;
    const at = pose(p);
    set(move.top, at.top);
    set(move.under, at.under);
  };

  /** @param {Move} move @param {boolean} through finish the move, or put everything back */
  const settle = async (move, through) => {
    if ("refused" in move) return;
    const forward = move.dir === 1;
    const end = pose(through === forward ? 1 : 0);
    await Promise.all([
      tween(move.top, end.top, 340, EASE_OUT),
      tween(move.under, end.under, 340, EASE_OUT),
    ]);
    if (!through) {
      move.next.el.remove();
      card.el.style.transform = card.el.style.opacity = "";
      return;
    }
    card.el.remove();
    card = move.next;
    current = move.slide;
    card.el.inert = false;
    card.el.style.transform = card.el.style.opacity = "";
    hinted = true;
    paintProgress();
    paintFoot();
    focusCard();
    if (!done) session.save(answers, current.id);
  };

  /**
   * The card shrugs the swipe off and says why
   * @param {{ dir: 1 | -1, refused: string }} move
   * @param {boolean} nudge the card has not been dragged, so move it first
   */
  const refuse = async (move, nudge) => {
    card.fail(move.refused);
    if (move.refused) navigator.vibrate?.(12);
    if (nudge && !reduceMotion.matches) {
      await tween(card.el, { transform: `translate3d(${-move.dir * 28}px, 0, 0) rotate(${-move.dir * 1.2}deg)`, opacity: "1" }, 110, "ease-out");
    }
    await tween(card.el, { transform: "none", opacity: "1" }, 460, SPRING);
    card.el.style.transform = card.el.style.opacity = "";
  };

  /** @param {1 | -1} dir */
  const go = async (dir) => {
    if (busy || done) return;
    busy = true;
    const move = begin(dir);
    if ("refused" in move) await refuse(move, true);
    else await settle(move, true);
    busy = false;
  };

  // --- sending -------------------------------------------------------------

  /** @param {HTMLButtonElement} button */
  const submit = async (button) => {
    if (busy || done) return;
    busy = true;
    const label = button.textContent;
    button.textContent = "Sending";
    button.disabled = true;
    card.fail("");
    try {
      const result = await session.submit(resolve(def, answers).answers);
      if (result.ok) {
        done = true;
        await settle(swapIn(outro()), true);
      } else {
        // The server disagrees with an answer: go back to it
        const slide = slides.find((s) => s.id === result.problem.id) ?? slides[0];
        const back = build(slide);
        back.el.inert = true;
        stage.append(back.el);
        set(back.el, pose(1).top);
        await settle({ dir: -1, top: back.el, under: card.el, next: back, slide }, true);
        card.fail(result.problem.message);
      }
    } catch {
      button.textContent = label;
      button.disabled = false;
      card.fail("That didn’t send. Please check your connection and try again.");
    }
    busy = false;
  };

  const outro = () =>
    frame(
      "",
      fill(def.outro?.title, session.vars) || "Thank you.",
      fill(def.outro?.body, session.vars) || "Your answers have been received.",
    );

  /** @param {Card} next @returns {Move} a forward move onto a card outside the deck */
  const swapIn = (next) => {
    next.el.inert = true;
    stage.prepend(next.el);
    set(next.el, pose(0).under);
    return { dir: 1, top: card.el, under: next.el, next, slide: SUBMIT };
  };

  // --- gestures ------------------------------------------------------------

  /** @type {{ id: number, x: number, y: number, t: number, dx: number, speed: number, move: Move | null } | null} */
  let drag = null;
  let swallowClick = false;

  /** @param {number} dx @returns {number} progress of the top card for a drag of dx */
  const progress = (dx) => {
    const p = dx / (stage.clientWidth * TRAVEL);
    return dx < 0 ? clamp(-p) : clamp(1 - p);
  };

  stage.addEventListener("pointerdown", (e) => {
    swallowClick = false;
    if (busy || done || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const target = /** @type {Element} */ (e.target);
    // A slider is dragged sideways itself; with a mouse, so is selecting text
    if (target.closest("input[type=range]")) return;
    if (e.pointerType !== "touch" && target.closest(TYPING)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, speed: 0, move: null };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.move) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Mostly vertical: this is a scroll, not a swipe
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("is-dragging");
      getSelection()?.removeAllRanges();
      busy = true;
    }
    const dir = dx < 0 ? 1 : -1;
    if (drag.move?.dir !== dir) {
      // The finger crossed back over where it started: undo, and set up the other way
      if (drag.move && !("refused" in drag.move)) {
        drag.move.next.el.remove();
        card.el.style.transform = card.el.style.opacity = "";
      }
      drag.move = begin(dir);
    }
    const dt = e.timeStamp - drag.t;
    if (dt > 0) drag.speed = 0.7 * drag.speed + 0.3 * ((dx - drag.dx) / dt);
    drag.t = e.timeStamp;
    drag.dx = dx;

    if ("refused" in drag.move) {
      const pull = GIVE * (1 - 1 / (Math.abs(dx) / (GIVE * 2.2) + 1));
      const x = reduceMotion.matches ? 0 : Math.sign(dx) * pull;
      card.el.style.transform = `translate3d(${x}px, 0, 0) rotate(${(x / GIVE) * 2.2}deg)`;
    } else paint(drag.move, progress(dx));
  });

  /** @param {PointerEvent} e */
  const release = async (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { move, dx, speed } = drag;
    drag = null;
    if (!move) return;
    swallowClick = e.type === "pointerup";
    stage.classList.remove("is-dragging");
    if ("refused" in move) {
      // A small accidental pull is not worth a telling-off
      if (Math.abs(dx) < 24) move.refused = "";
      await refuse(move, false);
    } else {
      const far = Math.abs(dx) > stage.clientWidth * COMMIT_DISTANCE;
      const fast = Math.abs(speed) > COMMIT_SPEED && Math.sign(speed) === Math.sign(dx);
      await settle(move, e.type === "pointerup" && (far || fast));
    }
    busy = false;
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  // A drag that began on an option must not also choose it
  stage.addEventListener(
    "click",
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // A two-finger sideways swipe on a trackpad
  let wheelSum = 0;
  let wheelIdle = 0;
  let wheelSpent = false;
  stage.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(wheelIdle);
      // One swipe is one move, however long its momentum carries on
      wheelIdle = window.setTimeout(() => {
        wheelSum = 0;
        wheelSpent = false;
      }, 180);
      if (wheelSpent) return;
      wheelSum += e.deltaX;
      if (Math.abs(wheelSum) > 50) {
        wheelSpent = true;
        go(wheelSum > 0 ? 1 : -1);
      }
    },
    { passive: false },
  );

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || done) return;
    const target = /** @type {Element} */ (e.target);
    const typing = target.matches(TYPING);
    if (e.key === "Enter") {
      // In a long answer Enter is a new line; ⌘ or Ctrl with it moves on
      if (target.matches("textarea") && !(e.metaKey || e.ctrlKey)) return;
      if (target.matches("button, select")) return;
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.metaKey || e.ctrlKey || typing) {
      return;
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !target.matches("input")) {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key.length === 1) {
      /** @type {HTMLElement | null} */ (card.el.querySelector(`[data-key="${CSS.escape(e.key.toLowerCase())}"]`))?.click();
    }
  });

  session.onStatus((isOnline) => {
    online = isOnline;
    paintFoot();
  });
  window.addEventListener("pagehide", session.flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") session.flush();
  });

  // --- first card ----------------------------------------------------------

  recompute();
  if (session.submitted) {
    done = true;
    current = SUBMIT;
    card = outro();
  } else {
    current = slides.find((s) => s.id === session.position) ?? slides[0];
    hinted = current !== slides[0];
    card = build(current);
  }
  stage.append(card.el);
  card.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
  paintProgress();
  paintFoot();
  if (finePointer) focusCard();
};
