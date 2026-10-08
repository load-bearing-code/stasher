import type { PerformerCandidate } from "@stasher/protocol";

export function candidateReason(candidate: PerformerCandidate): string {
  const primary = candidate.matchedAlias
    ? `Alias “${candidate.matchedAlias}”`
    : candidate.nameSimilar
      ? "Similar name"
      : "Possible match";

  const { sceneCount } = candidate.performer;
  const secondary =
    sceneCount > 0
      ? `${sceneCount} scene${sceneCount === 1 ? "" : "s"}`
      : candidate.sharedUrls
        ? "shared URL"
        : "no shared URLs";

  return `${primary} · ${secondary}`;
}
