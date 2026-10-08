import { fanslyHandler } from "./fansly";
import type { DetectedPost, DetectedProfile, SiteHandler } from "./types";

const handlers: SiteHandler[] = [fanslyHandler];

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
