import type { DetectedPost, DetectedProfile, SiteHandler } from "./types";

/**
 * Top-level OnlyFans routes that aren't creator usernames. Best-effort list;
 * extend as new non-profile routes are found, since OnlyFans has no reserved
 * username prefix to distinguish them structurally.
 */
const RESERVED_PATHS = new Set([
  "my",
  "mystash",
  "messages",
  "notifications",
  "collections",
  "subscriptions",
  "payspermessages",
  "payspersubscribes",
  "earnings",
  "statistics",
  "settings",
  "search",
  "suggested",
  "login",
  "signup",
  "lists",
]);

export const onlyfansHandler: SiteHandler = {
  site: "onlyfans",
  label: "OnlyFans",
  host: "onlyfans.com",

  // Post import isn't supported yet: OnlyFans' API requires a signature only
  // its own frontend can compute, and post pages don't expose enough in page
  // metadata the way profile pages do.
  matchPost(_url: URL): DetectedPost | null {
    return null;
  },

  matchProfile(url: URL): DetectedProfile | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "onlyfans.com") return null;

    const [username] = url.pathname.split("/").filter(Boolean);
    if (!username || RESERVED_PATHS.has(username.toLowerCase())) return null;

    return {
      site: "onlyfans",
      username,
      // Canonical origin regardless of www., so the same profile always
      // produces the same URL for Stash to match against.
      profileUrl: `https://onlyfans.com/${username}`,
    };
  },
};
