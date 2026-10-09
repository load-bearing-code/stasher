import { getFaphouseCookieHeader } from "@/features/sources/faphouse-session";
import { getFanslyTokenFromTab } from "@/features/sources/fansly-session";

export async function getFanslyToken(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  return getFanslyTokenFromTab(tab.id);
}

export async function getFaphouseToken(): Promise<string | null> {
  return getFaphouseCookieHeader().catch(() => null);
}
