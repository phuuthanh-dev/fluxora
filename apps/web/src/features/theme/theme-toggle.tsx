"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui";

export type ThemeMode = "light" | "dark";

const themeStorageKey = "fluxora-theme";
const legacyThemeStorageKey = "workflow-automation-theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

function readTheme(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function saveTheme(theme: ThemeMode) {
  try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* The current session still switches theme. */ }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    const stored = readTheme(themeStorageKey) ?? readTheme(legacyThemeStorageKey);
    const initial: ThemeMode = stored === "dark" || stored === "light"
      ? stored
      : current === "dark"
        ? "dark"
        : "light";
    applyTheme(initial);
    setTheme(initial);
    if (!readTheme(themeStorageKey) && stored) saveTheme(initial);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey && event.key !== legacyThemeStorageKey) return;
      if (event.newValue !== "dark" && event.newValue !== "light") return;
      applyTheme(event.newValue);
      setTheme(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="secondary"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={() => {
        applyTheme(nextTheme);
        saveTheme(nextTheme);
        setTheme(nextTheme);
      }}
    >
      {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </Button>
  );
}
