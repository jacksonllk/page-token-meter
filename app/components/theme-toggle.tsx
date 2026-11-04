"use client";

import { MoonIcon, SunIcon } from "./icons";

// Switches between light (default) and dark mode, and remembers the choice in this browser.
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Storage can be blocked. The toggle still works for this visit.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Light or dark mode"
      className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-faint hover:text-fg"
    >
      <MoonIcon className="size-4 dark:hidden" />
      <SunIcon className="hidden size-4 dark:inline-block" />
    </button>
  );
}
