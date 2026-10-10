#!/usr/bin/env node
// Afterhours leftover check: finds anything from the previous design system still in the project.
//
//   node scripts/check-css-vars.mjs                 # scans app, src, components, lib, pages, styles
//   node scripts/check-css-vars.mjs src packages/ui # or the folders you name
//   node scripts/check-css-vars.mjs --colors        # also list hard-coded colours in components
//
// It reports:
//   1. CSS variables your code reads (var(--x), Tailwind's (--x) and [--x]) that nothing defines.
//      After the switch, these are almost always names from the old system.
//   2. Markers of the old system: Obsidian files and globals, the prototype runtime, Geist font variables,
//      and classes from before the rename (stasher-glass and friends).
//   3. With --colors: hex, rgb(), hsl() and oklch() literals in .tsx/.jsx/.ts files, which bypass the tokens.
// Exits with code 1 when it finds something, so it can run in CI. No dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const args = process.argv.slice(2);
const wantColors = args.includes("--colors");
const roots = args.filter((a) => !a.startsWith("--"));
const ROOT = process.cwd();
const DIRS = (roots.length ? roots : ["app", "src", "components", "lib", "pages", "styles"]).filter((d) => existsSync(join(ROOT, d)));
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".mdx", ".html"]);
const SKIP = new Set(["node_modules", ".next", "dist", "build", "out", ".turbo", ".git", "coverage"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.has(extname(name))) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
if (!files.length) {
  console.log("No source files found. Run this from the project root, or pass the folders to scan.");
  process.exit(0);
}

// Everything defined: declarations in any scanned CSS, inline style props ("--x": ...), and Tailwind's own theme.
const defined = new Set();
const DECL = /(?:^|[;{\s[])(--[A-Za-z0-9_-]+)\s*:/g; // also Tailwind arbitrary properties: [--cell-size:...]
const INLINE_DECL = /["'`](--[A-Za-z0-9_-]+)["'`]\s*:/g;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(DECL)) defined.add(m[1]);
  for (const m of src.matchAll(INLINE_DECL)) defined.add(m[1]);
}
const twTheme = join(ROOT, "node_modules", "tailwindcss", "theme.css");
if (existsSync(twTheme)) for (const m of readFileSync(twTheme, "utf8").matchAll(DECL)) defined.add(m[1]);
// Tailwind @theme names become --color-*, --text-*, ... ; utilities read them, so @theme-declared names count too (already above).

const IGNORE = [/-$/, /^--tw-/, /^--radix-/, /^--spacing$/, /^--default-/, /^--animate-/, /^--tw$/];
const USE = [/var\(\s*(--[A-Za-z0-9_-]+)/g, /\((--[A-Za-z0-9_-]+)\)/g, /\[(--[A-Za-z0-9_-]+)\]/g];

const missing = new Map(); // name -> [file:line]
const MARKERS = [
  [/obsidian/i, "Obsidian reference"],
  [/_ds\//, "old design-system folder (_ds/)"],
  [/_ds_bundle/, "old component bundle (_ds_bundle.js)"],
  [/ObsidianDesignSystem/, "old Obsidian component"],
  [/<x-import|component-from-global-scope/, "prototype component import"],
  [/\bsupport\.js\b|\bimage-slot\.js\b/, "prototype runtime script"],
  [/--font-geist|\bGeist(?:_Mono)?\b/, "Geist font (Afterhours uses system fonts)"],
  [/lucide-static/, "lucide-static icon font (use lucide-react)"],
  [/\bstasher-(?:glass|matte|menu|gloss|well|accent)\b/, "pre-rename class or file (now afterhours-*)"],
];
const markers = [];
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/g;
const colors = [];

for (const f of files) {
  const rel = relative(ROOT, f);
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const used = new Set();
    for (const re of USE) for (const m of line.matchAll(re)) used.add(m[1]);
    for (const n of used) {
      if (defined.has(n) || IGNORE.some((r) => r.test(n))) continue;
      if (!missing.has(n)) missing.set(n, []);
      missing.get(n).push(at);
    }
    for (const [re, label] of MARKERS) if (re.test(line)) markers.push(`${at}  ${label}`);
    if (wantColors && /\.(tsx|jsx|ts)$/.test(f) && !/afterhours-accent\.ts$/.test(f)) {
      for (const m of line.matchAll(COLOR)) colors.push(`${at}  ${m[0]}`);
    }
  });
}

let problems = 0;
console.log(`Scanned ${files.length} files in ${DIRS.join(", ")}\n`);

if (missing.size) {
  problems += missing.size;
  console.log(`Undefined CSS variables (${missing.size}), likely from the old design system:`);
  for (const [n, where] of [...missing].sort()) {
    console.log(`  ${n}  (${where.length}x)  ${where.slice(0, 3).join(", ")}${where.length > 3 ? ", ..." : ""}`);
  }
  console.log();
} else console.log("Undefined CSS variables: none\n");

if (markers.length) {
  problems += markers.length;
  console.log(`Old-system markers (${markers.length}):`);
  for (const m of markers) console.log("  " + m);
  console.log();
} else console.log("Old-system markers: none\n");

if (wantColors) {
  if (colors.length) {
    console.log(`Hard-coded colours in components (${colors.length}); swap for tokens where they're UI colours:`);
    for (const c of colors) console.log("  " + c);
    console.log();
  } else console.log("Hard-coded colours in components: none\n");
}

console.log(problems ? "Found leftovers. Fix the lines above and run again." : "Clean: nothing from the old design system found.");
process.exit(problems ? 1 : 0);
