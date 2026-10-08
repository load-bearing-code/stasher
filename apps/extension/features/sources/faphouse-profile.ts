import type { SiteProfile } from "@stasher/protocol";

export const FAPHOUSE_PROFILE_REQUEST = "stasher:getFaphouseProfile";
export const FAPHOUSE_PROFILE_CHANGED = "stasher:faphouseProfileChanged";

export function isFaphouseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "faphouse.com";
  } catch {
    return false;
  }
}

/**
 * Asks the FapHouse content script for the profile it scraped from the
 * currently open page (`null` if the page isn't a pornstar profile, or the
 * content script hasn't captured it yet). FapHouse's profile pages are a
 * client-rendered SPA with no public API, so this is the only source of
 * FapHouse profile data.
 */
export async function readFaphouseProfileFromTab(tabId: number): Promise<SiteProfile | null> {
  const reply = await browser.tabs.sendMessage(tabId, { type: FAPHOUSE_PROFILE_REQUEST });
  if (typeof reply?.username !== "string" || typeof reply?.profileUrl !== "string") return null;
  return {
    site: "faphouse",
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
