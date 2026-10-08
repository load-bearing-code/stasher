import type { SiteProfile } from "@stasher/protocol";

export const ONLYFANS_PROFILE_REQUEST = "stasher:getOnlyfansProfile";
export const ONLYFANS_PROFILE_CHANGED = "stasher:onlyfansProfileChanged";

export function isOnlyfansUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "onlyfans.com";
  } catch {
    return false;
  }
}

/**
 * Asks the OnlyFans content script for the profile it scraped from the
 * currently open page (`null` if the page isn't a profile, or the content
 * script hasn't captured it yet). The desktop app has no way to fetch this
 * itself — OnlyFans' API requires a signature only its own frontend can
 * compute — so this is the only source of OnlyFans profile data.
 */
export async function readOnlyfansProfileFromTab(tabId: number): Promise<SiteProfile | null> {
  const reply = await browser.tabs.sendMessage(tabId, { type: ONLYFANS_PROFILE_REQUEST });
  if (typeof reply?.username !== "string" || typeof reply?.profileUrl !== "string") return null;
  return {
    site: "onlyfans",
    username: reply.username,
    profileUrl: reply.profileUrl,
    displayName: typeof reply.displayName === "string" ? reply.displayName : null,
    photoUrl: typeof reply.photoUrl === "string" ? reply.photoUrl : null,
    remoteId: reply.username,
    bio: typeof reply.bio === "string" ? reply.bio : null,
    location: null,
    links: [],
    tags: [],
  };
}
