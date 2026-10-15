// Colour theme handling. The same rules are inlined in index.html so the theme
// applies before React loads (no light flash): keep both in sync.

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "coverband-theme";
export const DEFAULT_THEME: Theme = "dark";

/** Status bar / title bar colour per resolved theme: dark background, or brand emerald. */
export const THEME_COLORS = { dark: "#0c090c", light: "#007a55" } as const;

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME;
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): "light" | "dark" {
  if (theme === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return theme;
}

export function readStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}

export function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);
}
