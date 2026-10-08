const FANSLY_SESSION_MESSAGE = "stasher:getFanslySession";

export async function getFanslyToken(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const reply = await browser.tabs.sendMessage(tab.id, { type: FANSLY_SESSION_MESSAGE });
    return typeof reply?.token === "string" ? reply.token : null;
  } catch {
    return null;
  }
}
