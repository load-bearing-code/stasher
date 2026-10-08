// The fields a filename template can interpolate, and how each one formats.
// Mirrors the "File layout" builder from the macOS design prototype.

export type TokenKey = "site" | "performer" | "id" | "title" | "date" | "resolution" | "extension";

export type FormatKind = "text" | "id" | "date" | "res" | "ext";

export interface TokenDef {
  key: TokenKey;
  label: string;
  description: string;
  kind: FormatKind;
}

export const TOKENS: TokenDef[] = [
  { key: "site", label: "Site", description: "Source site", kind: "text" },
  { key: "performer", label: "Performer", description: "Performer name", kind: "text" },
  { key: "id", label: "ID", description: "Source scene ID", kind: "id" },
  { key: "title", label: "Title", description: "Scene title", kind: "text" },
  { key: "date", label: "Date", description: "Release date, YYYY-MM-DD", kind: "date" },
  { key: "resolution", label: "Resolution", description: "1080p, 2160p…", kind: "res" },
  { key: "extension", label: "Extension", description: "File extension", kind: "ext" },
];

export const TOKEN_BY_KEY: Record<string, TokenDef | undefined> = Object.fromEntries(
  TOKENS.map((token) => [token.key, token]),
);

export interface FormatOption {
  value: string;
  label: string;
}

// Format variants offered per token kind. An empty value is the default.
export const FORMATS: Record<FormatKind, FormatOption[]> = {
  text: [
    { value: "", label: "Original" },
    { value: "lower", label: "lowercase" },
    { value: "upper", label: "UPPERCASE" },
    { value: "title", label: "Title Case" },
    { value: "kebab", label: "kebab-case" },
    { value: "snake", label: "snake_case" },
  ],
  id: [
    { value: "", label: "As is" },
    { value: "pad8", label: "Pad to 8 digits" },
  ],
  date: [
    { value: "", label: "ISO" },
    { value: "compact", label: "Compact" },
    { value: "dmy", label: "Day first" },
    { value: "month", label: "Month & year" },
  ],
  res: [
    { value: "", label: "Lines" },
    { value: "label", label: "Label" },
  ],
  ext: [
    { value: "", label: "lowercase" },
    { value: "upper", label: "UPPERCASE" },
  ],
};

// Example scene used to render the live preview as the template is edited.
export const SAMPLE: Record<TokenKey, string> = {
  site: "Fansly",
  performer: "Sienna Kade",
  id: "884213",
  title: "Golden hour on the rooftop",
  date: "2026-09-28",
  resolution: "2160p",
  extension: "mp4",
};

export interface Preset {
  label: string;
  template: string;
}

export const PRESETS: Preset[] = [
  { label: "By performer", template: "{performer}/{date} – {title}.{extension}" },
  { label: "By site", template: "{site}/{performer}/{title} [{id}].{extension}" },
  { label: "By date", template: "{date} {performer} – {title}.{extension}" },
  { label: "Flat", template: "{date} {performer} – {title} [{resolution}].{extension}" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Apply a format variant to a raw token value.
export function formatValue(value: string, fmt: string): string {
  if (!fmt) return value;
  const slug = (sep: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, sep)
      .replace(new RegExp(`^\\${sep}|\\${sep}$`, "g"), "");
  const [y, mo, d] = value.split("-");
  const variants: Record<string, string> = {
    lower: value.toLowerCase(),
    upper: value.toUpperCase(),
    title: value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
    kebab: slug("-"),
    snake: slug("_"),
    compact: `${y}${mo}${d}`,
    dmy: `${d}.${mo}.${y}`,
    month: `${MONTHS[Number(mo) - 1]} ${y}`,
    pad8: value.padStart(8, "0"),
    label:
      ({ "2160p": "4K", "1440p": "QHD", "1080p": "HD", "720p": "HD" } as Record<string, string>)[
        value
      ] ?? value,
  };
  return variants[fmt] ?? value;
}

// Splits a template into alternating plain-text and `{token}` segments.
// Text segments sit at even indices, token segments at odd indices.
export function splitTemplate(template: string): string[] {
  return template.split(/(\{\w+(?:\|[\w-]+)?\})/);
}

export interface TokenMatch {
  key: string;
  fmt: string;
}

// Parses a single segment as a token, or returns null for plain text.
export function matchToken(segment: string): TokenMatch | null {
  const m = /^\{(\w+)(?:\|([\w-]+))?\}$/.exec(segment);
  return m ? { key: m[1], fmt: m[2] ?? "" } : null;
}

const ILLEGAL_FILENAME_CHARS = /[:*?"<>|]/g;

// Renders the template against the sample scene, stripping characters that
// are illegal in a filename.
export function renderTemplate(template: string): string {
  let out = template;
  for (const token of TOKENS) {
    out = out.replace(
      new RegExp(`\\{${token.key}(?:\\|([\\w-]+))?\\}`, "g"),
      (_match, fmt: string | undefined) => formatValue(SAMPLE[token.key], fmt ?? ""),
    );
  }
  return out.replace(ILLEGAL_FILENAME_CHARS, "");
}
