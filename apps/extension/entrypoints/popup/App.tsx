import { matchProfile } from "@stasher/core";
import type { HostRequest, HostResponse, Performer, SiteProfile } from "@stasher/protocol";
import { Avatar, AvatarFallback, AvatarImage } from "@stasher/ui/components/avatar";
import { Badge } from "@stasher/ui/components/badge";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent } from "@stasher/ui/components/card";
import { CheckIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Stage =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needsConfig" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: SiteProfile; exactMatch: Performer | null };

type ConnectionStatus = "checking" | "offline" | "disconnected" | "connected";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function App() {
  const [connection, setConnection] = useState<ConnectionStatus>("checking");
  const [stashHost, setStashHost] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [importing, setImporting] = useState(false);
  const [created, setCreated] = useState<Performer | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const request: HostRequest = { type: "getStatus" };
        const response: HostResponse = await browser.runtime.sendMessage(request);
        if (response.type === "status") {
          setStashHost(response.stashUrl ? new URL(response.stashUrl).host : null);
          setConnection(response.stashReachable ? "connected" : "disconnected");
        } else {
          setConnection("disconnected");
        }
      } catch {
        setConnection("offline");
      }
    }

    async function loadProfile() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const detected = tab?.url ? matchProfile(tab.url) : null;
      if (!detected) {
        setStage({ kind: "unsupported" });
        return;
      }

      try {
        const request: HostRequest = {
          type: "lookupProfile",
          site: detected.site,
          username: detected.username,
          profileUrl: detected.profileUrl,
        };
        const response: HostResponse = await browser.runtime.sendMessage(request);
        if (response.type === "profileLookup") {
          setStage({ kind: "ready", profile: response.profile, exactMatch: response.exactMatch });
        } else if (response.type === "error") {
          setStage(
            response.message.includes("isn't configured")
              ? { kind: "needsConfig" }
              : { kind: "error", message: response.message },
          );
        }
      } catch {
        setStage({ kind: "error", message: "Couldn't reach the Stasher desktop app." });
      }
    }

    void loadStatus();
    void loadProfile();
  }, []);

  async function createPerformer(profile: SiteProfile) {
    setImporting(true);
    try {
      const request: HostRequest = { type: "importPerformer", profile };
      const response: HostResponse = await browser.runtime.sendMessage(request);
      if (response.type === "performerCreated") {
        setCreated(response.performer);
      } else if (response.type === "error") {
        setStage({ kind: "error", message: response.message });
      }
    } finally {
      setImporting(false);
    }
  }

  const dotColor =
    connection === "connected"
      ? "bg-primary"
      : connection === "checking"
        ? "bg-muted-foreground"
        : "bg-destructive";
  const statusLabel =
    connection === "checking"
      ? "Checking..."
      : connection === "offline"
        ? "Desktop app offline"
        : connection === "disconnected"
          ? "Stash not connected"
          : `Desktop app · ${stashHost}`;

  return (
    <main className="flex w-80 flex-col text-sm">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCwIcon className="size-4 text-primary" />
          Stash Sync
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-2 rounded-full ${dotColor}`} />
          {statusLabel}
        </div>
      </header>

      <div className="flex flex-col gap-3 p-3">
        {stage.kind === "loading" && <p className="text-muted-foreground">Checking this page...</p>}
        {stage.kind === "unsupported" && (
          <p className="text-muted-foreground">No supported profile detected on this page.</p>
        )}
        {stage.kind === "needsConfig" && (
          <p className="text-muted-foreground">
            Connect to Stash in the desktop app's settings to use this.
          </p>
        )}
        {stage.kind === "error" && <p className="text-destructive">{stage.message}</p>}

        {stage.kind === "ready" && (
          <>
            <Card>
              <CardContent className="flex items-center gap-3 p-3">
                <Avatar size="lg">
                  <AvatarImage src={stage.profile.photoUrl ?? undefined} />
                  <AvatarFallback>
                    {initials(stage.profile.displayName ?? stage.profile.username)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-semibold">
                    {stage.profile.displayName ?? stage.profile.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{stage.profile.username} · {stage.profile.site}.com
                  </p>
                </div>
                <Badge variant="secondary">Detected</Badge>
              </CardContent>
            </Card>

            {created ? (
              <Card>
                <CardContent className="flex items-center gap-2 p-3">
                  <CheckIcon className="size-4 text-primary" />
                  <p>
                    Created <span className="font-medium">{created.name}</span> in Stash.
                  </p>
                </CardContent>
              </Card>
            ) : stage.exactMatch ? (
              <Card>
                <CardContent className="flex items-center gap-2 p-3">
                  <CheckIcon className="size-4 text-primary" />
                  <div>
                    <p className="font-medium">Already in your Stash</p>
                    <p className="text-xs text-muted-foreground">{stage.exactMatch.name}</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-start gap-2 p-3">
                  <SearchIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not in your Stash yet</p>
                    <p className="text-xs text-muted-foreground">
                      No performer has this {stage.profile.site} URL, and no name or alias is an
                      exact match.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {stage.kind === "ready" && !stage.exactMatch && !created && (
        <footer className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Nothing is saved until you confirm.</p>
          <Button size="sm" disabled={importing} onClick={() => createPerformer(stage.profile)}>
            {importing ? "Creating..." : "+ Create performer"}
          </Button>
        </footer>
      )}
    </main>
  );
}
