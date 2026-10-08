import type { DetectedPost, DetectedProfile, SiteHandler } from "./types";

/**
 * Top-level Fansly routes that aren't creator usernames. Best-effort list;
 * extend as new non-profile routes are found, since Fansly has no reserved
 * username prefix to distinguish them structurally.
 */
const RESERVED_PATHS = new Set([
  "home",
  "explore",
  "live",
  "messages",
  "notifications",
  "wallet",
  "settings",
  "creator",
  "collections",
  "bookmarks",
  "search",
  "subscriptions",
  "support",
  "terms",
  "privacy",
  "dmca",
  "login",
  "signup",
  "onboarding",
  "verify",
  "for-you",
  "trending",
  "post",
]);

export const fanslyHandler: SiteHandler = {
  site: "fansly",
  label: "Fansly",
  host: "fansly.com",

  matchPost(url: URL): DetectedPost | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "fansly.com") return null;

    const [route, postId] = url.pathname.split("/").filter(Boolean);
    if (route?.toLowerCase() !== "post" || !postId || !/^\d+$/.test(postId)) return null;

    return {
      site: "fansly",
      postId,
      postUrl: `https://fansly.com/post/${postId}`,
    };
  },

  matchProfile(url: URL): DetectedProfile | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "fansly.com") return null;

    const [username] = url.pathname.split("/").filter(Boolean);
    if (!username || RESERVED_PATHS.has(username.toLowerCase())) return null;

    return {
      site: "fansly",
      username,
      // Canonical origin regardless of www., so the same profile always
      // produces the same URL for Stash to match against.
      profileUrl: `https://fansly.com/${username}`,
    };
  },
};
