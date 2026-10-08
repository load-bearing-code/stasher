import { matchPost, matchProfile } from "@stasher/core";
import type { HostRequest, HostResponse } from "@stasher/protocol";
import {
  FANSLY_SESSION_CHANGED,
  isFanslyUrl,
  readFanslySessionFromTab,
} from "@/features/sources/fansly-session";
import {
  isRedgifsUrl,
  readRedgifsOverlayPostFromTab,
  REDGIFS_OVERLAY_CHANGED,
} from "@/features/sources/redgifs-overlay";

const HEARTBEAT_MS = 60_000;
const SOURCE_REFRESH_MS = 5 * 60_000;
const STATUS_REQUEST_TIMEOUT_MS = 60_000;

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
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const settle = (response: HostResponse) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      nativePort.onMessage.removeListener(onResponse);
      nativePort.onDisconnect.removeListener(onDisconnect);
      inFlight = false;
      next.resolve(response);
      pump();
    };
    const onResponse = (response: HostResponse) => settle(response);
    const onDisconnect = () =>
      settle({ type: "error", message: "Stasher desktop app isn't running." });
    const onTimeout = () => {
      port = undefined;
      nativePort.disconnect();
      settle({ type: "error", message: "Stasher desktop app didn't respond." });
    };

    nativePort.onMessage.addListener(onResponse);
    nativePort.onDisconnect.addListener(onDisconnect);
    if (!settled) {
      if (
        next.message.type === "ping" ||
        next.message.type === "getStatus" ||
        next.message.type === "getSourcesConfig" ||
        next.message.type === "reportSourceStatus"
      ) {
        timeout = setTimeout(onTimeout, STATUS_REQUEST_TIMEOUT_MS);
      }
      nativePort.postMessage(next.message);
    }
  }

  function enqueue(message: HostRequest): Promise<HostResponse> {
    return new Promise((resolve) => {
      queue.push({ message, resolve });
      pump();
    });
  }

  let sourceReportInFlight = false;
  let sourceReportPending = false;
  let pendingSourceTabId: number | undefined;

  async function sourceEnabled(site: string): Promise<boolean> {
    const response = await enqueue({ type: "getSourcesConfig" });
    return response.type === "sourcesConfig" && !response.config.disabledSites.includes(site);
  }

  async function reportFanslySession(tabId?: number) {
    if (sourceReportInFlight) {
      sourceReportPending = true;
      pendingSourceTabId = tabId;
      return;
    }
    sourceReportInFlight = true;
    try {
      if (!(await sourceEnabled("fansly"))) return;

      let sourceTabId = tabId;
      if (sourceTabId === undefined) {
        const [tab] = await browser.tabs.query({ url: "*://*.fansly.com/*" });
        sourceTabId = tab?.id;
      }
      if (sourceTabId === undefined) {
        await enqueue({
          type: "reportSourceStatus",
          site: "fansly",
          sessionState: "unknown",
          authToken: null,
        });
        return;
      }

      // A missing content script means the tab is not ready. A successful
      // reply distinguishes a verified logout from an unreadable session.
      const session = await readFanslySessionFromTab(sourceTabId).catch(() => ({
        state: "unknown" as const,
        token: null,
      }));
      await enqueue({
        type: "reportSourceStatus",
        site: "fansly",
        sessionState: session.state,
        authToken: session.token,
      });
    } catch {
      // The next tab completion, session change, or periodic refresh retries.
    } finally {
      sourceReportInFlight = false;
      if (sourceReportPending) {
        const pendingTabId = pendingSourceTabId;
        sourceReportPending = false;
        pendingSourceTabId = undefined;
        void reportFanslySession(pendingTabId);
      }
    }
  }

  let heartbeatPending = false;

  function heartbeat() {
    if (heartbeatPending) return;
    heartbeatPending = true;
    void enqueue({ type: "ping", nonce: `heartbeat-${Date.now()}` }).finally(() => {
      heartbeatPending = false;
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
    // RedGIFs' lightbox never changes `url`, so a cached result for it can't
    // be trusted to reflect whether the overlay is open.
    const onRedgifs = isRedgifsUrl(url);
    const cached = results.get(tabId);
    if (!onRedgifs && url && cached?.url === url) {
      await setBadge(tabId, cached.state);
      return;
    }

    results.delete(tabId);
    let profile = url ? matchProfile(url) : null;
    let post = url && !profile ? matchPost(url) : null;
    if (!post && onRedgifs) {
      const overlayPost = await readRedgifsOverlayPostFromTab(tabId).catch(() => null);
      if (overlayPost) {
        post = { site: "redgifs", postId: overlayPost.postId, postUrl: overlayPost.postUrl };
        profile = null;
      }
    }
    if (!url || (!profile && !post)) {
      await setBadge(tabId, "none");
      return;
    }

    const key = `${tabId}:${profile?.profileUrl ?? post?.postUrl}`;
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
    if (changeInfo.status === "complete" && isFanslyUrl(tab.url)) {
      void reportFanslySession(tabId);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    results.delete(tabId);
    void reportFanslySession();
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await browser.tabs.get(tabId).catch(() => undefined);
    if (tab) void refreshBadge(tabId, tab.url);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === FANSLY_SESSION_CHANGED
    ) {
      if (sender.tab?.id !== undefined) void reportFanslySession(sender.tab.id);
      return false;
    }
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === REDGIFS_OVERLAY_CHANGED
    ) {
      if (sender.tab?.id !== undefined) void refreshBadge(sender.tab.id, sender.tab.url);
      return false;
    }
    if (typeof message !== "object" || message === null || !("type" in message)) return false;

    const request = message as HostRequest;
    if (request.type === "lookupProfile" && !request.refresh) {
      const cached = getCachedLookup(request.profileUrl);
      if (cached) {
        sendResponse(cached);
        return false;
      }
    }
    if (request.type === "lookupPost") {
      const cached = getCachedLookup(request.postUrl);
      if (cached) {
        sendResponse(cached);
        return false;
      }
    }

    void enqueue(request).then(async (response) => {
      sendResponse(response);
      if (response.type === "performerCreated" || response.type === "performerLinked") {
        lookupCache.clear();
      } else if (request.type === "lookupProfile" && response.type === "profileLookup") {
        lookupCache.set(request.profileUrl, { response, at: Date.now() });
      } else if (request.type === "lookupPost" && response.type === "postLookup") {
        lookupCache.set(request.postUrl, { response, at: Date.now() });
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

  heartbeat();
  void reportFanslySession();
  setInterval(heartbeat, HEARTBEAT_MS);
  setInterval(() => void reportFanslySession(), SOURCE_REFRESH_MS);
});
