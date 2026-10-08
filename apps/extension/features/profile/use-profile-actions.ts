import type { Performer, SiteProfile } from "@stasher/protocol";
import { useState } from "react";
import { linkPerformer } from "./api";
import type { Resolved } from "./types";

export function useProfileActions(onError: (message: string) => void) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  async function link(performerId: string, profile: SiteProfile) {
    setLinkingId(performerId);
    try {
      const response = await linkPerformer(performerId, profile);
      if (response.type === "performerLinked") {
        setResolved({ performer: response.performer, via: "linked" });
      } else if (response.type === "error") {
        onError(response.message);
      }
    } finally {
      setLinkingId(null);
    }
  }

  function markCreated(performer: Performer) {
    setResolved({ performer, via: "created" });
    setWizardOpen(false);
  }

  function reset() {
    setResolved(null);
  }

  return { wizardOpen, setWizardOpen, resolved, linkingId, link, markCreated, reset };
}
