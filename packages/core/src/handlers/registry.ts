import { faphouseHandler } from "./faphouse";
import { fanslyHandler } from "./fansly";
import { onlyfansHandler } from "./onlyfans";
import { redgifsHandler } from "./redgifs";
import type { DetectedPost, DetectedProfile, SiteHandler, SiteInfo } from "./types";

const handlers: SiteHandler[] = [fanslyHandler, redgifsHandler, onlyfansHandler, faphouseHandler];

/** Every supported site, as display-facing summaries (the "sources" list). */
export const sites: SiteInfo[] = handlers.map(({ site, label, host }) => ({ site, label, host }));

/** Runs every registered site handler against `url`, returning the first post match. */
export function matchPost(url: URL | string): DetectedPost | null {
  const parsed = typeof url === "string" ? new URL(url) : url;
  for (const handler of handlers) {
    const match = handler.matchPost(parsed);
    if (match) return match;
  }
  return null;
}

/** Runs every registered site handler against `url`, returning the first match. */
export function matchProfile(url: URL | string): DetectedProfile | null {
  const parsed = typeof url === "string" ? new URL(url) : url;
  for (const handler of handlers) {
    const match = handler.matchProfile(parsed);
    if (match) return match;
  }
  return null;
}
