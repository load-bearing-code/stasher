import type { Performer, PerformerCandidate, PostDetails, SiteProfile } from "@stasher/protocol";

export type Stage =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needsConfig" }
  | { kind: "error"; message: string }
  | {
      kind: "post";
      site: string;
      postId: string;
      postUrl: string;
      inStash: boolean;
      post: PostDetails | null;
    }
  | {
      kind: "ready";
      profile: SiteProfile;
      exactMatch: Performer | null;
      candidates: PerformerCandidate[];
    };
