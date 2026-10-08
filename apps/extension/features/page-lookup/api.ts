import { matchPost, matchProfile } from "@stasher/core";
import type { HostRequest } from "@stasher/protocol";
import { readFaphouseProfileFromTab } from "@/features/sources/faphouse-profile";
import { readOnlyfansProfileFromTab } from "@/features/sources/onlyfans-profile";
import { isRedgifsUrl, readRedgifsOverlayPostFromTab } from "@/features/sources/redgifs-overlay";
import { sendHostRequest } from "@/shared/host";
import type { Stage } from "./types";

export async function fetchStage(refresh: boolean): Promise<Stage> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  let detected = tab?.url ? matchProfile(tab.url) : null;
  let detectedPost = tab?.url && !detected ? matchPost(tab.url) : null;
  if (!detectedPost && tab?.id !== undefined && isRedgifsUrl(tab.url)) {
    const overlayPost = await readRedgifsOverlayPostFromTab(tab.id).catch(() => null);
    if (overlayPost) {
      detectedPost = { site: "redgifs", postId: overlayPost.postId, postUrl: overlayPost.postUrl };
      detected = null;
    }
  }

  let request: HostRequest;
  if (detected?.site === "onlyfans" || detected?.site === "faphouse") {
    const scrapedProfile =
      tab?.id !== undefined
        ? await (detected.site === "onlyfans"
            ? readOnlyfansProfileFromTab(tab.id)
            : readFaphouseProfileFromTab(tab.id)
          ).catch(() => null)
        : null;
    if (!scrapedProfile) return { kind: "unsupported" };
    request = {
      type: "lookupProfile",
      site: detected.site,
      username: detected.username,
      profileUrl: detected.profileUrl,
      refresh,
      scrapedProfile,
    };
  } else if (detected) {
    request = {
      type: "lookupProfile",
      site: detected.site,
      username: detected.username,
      profileUrl: detected.profileUrl,
      refresh,
      scrapedProfile: null,
    };
  } else if (detectedPost) {
    request = {
      type: "lookupPost",
      site: detectedPost.site,
      postId: detectedPost.postId,
      postUrl: detectedPost.postUrl,
    };
  } else {
    return { kind: "unsupported" };
  }

  try {
    const response = await sendHostRequest(request);
    if (response.type === "postLookup") {
      return {
        kind: "post",
        site: detectedPost!.site,
        postId: detectedPost!.postId,
        postUrl: response.postUrl,
        inStash: response.inStash,
        post: response.post,
        creator: response.creator,
        creatorInStash: response.creatorInStash,
      };
    }
    if (response.type === "profileLookup") {
      return {
        kind: "ready",
        profile: response.profile,
        exactMatch: response.exactMatch,
        candidates: response.candidates,
      };
    }
    if (response.type === "error") {
      return response.message.includes("isn't configured")
        ? { kind: "needsConfig" }
        : { kind: "error", message: response.message };
    }
    return {
      kind: "error",
      message: "Unexpected response from the Stasher desktop app.",
    };
  } catch {
    return {
      kind: "error",
      message: "Couldn't reach the Stasher desktop app.",
    };
  }
}
