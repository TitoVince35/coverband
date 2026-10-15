import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { applyTheme, readStoredTheme, resolveTheme, storeTheme, type Theme } from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(resolveTheme(theme, media.matches));
    update();
    if (theme !== "system") {
      return;
    }
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const setTheme = (next: Theme) => {
    storeTheme(next);
    setThemeState(next);
  };

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
