/**
 * A creator profile detected on a supported site, before anything is known
 * about a matching Stash performer. Mirrors the fields `HostRequest`'s
 * `lookupProfile` variant needs (`@stasher/protocol`'s `SiteProfile` fills
 * in the rest once the desktop app fetches the site's own profile data).
 */
export interface DetectedProfile {
  site: string;
  username: string;
  profileUrl: string;
}

/** A single post detected on a supported site, before Stash has been checked for it. */
export interface DetectedPost {
  site: string;
  postId: string;
  postUrl: string;
}

/** Recognizes profile and post pages on one site. */
export interface SiteHandler {
  site: string;
  /** Human-facing name for the site (e.g. "Fansly"). */
  label: string;
  /** The site's primary host, shown in the UI (e.g. "fansly.com"). */
  host: string;
  matchProfile(url: URL): DetectedProfile | null;
  matchPost(url: URL): DetectedPost | null;
}

/** The display-facing summary of a supported site, independent of its matchers. */
export interface SiteInfo {
  site: string;
  label: string;
  host: string;
}
