/// <reference types="vite/client" />

"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const THEME_KEY = "regulatory:theme";

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** A persistent override; until chosen, the theme follows the operating system. */
export function ThemeControl() {
  // The server and first client render agree even when the pre-paint script chose dark.
  const [theme, setTheme] = useState<Theme | null>(null);
  const temporaryTheme = useRef<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let active = true;
    const sync = () => {
      if (!active) return;
      const next = temporaryTheme.current ?? savedTheme() ?? (media.matches ? "dark" : "light");
      applyTheme(next);
      setTheme(next);
    };
    queueMicrotask(sync);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // The selection still applies for this page when storage is unavailable.
      temporaryTheme.current = next;
    }
  };

  const label = theme === null ? "Toggle color theme" : `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
      <span className="theme-toggle-icon" aria-hidden="true">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</span>
      <span className="theme-toggle-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
