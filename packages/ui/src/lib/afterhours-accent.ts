// Afterhours accent presets. The colours themselves live in globals.css ([data-accent="..."] blocks);
// this file lists them for a picker and switches between them.

export type AccentKey =
  | "amber"
  | "rose"
  | "violet"
  | "sky"
  | "teal"
  | "lime"
  | "coral"
  | "ochre"
  | "azure"
  | "lagoon"
  | "periwinkle"
  | "jade"
  | "lilac"
  | "sage";

export type AccentPreset = {
  key: AccentKey;
  name: string;
  group: "original" | "harmony";
  /** For harmonies: how the hue relates to Amber. */
  harmony?: string;
  /** Swatch colours (also available as var(--preset-<key>), -hi and -lo). */
  accent: string;
  hi: string;
  lo: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: "amber", name: "Amber", group: "original", accent: "#e8a26a", hi: "#f3ad74", lo: "#dc8443" },
  { key: "rose", name: "Rose", group: "original", accent: "#ec7f9a", hi: "#f59ab0", lo: "#d9607f" },
  { key: "violet", name: "Violet", group: "original", accent: "#a98bf5", hi: "#bba3fa", lo: "#8d6ce8" },
  { key: "sky", name: "Sky", group: "original", accent: "#6fb3f2", hi: "#8cc4f6", lo: "#4f98e0" },
  { key: "teal", name: "Teal", group: "original", accent: "#4fd1b8", hi: "#6fe0c9", lo: "#2fb39b" },
  { key: "lime", name: "Lime", group: "original", accent: "#b5d96a", hi: "#c6e584", lo: "#98c247" },
  { key: "coral", name: "Coral", group: "harmony", harmony: "Analogous", accent: "#f2988b", hi: "#fda395", lo: "#e47972" },
  { key: "ochre", name: "Ochre", group: "harmony", harmony: "Analogous", accent: "#d0b05c", hi: "#dabb67", lo: "#c3951f" },
  { key: "azure", name: "Azure", group: "harmony", harmony: "Complementary", accent: "#6cbdf2", hi: "#78c8fe", lo: "#2ca9e4" },
  { key: "lagoon", name: "Lagoon", group: "harmony", harmony: "Split-complementary", accent: "#4bc7d9", hi: "#59d2e5", lo: "#03b2bf" },
  { key: "periwinkle", name: "Periwinkle", group: "harmony", harmony: "Split-complementary", accent: "#97b1fa", hi: "#a5bcfe", lo: "#739af0" },
  { key: "jade", name: "Jade", group: "harmony", harmony: "Triadic", accent: "#56cbb5", hi: "#62d6c0", lo: "#09b798" },
  { key: "lilac", name: "Lilac", group: "harmony", harmony: "Triadic", accent: "#bda4f0", hi: "#c8aefb", lo: "#a38be7" },
  { key: "sage", name: "Sage", group: "harmony", harmony: "Tetradic", accent: "#80c78d", hi: "#8ad298", lo: "#63b366" },
];

export const DEFAULT_ACCENT: AccentKey = "amber";
const STORAGE_KEY = "afterhours-accent";

function isAccent(value: unknown): value is AccentKey {
  return ACCENT_PRESETS.some((p) => p.key === value);
}

/** Apply an accent to the whole app and remember it. Call from the client. */
export function setAccent(key: AccentKey) {
  document.documentElement.dataset.accent = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Storage can be unavailable (private mode); the accent still applies for this visit.
  }
}

/** The saved accent, or the default. Call from the client. */
export function getAccent(): AccentKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isAccent(saved)) return saved;
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_ACCENT;
}

/**
 * Inline this in <head> (before paint) so a saved accent applies without a flash:
 *   <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />
 */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem("${STORAGE_KEY}");if(a&&${JSON.stringify(
  ACCENT_PRESETS.map((p) => p.key),
)}.indexOf(a)>-1)document.documentElement.dataset.accent=a}catch(e){}`;
