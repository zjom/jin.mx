// @ts-check

// Strong jolts (m/s², gravity excluded) needed within WINDOW_MS to count
const THRESHOLD = 15;
const JOLTS = 3;
const WINDOW_MS = 800;
const COOLDOWN_MS = 1000;
const GRAVITY = 9.81;

/**
 * @param {DeviceMotionEvent} e
 * @returns {number | null}
 */
const joltOf = (e) => {
  const a = e.acceleration;
  if (a && a.x != null && a.y != null && a.z != null) return Math.hypot(a.x, a.y, a.z);
  const g = e.accelerationIncludingGravity;
  if (g && g.x != null && g.y != null && g.z != null) {
    return Math.abs(Math.hypot(g.x, g.y, g.z) - GRAVITY);
  }
  return null;
};

// iOS only delivers motion events after a permission prompt, which must be
// raised from a user gesture; `permit` is meant to be called from one.
/**
 * @param {Window} win
 * @param {() => void} onShake
 * @returns {{ permit: () => void }}
 */
export const watchShake = (win, onShake) => {
  /** @type {number[]} */
  let jolts = [];
  let quietUntil = 0;

  win.addEventListener("devicemotion", (e) => {
    const jolt = joltOf(e);
    if (jolt == null || jolt < THRESHOLD || e.timeStamp < quietUntil) return;
    jolts = [...jolts.filter((t) => e.timeStamp - t < WINDOW_MS), e.timeStamp];
    if (jolts.length < JOLTS) return;
    jolts = [];
    quietUntil = e.timeStamp + COOLDOWN_MS;
    onShake();
  });

  /** @type {any} */
  const Motion = win.DeviceMotionEvent;
  let asked = false;
  return {
    permit: () => {
      if (asked || typeof Motion?.requestPermission !== "function") return;
      asked = true;
      Motion.requestPermission().catch(() => {});
    },
  };
};
