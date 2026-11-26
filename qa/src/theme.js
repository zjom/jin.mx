// @ts-check

const KEY = "qa:theme";
const BG = { light: "#f6f5f0", dark: "#141415" };

/**
 * The first theme is set before paint by /theme.js; this keeps it in step
 * with the toggle and, until the toggle is used, with the system
 * @param {HTMLButtonElement} button
 */
export const initTheme = (button) => {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const system = matchMedia("(prefers-color-scheme: dark)");

  /** @param {"light" | "dark"} theme */
  const apply = (theme) => {
    root.dataset.theme = theme;
    meta?.setAttribute("content", BG[theme]);
    button.setAttribute("aria-pressed", String(theme === "dark"));
  };

  /** @returns {"light" | "dark" | null} */
  const stored = () => {
    try {
      const t = localStorage.getItem(KEY);
      return t === "dark" || t === "light" ? t : null;
    } catch {
      return null;
    }
  };

  apply(stored() ?? (system.matches ? "dark" : "light"));

  button.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the choice lasts for this visit only
    }
  });

  system.addEventListener("change", () => {
    if (!stored()) apply(system.matches ? "dark" : "light");
  });
};
