import type { DetectedPost, DetectedProfile, SiteHandler } from "./types";

export const faphouseHandler: SiteHandler = {
  site: "faphouse",
  label: "FapHouse",
  host: "faphouse.com",

  // Post import isn't supported yet: FapHouse profile pages are a
  // client-rendered SPA, same obstacle as OnlyFans, so only the profile
  // metadata the page's Open Graph tags expose is scraped for now.
  matchPost(_url: URL): DetectedPost | null {
    return null;
  },

  matchProfile(url: URL): DetectedProfile | null {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "faphouse.com") return null;

    const [route, slug] = url.pathname.split("/").filter(Boolean);
    if ((route !== "pornstars" && route !== "models") || !slug) return null;

    return {
      site: "faphouse",
      username: slug,
      // Canonical origin regardless of www., so the same profile always
      // produces the same URL for Stash to match against. The route itself
      // (pornstars vs. models) is kept as-is: FapHouse redirects one to the
      // other depending on the profile, so forcing a single route would
      // just add an extra hop rather than normalize anything.
      profileUrl: `https://faphouse.com/${route}/${slug}`,
    };
  },
};
