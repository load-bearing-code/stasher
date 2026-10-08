import type { DetectedPost, DetectedProfile, SiteHandler } from "./types";

export const redgifsHandler: SiteHandler = {
  site: "redgifs",
  label: "RedGIFs",
  host: "redgifs.com",

  matchPost(url: URL): DetectedPost | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "redgifs.com") return null;

    const [route, id] = url.pathname.split("/").filter(Boolean);
    if (route?.toLowerCase() !== "watch" || !id) return null;

    return {
      site: "redgifs",
      postId: id,
      // Canonical origin regardless of www., so the same post always
      // produces the same URL for Stash to match against.
      postUrl: `https://www.redgifs.com/watch/${id}`,
    };
  },

  matchProfile(url: URL): DetectedProfile | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "redgifs.com") return null;

    const [route, username] = url.pathname.split("/").filter(Boolean);
    if (route?.toLowerCase() !== "users" || !username) return null;

    return {
      site: "redgifs",
      username,
      // Canonical origin regardless of www., so the same profile always
      // produces the same URL for Stash to match against.
      profileUrl: `https://www.redgifs.com/users/${username}`,
    };
  },
};
