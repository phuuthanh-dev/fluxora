"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui";

export type ThemeMode = "light" | "dark";

const themeStorageKey = "workflow-automation-theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    const stored = window.localStorage.getItem(themeStorageKey);
    const initial: ThemeMode = stored === "dark" || stored === "light"
      ? stored
      : current === "dark"
        ? "dark"
        : "light";
    applyTheme(initial);
    setTheme(initial);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey || (event.newValue !== "dark" && event.newValue !== "light")) return;
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
        window.localStorage.setItem(themeStorageKey, nextTheme);
        setTheme(nextTheme);
      }}
    >
      {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </Button>
  );
}
