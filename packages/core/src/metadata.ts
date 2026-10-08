import type { StashMetadata } from "@stasher/protocol";

/**
 * Pulls stash-able metadata out of the active page. Returns the exact shape
 * `StashJob.metadata` expects, so callers can embed the result directly.
 */
export function extractMetadata(doc: Document): StashMetadata {
  const description =
    doc.querySelector<HTMLMetaElement>("meta[name='description']")?.content ??
    doc.querySelector<HTMLMetaElement>("meta[property='og:description']")?.content ??
    null;

  const favicon =
    doc.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href ??
    doc.querySelector<HTMLMetaElement>("meta[property='og:image']")?.content ??
    null;

  return {
    url: doc.location.href,
    title: doc.title || null,
    description,
    favicon,
    tags: [],
    capturedAt: new Date().toISOString(),
  };
}
