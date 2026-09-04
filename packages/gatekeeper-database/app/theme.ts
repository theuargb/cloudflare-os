import {
  applyAccentColor,
  type GatekeeperAppTheme,
} from "@gadgets/workshop-shared/theme";

export type ResolvedThemeMode = "light" | "dark";

let current: ResolvedThemeMode =
  document.documentElement.dataset.mode === "dark" ? "dark" : "light";
const listeners = new Set<(mode: ResolvedThemeMode) => void>();

export function getThemeMode(): ResolvedThemeMode {
  return current;
}

export function applyAppTheme(theme: GatekeeperAppTheme): void {
  document.documentElement.dataset.mode = theme.mode;
  document.documentElement.style.colorScheme = theme.mode;
  applyAccentColor(document.documentElement.style, theme.accentColor);
  if (current === theme.mode) return;
  current = theme.mode;
  for (let listener of listeners) listener(theme.mode);
}

export function subscribeThemeMode(
  listener: (mode: ResolvedThemeMode) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
