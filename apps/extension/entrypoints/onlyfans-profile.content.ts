import {
  ONLYFANS_PROFILE_CHANGED,
  ONLYFANS_PROFILE_REQUEST,
} from "@/features/sources/onlyfans-profile";

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
 * Reads the profile OnlyFans itself already rendered into this page's Open
 * Graph tags, rather than scraping the app's React DOM (whose class names
 * and structure change with every redesign) or trying to call OnlyFans' API
 * directly (which requires a signature only its own frontend can compute).
 * `og:title` is formatted as "<display name> (@<username>) | OnlyFans";
 * verify this against the live site if it ever stops matching.
 */
function readProfile(): ScrapedProfile | null {
  const username = location.pathname.split("/").filter(Boolean)[0];
  if (!username || RESERVED_PATHS.has(username.toLowerCase())) return null;

  const title = metaContent("og:title");
  const displayName = title?.replace(/\s*\(@[^)]+\)\s*\|\s*OnlyFans\s*$/i, "").trim() || null;

  return {
    username,
    profileUrl: `https://onlyfans.com/${username}`,
    displayName: displayName && displayName.length > 0 ? displayName : null,
    photoUrl: metaContent("og:image"),
    bio: metaContent("og:description"),
  };
}

export default defineContentScript({
  matches: ["*://onlyfans.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== ONLYFANS_PROFILE_REQUEST) return false;
      sendResponse(readProfile());
      return false;
    });

    let lastUsername = readProfile()?.username ?? null;
    setInterval(() => {
      const profile = readProfile();
      if ((profile?.username ?? null) === lastUsername) return;
      lastUsername = profile?.username ?? null;
      void browser.runtime.sendMessage({ type: ONLYFANS_PROFILE_CHANGED });
    }, PROFILE_POLL_MS);
  },
});
