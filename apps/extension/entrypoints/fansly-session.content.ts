export const FANSLY_SESSION_MESSAGE = "stasher:getFanslySession";

export default defineContentScript({
  matches: ["*://*.fansly.com/*"],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== FANSLY_SESSION_MESSAGE) return false;
      try {
        const session = JSON.parse(localStorage.getItem("session_active_session") ?? "null");
        sendResponse({ token: typeof session?.token === "string" ? session.token : null });
      } catch {
        sendResponse({ token: null });
      }
      return false;
    });
  },
});
