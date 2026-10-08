import { extractMetadata } from "@stasher/core";
import type { HostRequest, HostResponse } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { useState } from "react";

export function Widget() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function stashThisPage() {
    setStatus("sending");
    try {
      const request: HostRequest = {
        type: "submitJob",
        job: { id: crypto.randomUUID(), metadata: extractMetadata(document) },
      };
      const response: HostResponse = await browser.runtime.sendMessage(request);
      setStatus(response.type === "jobAccepted" ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Button
      className="stasher-fab shadow-lg"
      onClick={stashThisPage}
      disabled={status === "sending"}
    >
      {status === "sending" ? "Stashing..." : status === "done" ? "Stashed!" : "Stash this page"}
    </Button>
  );
}
