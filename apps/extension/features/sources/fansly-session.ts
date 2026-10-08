import type { SourceSessionState } from "@stasher/protocol";

export const FANSLY_SESSION_REQUEST = "stasher:getFanslySession";
export const FANSLY_SESSION_CHANGED = "stasher:fanslySessionChanged";

export interface FanslySession {
  state: SourceSessionState;
  token: string | null;
}

export function isFanslyUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "fansly.com";
  } catch {
    return false;
  }
}

export async function readFanslySessionFromTab(tabId: number): Promise<FanslySession> {
  const reply = await browser.tabs.sendMessage(tabId, { type: FANSLY_SESSION_REQUEST });
  if (reply?.state !== "unknown" && reply?.state !== "signedOut" && reply?.state !== "signedIn") {
    return { state: "unknown", token: null };
  }
  return {
    state: reply.state,
    token: typeof reply.token === "string" ? reply.token : null,
  };
}

export async function getFanslyTokenFromTab(tabId: number): Promise<string | null> {
  return readFanslySessionFromTab(tabId)
    .then((session) => (session.state === "signedIn" ? session.token : null))
    .catch(() => null);
}
