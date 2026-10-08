import { matchProfile } from "@stasher/core";
import type {
  HostRequest,
  HostResponse,
  Performer,
  PerformerCandidate,
  SiteProfile,
} from "@stasher/protocol";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@stasher/ui/components/avatar";
import { Badge } from "@stasher/ui/components/badge";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent } from "@stasher/ui/components/card";
import { Input } from "@stasher/ui/components/input";
import { CheckIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Stage =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "needsConfig" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      profile: SiteProfile;
      exactMatch: Performer | null;
      candidates: PerformerCandidate[];
    };

type Resolved = { performer: Performer; via: "created" | "linked" };

type ConnectionStatus = "checking" | "offline" | "disconnected" | "connected";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function candidateReason(candidate: PerformerCandidate): string {
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

function CandidateRow({
  candidate,
  linking,
  onLink,
}: {
  candidate: PerformerCandidate;
  linking: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar>
        <AvatarImage src={candidate.performer.imagePath ?? undefined} />
        <AvatarFallback>{initials(candidate.performer.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 overflow-hidden">
        <p className="truncate font-semibold">{candidate.performer.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {candidateReason(candidate)}
        </p>
      </div>
      <Button variant="outline" disabled={linking} onClick={onLink}>
        {linking ? "..." : "Link"}
      </Button>
    </div>
  );
}

export function App() {
  const [connection, setConnection] = useState<ConnectionStatus>("checking");
  const [stashHost, setStashHost] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [importing, setImporting] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    PerformerCandidate[] | null
  >(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const request: HostRequest = { type: "getStatus" };
        const response: HostResponse =
          await browser.runtime.sendMessage(request);
        if (response.type === "status") {
          setStashHost(
            response.stashUrl ? new URL(response.stashUrl).host : null,
          );
          setConnection(response.stashReachable ? "connected" : "disconnected");
        } else {
          setConnection("disconnected");
        }
      } catch {
        setConnection("offline");
      }
    }

    async function loadProfile() {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
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
        const response: HostResponse =
          await browser.runtime.sendMessage(request);
        if (response.type === "profileLookup") {
          setStage({
            kind: "ready",
            profile: response.profile,
            exactMatch: response.exactMatch,
            candidates: response.candidates,
          });
        } else if (response.type === "error") {
          setStage(
            response.message.includes("isn't configured")
              ? { kind: "needsConfig" }
              : { kind: "error", message: response.message },
          );
        }
      } catch {
        setStage({
          kind: "error",
          message: "Couldn't reach the Stasher desktop app.",
        });
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
        setResolved({ performer: response.performer, via: "created" });
      } else if (response.type === "error") {
        setStage({ kind: "error", message: response.message });
      }
    } finally {
      setImporting(false);
    }
  }

  async function linkPerformer(performerId: string, profile: SiteProfile) {
    setLinkingId(performerId);
    try {
      const request: HostRequest = {
        type: "linkPerformer",
        performerId,
        profile,
      };
      const response: HostResponse = await browser.runtime.sendMessage(request);
      if (response.type === "performerLinked") {
        setResolved({ performer: response.performer, via: "linked" });
      } else if (response.type === "error") {
        setStage({ kind: "error", message: response.message });
      }
    } finally {
      setLinkingId(null);
    }
  }

  async function runSearch(query: string) {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const request: HostRequest = { type: "searchPerformers", query };
      const response: HostResponse = await browser.runtime.sendMessage(request);
      if (response.type === "performerSearch") {
        setSearchResults(response.candidates);
      } else if (response.type === "error") {
        setStage({ kind: "error", message: response.message });
      }
    } finally {
      setSearching(false);
    }
  }

  const dotColor =
    connection === "connected"
      ? "bg-success"
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
          : "Connected";

  return (
    <main className="glass-thick flex min-h-[600px] w-[400px] flex-col text-xs">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="flex items-center gap-3 text-sm font-medium">
          <div className="flex size-8 items-center justify-center rounded-lg bg-tint-soft text-tint-text">
            <RefreshCwIcon className="size-4" />
          </div>
          Stash Sync
        </div>
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          title={stashHost ?? undefined}
        >
          <span className={`size-2 rounded-full ${dotColor}`} />
          {statusLabel}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 p-4">
        {stage.kind === "loading" && (
          <p className="text-muted-foreground">Checking this page...</p>
        )}
        {stage.kind === "unsupported" && (
          <p className="text-muted-foreground">
            No supported profile detected on this page.
          </p>
        )}
        {stage.kind === "needsConfig" && (
          <p className="text-muted-foreground">
            Connect to Stash in the desktop app's settings to use this.
          </p>
        )}
        {stage.kind === "error" && (
          <p className="text-destructive">{stage.message}</p>
        )}

        {stage.kind === "ready" && (
          <>
            <div className="flex items-center gap-4 px-1">
              <Avatar size="lg" className="size-[52px]">
                <AvatarImage src={stage.profile.photoUrl ?? undefined} />
                <AvatarFallback className="text-base">
                  {initials(
                    stage.profile.displayName ?? stage.profile.username,
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-lg font-medium">
                  {stage.profile.displayName ?? stage.profile.username}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {stage.profile.site}.com/{stage.profile.username}
                </p>
              </div>
              <Badge
                variant="outline"
                className="h-6 bg-secondary px-3 text-xs font-normal text-secondary-foreground"
              >
                {resolved || stage.exactMatch ? "In Stash" : "Not in Stash"}
              </Badge>
            </div>

            <Card variant="inset" className="gap-0 py-0">
              {resolved ? (
                <CardContent className="flex items-center gap-4 p-5">
                  <CheckIcon className="size-5 text-primary" />
                  <p>
                    {resolved.via === "created" ? "Created" : "Linked to"}{" "}
                    <span className="font-semibold">
                      {resolved.performer.name}
                    </span>{" "}
                    in Stash.
                  </p>
                </CardContent>
              ) : stage.exactMatch ? (
                <CardContent className="flex items-center gap-4 p-5">
                  <CheckIcon className="size-5 text-primary" />
                  <div>
                    <p className="font-semibold">Already in your Stash</p>
                    <p className="text-muted-foreground">
                      {stage.exactMatch.name}
                    </p>
                  </div>
                </CardContent>
              ) : (
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                    <SearchIcon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Not in your Stash yet
                    </p>
                    <p className="text-muted-foreground">
                      No performer has this{" "}
                      {stage.profile.site === "fansly"
                        ? "Fansly"
                        : stage.profile.site}{" "}
                      URL, and no name or alias is an exact match.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>

            {!resolved && !stage.exactMatch && (
              <>
                {stage.candidates.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold">
                      Could it be one of these?
                    </p>
                    <Card variant="inset" className="gap-0 divide-y py-0">
                      {stage.candidates.map((candidate) => (
                        <CandidateRow
                          key={candidate.performer.id}
                          candidate={candidate}
                          linking={linkingId === candidate.performer.id}
                          onLink={() =>
                            void linkPerformer(
                              candidate.performer.id,
                              stage.profile,
                            )
                          }
                        />
                      ))}
                    </Card>
                  </div>
                )}

                {searchOpen ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runSearch(searchQuery);
                    }}
                  >
                    <div className="flex gap-2">
                      <Input
                        placeholder="Performer name"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={searching}
                      >
                        {searching ? "..." : "Search"}
                      </Button>
                    </div>
                    {searchResults && (
                      <div className="flex flex-col gap-2">
                        {searchResults.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No performers found.
                          </p>
                        ) : (
                          searchResults.map((candidate) => (
                            <CandidateRow
                              key={candidate.performer.id}
                              candidate={candidate}
                              linking={linkingId === candidate.performer.id}
                              onLink={() =>
                                void linkPerformer(
                                  candidate.performer.id,
                                  stage.profile,
                                )
                              }
                            />
                          ))
                        )}
                      </div>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    className="self-start border-b border-foreground text-left text-sm font-medium"
                    onClick={() => setSearchOpen(true)}
                  >
                    Search Stash for someone else
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {stage.kind === "ready" && !stage.exactMatch && !resolved && (
        <footer className="flex items-center justify-end border-t px-4 py-3">
          <Button
            className="shrink-0 whitespace-nowrap"
            disabled={importing}
            onClick={() => createPerformer(stage.profile)}
          >
            {importing ? "Creating..." : "+ Create performer"}
          </Button>
        </footer>
      )}
    </main>
  );
}
