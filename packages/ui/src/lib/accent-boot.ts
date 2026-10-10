import { ACCENT_PRESETS } from "./afterhours-accent";

// Mirrors the key ACCENT_BOOT_SCRIPT reads in afterhours-accent.ts, which keeps it private.
// If that key ever changes upstream, the worst case here is a one-frame flash, not a wrong accent.
const STORAGE_KEY = "afterhours-accent";

/**
 * Apply the saved accent before the first paint.
 *
 * The browser-side equivalent of inlining ACCENT_BOOT_SCRIPT in <head>: Vite and
 * WXT entry modules are deferred, so they run before the first paint, and MV3's
 * CSP forbids inline scripts in extension pages.
 *
 * Deliberately leaves the data-accent already on <html> alone when nothing is
 * saved, so that attribute stays the app's default. Using getAccent() here would
 * overwrite it with "amber" instead.
 */
export function bootAccent(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ACCENT_PRESETS.some((preset) => preset.key === saved)) {
      document.documentElement.dataset.accent = saved;
    }
  } catch {
    // Storage can be unavailable (private mode); the <html> default still applies.
  }
}
