import { matchPost, matchProfile } from "@stasher/core";
import type { HostRequest } from "@stasher/protocol";
import { sendHostRequest } from "@/shared/host";
import type { Stage } from "./types";

export async function fetchStage(refresh: boolean): Promise<Stage> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const detected = tab?.url ? matchProfile(tab.url) : null;
  const detectedPost = tab?.url && !detected ? matchPost(tab.url) : null;

  let request: HostRequest;
  if (detected) {
    request = {
      type: "lookupProfile",
      site: detected.site,
      username: detected.username,
      profileUrl: detected.profileUrl,
      refresh,
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
