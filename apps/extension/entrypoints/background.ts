import { matchPost, matchProfile } from "@stasher/core";
import type { HostRequest, HostResponse } from "@stasher/protocol";

/**
 * Bridges extension pages to the desktop app. Native messaging can't be used
 * from extension pages directly, so everything routes through here via
 * `browser.runtime.sendMessage`.
 *
 * The native port is a single ordered byte stream with no request/response
 * correlation: a response frame is just "the next frame", not "the reply to
 * request X". So concurrent requests must be serialized — one in flight at a
 * time — or their replies get delivered to the wrong caller. Requests are
 * queued and sent only once the previous one has been answered.
 */
export default defineBackground(() => {
  let port: Browser.runtime.Port | undefined;
  const queue: Array<{
    message: HostRequest;
    resolve: (response: HostResponse) => void;
  }> = [];
  let inFlight = false;

  function getPort(): Browser.runtime.Port {
    if (port) return port;
    const opened = browser.runtime.connectNative("ar.schw.stasher");
    opened.onDisconnect.addListener(() => {
      port = undefined;
    });
    port = opened;
    return opened;
  }

  function pump() {
    if (inFlight) return;
    const next = queue.shift();
    if (!next) return;

    inFlight = true;
    const nativePort = getPort();

    const settle = (response: HostResponse) => {
      nativePort.onMessage.removeListener(onResponse);
      nativePort.onDisconnect.removeListener(onDisconnect);
      inFlight = false;
      next.resolve(response);
      pump();
    };
    const onResponse = (response: HostResponse) => settle(response);
    const onDisconnect = () =>
      settle({ type: "error", message: "Stasher desktop app isn't running." });

    nativePort.onMessage.addListener(onResponse);
    nativePort.onDisconnect.addListener(onDisconnect);
    nativePort.postMessage(next.message);
  }

  function enqueue(message: HostRequest): Promise<HostResponse> {
    return new Promise((resolve) => {
      queue.push({ message, resolve });
      pump();
    });
  }

  type BadgeState = "inStash" | "notInStash" | "none";

  // Firefox MV2 exposes `browserAction`; `action` only exists in MV3.
  const action = browser.action ?? browser.browserAction;

  async function setBadge(tabId: number, state: BadgeState) {
    try {
      await action.setBadgeText({
        tabId,
        text: state === "inStash" ? "✓" : state === "notInStash" ? "✕" : "",
      });
      if (state !== "none") {
        await action.setBadgeBackgroundColor({
          tabId,
          color: state === "inStash" ? "#16a34a" : "#dc2626",
        });
      }
    } catch (error) {
      console.warn("[stasher] failed to set badge", error);
    }
  }

  const LOOKUP_TTL_MS = 5 * 60 * 1000;
  const lookupCache = new Map<string, { response: HostResponse; at: number }>();

  function getCachedLookup(profileUrl: string): HostResponse | undefined {
    const entry = lookupCache.get(profileUrl);
    if (!entry) return undefined;
    if (Date.now() - entry.at > LOOKUP_TTL_MS) {
      lookupCache.delete(profileUrl);
      return undefined;
    }
    return entry.response;
  }

  const pendingLookups = new Set<string>();
  // Browsers reset a tab's badge on navigation and fire several tab events per
  // load. Re-applying the known result avoids both a blank flash and repeat lookups.
  const results = new Map<number, { url: string; state: BadgeState }>();

  async function refreshBadge(tabId: number, url: string | undefined) {
    const cached = results.get(tabId);
    if (url && cached?.url === url) {
      await setBadge(tabId, cached.state);
      return;
    }

    results.delete(tabId);
    const profile = url ? matchProfile(url) : null;
    const post = url && !profile ? matchPost(url) : null;
    if (!url || (!profile && !post)) {
      await setBadge(tabId, "none");
      return;
    }

    const key = `${tabId}:${url}`;
    if (pendingLookups.has(key)) return;
    pendingLookups.add(key);
    await setBadge(tabId, "none");

    try {
      let cacheKey: string;
      let request: HostRequest;
      if (profile) {
        cacheKey = profile.profileUrl;
        request = {
          type: "lookupProfile",
          site: profile.site,
          username: profile.username,
          profileUrl: profile.profileUrl,
          refresh: false,
        };
      } else if (post) {
        cacheKey = post.postUrl;
        request = {
          type: "lookupPost",
          site: post.site,
          postId: post.postId,
          postUrl: post.postUrl,
        };
      } else {
        return;
      }

      const response = await enqueue(request);
      if (response.type !== "profileLookup" && response.type !== "postLookup") return;
      lookupCache.set(cacheKey, { response, at: Date.now() });

      // Navigation may have moved on while the lookup was in flight.
      const current = await browser.tabs.get(tabId).catch(() => undefined);
      if (current?.url !== url) return;

      const found = response.type === "profileLookup" ? !!response.exactMatch : response.inStash;
      const state = found ? "inStash" : "notInStash";
      results.set(tabId, { url, state });
      await setBadge(tabId, state);
    } finally {
      pendingLookups.delete(key);
    }
  }

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      void refreshBadge(tabId, tab.url);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    results.delete(tabId);
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await browser.tabs.get(tabId).catch(() => undefined);
    if (tab) void refreshBadge(tabId, tab.url);
  });

  browser.runtime.onMessage.addListener((message: HostRequest, _sender, sendResponse) => {
    if (message.type === "lookupProfile" && !message.refresh) {
      const cached = getCachedLookup(message.profileUrl);
      if (cached) {
        sendResponse(cached);
        return false;
      }
    }
    if (message.type === "lookupPost") {
      const cached = getCachedLookup(message.postUrl);
      if (cached) {
        sendResponse(cached);
        return false;
      }
    }

    void enqueue(message).then(async (response) => {
      sendResponse(response);
      if (response.type === "performerCreated" || response.type === "performerLinked") {
        lookupCache.clear();
      } else if (message.type === "lookupProfile" && response.type === "profileLookup") {
        lookupCache.set(message.profileUrl, { response, at: Date.now() });
      } else if (message.type === "lookupPost" && response.type === "postLookup") {
        lookupCache.set(message.postUrl, { response, at: Date.now() });
      }
      const state: BadgeState | undefined =
        response.type === "performerCreated" || response.type === "performerLinked"
          ? "inStash"
          : response.type === "profileLookup"
            ? response.exactMatch
              ? "inStash"
              : "notInStash"
            : response.type === "postLookup"
              ? response.inStash
                ? "inStash"
                : "notInStash"
              : undefined;
      if (state) {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id !== undefined) {
          if (tab.url) results.set(tab.id, { url: tab.url, state });
          await setBadge(tab.id, state);
        }
      }
    });
    return true; // keep the message channel open for the async response
  });
});
