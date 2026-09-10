"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const THEME_KEY = "cvmorph_theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(THEME_KEY) as Theme | null;
        if (saved === "light" || saved === "dark") return saved;
        const attr = document.documentElement.getAttribute("data-theme") as Theme | null;
        if (attr === "light" || attr === "dark") return attr;
      } catch {
        // ignore localStorage access errors
      }
    }
    return "dark";
  });

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(THEME_KEY) as Theme | null) ||
        (document.documentElement.getAttribute("data-theme") as Theme | null) ||
        "dark";
      const validTheme: Theme = saved === "light" ? "light" : "dark";
      setThemeState(validTheme);
      document.documentElement.setAttribute("data-theme", validTheme);
      document.cookie = `${THEME_KEY}=${validTheme}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_KEY, t);
      document.cookie = `${THEME_KEY}=${t}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}