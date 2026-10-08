import type { Performer, PerformerCandidate, SiteProfile } from "@stasher/protocol";

export type Stage =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needsConfig" }
  | { kind: "error"; message: string }
  | { kind: "post"; postUrl: string; inStash: boolean }
  | {
      kind: "ready";
      profile: SiteProfile;
      exactMatch: Performer | null;
      candidates: PerformerCandidate[];
    };
