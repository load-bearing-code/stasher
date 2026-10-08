import {
  FANSLY_SESSION_CHANGED,
  FANSLY_SESSION_REQUEST,
  type FanslySession,
} from "@/features/sources/fansly-session";

const SESSION_KEY = "session_active_session";
const SESSION_POLL_MS = 5_000;

function readSession(): FanslySession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return { state: "signedOut", token: null };
    const session = JSON.parse(raw);
    if (session === null) return { state: "signedOut", token: null };
    if (typeof session?.token === "string" && session.token.length > 0) {
      return { state: "signedIn", token: session.token };
    }
    return { state: "unknown", token: null };
  } catch {
    return { state: "unknown", token: null };
  }
}

export default defineContentScript({
  matches: ["*://*.fansly.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== FANSLY_SESSION_REQUEST) return false;
      sendResponse(readSession());
      return false;
    });

    let lastSession = readSession();
    void browser.runtime.sendMessage({ type: FANSLY_SESSION_CHANGED });
    setInterval(() => {
      const session = readSession();
      if (session.state === lastSession.state && session.token === lastSession.token) return;
      lastSession = session;
      void browser.runtime.sendMessage({ type: FANSLY_SESSION_CHANGED });
    }, SESSION_POLL_MS);
  },
});
