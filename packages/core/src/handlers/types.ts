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

/** Recognizes profile pages on one site and extracts a `DetectedProfile`. */
export interface SiteHandler {
  site: string;
  matchProfile(url: URL): DetectedProfile | null;
}
