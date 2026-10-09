export function isFaphouseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "faphouse.com";
  } catch {
    return false;
  }
}

/**
 * FapHouse's post pages are server-rendered and embed signed CDN download
 * URLs directly in the HTML, but only for an authenticated, subscribed
 * session. The session cookie is httpOnly, so it can't be read from a
 * content script via `document.cookie` — `browser.cookies` is the only API
 * that can see it, which is why this reads cookies directly instead of
 * mirroring Fansly's content-script/localStorage approach.
 */
export async function getFaphouseCookieHeader(): Promise<string | null> {
  const cookies = await browser.cookies.getAll({ domain: "faphouse.com" });
  if (cookies.length === 0) return null;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
