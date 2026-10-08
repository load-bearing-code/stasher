export const REDGIFS_OVERLAY_REQUEST = "stasher:getRedgifsOverlayPost";
export const REDGIFS_OVERLAY_CHANGED = "stasher:redgifsOverlayChanged";

/**
 * A gif overlay open on top of a RedGIFs page, detected by the content
 * script. RedGIFs opens posts in a lightbox that leaves `location.href`
 * unchanged, so this can't be detected from `tab.url` alone.
 */
export interface RedgifsOverlayPost {
  postId: string;
  postUrl: string;
}

export function isRedgifsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "redgifs.com";
  } catch {
    return false;
  }
}

export async function readRedgifsOverlayPostFromTab(
  tabId: number,
): Promise<RedgifsOverlayPost | null> {
  const reply = await browser.tabs.sendMessage(tabId, { type: REDGIFS_OVERLAY_REQUEST });
  if (typeof reply?.postId !== "string" || typeof reply?.postUrl !== "string") return null;
  return { postId: reply.postId, postUrl: reply.postUrl };
}
