import {
  FAPHOUSE_PROFILE_CHANGED,
  FAPHOUSE_PROFILE_REQUEST,
} from "@/features/sources/faphouse-profile";

const PROFILE_POLL_MS = 2_000;

interface ScrapedProfile {
  username: string;
  profileUrl: string;
  displayName: string | null;
  photoUrl: string | null;
  bio: string | null;
}

function metaContent(name: string): string | null {
  const el = document.querySelector(
    `meta[property="${name}"], meta[name="${name}"]`,
  );
  const content = el?.getAttribute("content")?.trim();
  return content ? content : null;
}

/**
 * Reads the profile FapHouse itself already rendered into this page's Open
 * Graph tags, rather than scraping the SPA's hydrated DOM (whose structure
 * depends on client-side JS and isn't guaranteed stable). `og:title` is
 * formatted as "<display name> Porn Videos"; verify this against the live
 * site if it ever stops matching.
 */
function readProfile(): ScrapedProfile | null {
  const [route, slug] = location.pathname.split("/").filter(Boolean);
  if ((route !== "pornstars" && route !== "models") || !slug) return null;

  const title = metaContent("og:title");
  const displayName = title?.replace(/\s*Porn Videos\s*$/i, "").trim() || null;

  return {
    username: slug,
    // The route itself (pornstars vs. models) is kept as-is: FapHouse
    // redirects one to the other depending on the profile, so forcing a
    // single route would just add an extra hop rather than normalize anything.
    profileUrl: `https://faphouse.com/${route}/${slug}`,
    displayName: displayName && displayName.length > 0 ? displayName : null,
    photoUrl: metaContent("og:image"),
    bio: metaContent("og:description"),
  };
}

export default defineContentScript({
  matches: ["*://faphouse.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== FAPHOUSE_PROFILE_REQUEST) return false;
      sendResponse(readProfile());
      return false;
    });

    let lastUsername = readProfile()?.username ?? null;
    setInterval(() => {
      const profile = readProfile();
      if ((profile?.username ?? null) === lastUsername) return;
      lastUsername = profile?.username ?? null;
      void browser.runtime.sendMessage({ type: FAPHOUSE_PROFILE_CHANGED });
    }, PROFILE_POLL_MS);
  },
});
