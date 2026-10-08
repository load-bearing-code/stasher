import {
  REDGIFS_OVERLAY_CHANGED,
  REDGIFS_OVERLAY_REQUEST,
  type RedgifsOverlayPost,
} from "@/features/sources/redgifs-overlay";

// The lightbox that opens over a feed/profile page never changes
// location.href and never exposes the open post's id in its own markup, so
// the id is captured from whichever feed tile was clicked to open it.
const CLOSE_BUTTON_SELECTOR = '[aria-label="Close video"]';
const OVERLAY_POLL_MS = 1_000;

let lastClickedPostId: string | null = null;

function readOverlayPost(): RedgifsOverlayPost | null {
  if (!lastClickedPostId) return null;
  if (!document.querySelector(CLOSE_BUTTON_SELECTOR)) return null;
  return {
    postId: lastClickedPostId,
    postUrl: `https://www.redgifs.com/watch/${lastClickedPostId}`,
  };
}

export default defineContentScript({
  matches: ["*://*.redgifs.com/*"],
  main() {
    document.addEventListener(
      "click",
      (event) => {
        const tile = (event.target as Element | null)?.closest("[data-feed-item-id]");
        const id = tile?.getAttribute("data-feed-item-id");
        if (id) lastClickedPostId = id;
      },
      { capture: true },
    );

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== REDGIFS_OVERLAY_REQUEST) return false;
      sendResponse(readOverlayPost());
      return false;
    });

    let lastPost = readOverlayPost();
    setInterval(() => {
      const post = readOverlayPost();
      if (post?.postId === lastPost?.postId) return;
      lastPost = post;
      void browser.runtime.sendMessage({ type: REDGIFS_OVERLAY_CHANGED });
    }, OVERLAY_POLL_MS);
  },
});
