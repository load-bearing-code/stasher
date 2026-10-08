import { matchProfile } from "@stasher/core";
import type {
  HostRequest,
  HostResponse,
  Performer,
  PerformerCandidate,
  SiteProfile,
} from "@stasher/protocol";
import { Avatar, AvatarFallback, AvatarImage } from "@stasher/ui/components/avatar";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent } from "@stasher/ui/components/card";
import { CheckIcon, ExternalLinkIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ImportWizard } from "./ImportWizard";

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
        <p className="truncate text-xs text-muted-foreground">{candidateReason(candidate)}</p>
      </div>
      <Button variant="outline" disabled={linking} onClick={onLink}>
        {linking ? "..." : "Link"}
      </Button>
    </div>
  );
}

async function fetchStatus(): Promise<{
  connection: ConnectionStatus;
  stashUrl: string | null;
}> {
  try {
    const request: HostRequest = { type: "getStatus" };
    const response: HostResponse = await browser.runtime.sendMessage(request);
    if (response.type === "status") {
      return {
        connection: response.stashReachable ? "connected" : "disconnected",
        stashUrl: response.stashUrl,
      };
    }
    return { connection: "disconnected", stashUrl: null };
  } catch {
    return { connection: "offline", stashUrl: null };
  }
}

async function fetchStage(refresh: boolean): Promise<Stage> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const detected = tab?.url ? matchProfile(tab.url) : null;
  if (!detected) return { kind: "unsupported" };

  try {
    const request: HostRequest = {
      type: "lookupProfile",
      site: detected.site,
      username: detected.username,
      profileUrl: detected.profileUrl,
      refresh,
    };
    const response: HostResponse = await browser.runtime.sendMessage(request);
    if (response.type === "profileLookup") {
      return {
        kind: "ready",
        profile: response.profile,
        exactMatch: response.exactMatch,
        candidates: response.candidates,
      };
    }
    if (response.type === "error") {
      return response.message.includes("isn't configured")
        ? { kind: "needsConfig" }
        : { kind: "error", message: response.message };
    }
    return {
      kind: "error",
      message: "Unexpected response from the Stasher desktop app.",
    };
  } catch {
    return {
      kind: "error",
      message: "Couldn't reach the Stasher desktop app.",
    };
  }
}

export function App() {
  const [connection, setConnection] = useState<ConnectionStatus>("checking");
  const [stashUrl, setStashUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchStatus().then((status) => {
      setConnection(status.connection);
      setStashUrl(status.stashUrl);
    });
    void fetchStage(false).then(setStage);
  }, []);

  async function refresh() {
    setRefreshing(true);
    setConnection("checking");
    try {
      const [status, next] = await Promise.all([fetchStatus(), fetchStage(true)]);
      setConnection(status.connection);
      setStashUrl(status.stashUrl);
      setResolved(null);
      setStage(next);
    } finally {
      setRefreshing(false);
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
    <main className="glass-thick flex max-h-[600px] w-[400px] flex-col overflow-y-auto text-xs">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="flex items-center gap-3 text-sm font-medium">
          <div className="flex size-8 items-center justify-center rounded-lg bg-tint-soft text-tint-text">
            <RefreshCwIcon className="size-4" />
          </div>
          Stash Sync
        </div>
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          title={stashUrl ? new URL(stashUrl).host : undefined}
        >
          <span className={`size-2 rounded-full ${dotColor}`} />
          {statusLabel}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 p-4">
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

        {stage.kind === "ready" && wizardOpen && !resolved && (
          <ImportWizard
            profile={stage.profile}
            onCancel={() => setWizardOpen(false)}
            onCreated={(performer) => {
              setResolved({ performer, via: "created" });
              setWizardOpen(false);
            }}
            onError={(message) => setStage({ kind: "error", message })}
          />
        )}

        {stage.kind === "ready" && !wizardOpen && (
          <>
            <div className="flex items-center gap-4 px-1">
              <Avatar size="lg" className="size-[52px]">
                <AvatarImage src={stage.profile.photoUrl ?? undefined} />
                <AvatarFallback className="text-base">
                  {initials(stage.profile.displayName ?? stage.profile.username)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-base font-medium">
                  {stage.profile.displayName ?? stage.profile.username}
                </p>
                <a
                  href={stage.profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <span className="truncate">
                    {stage.profile.site}.com/{stage.profile.username}
                  </span>
                  <ExternalLinkIcon className="size-3 shrink-0" />
                </a>
              </div>
              <Button
                variant="outline"
                className="h-7 rounded-full bg-secondary px-3 text-xs font-normal text-secondary-foreground"
                disabled={refreshing}
                title="Re-fetch the profile and re-check Stash"
                onClick={() => void refresh()}
              >
                {resolved || stage.exactMatch ? "In Stash" : "Not in Stash"}
                <RefreshCwIcon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <Card variant="inset" className="gap-0 py-0">
              {resolved ? (
                <CardContent className="flex items-center gap-4 p-5">
                  <CheckIcon className="size-5 text-primary" />
                  <p>
                    {resolved.via === "created" ? "Created" : "Linked to"}{" "}
                    <span className="font-semibold">{resolved.performer.name}</span> in Stash.
                  </p>
                </CardContent>
              ) : stage.exactMatch ? (
                <CardContent className="flex items-center gap-4 p-5">
                  <CheckIcon className="size-5 text-primary" />
                  <div>
                    <p className="font-semibold">Already in your Stash</p>
                    <p className="text-muted-foreground">{stage.exactMatch.name}</p>
                  </div>
                </CardContent>
              ) : (
                <CardContent className="flex items-center gap-5 rounded-xl border border-dashed p-5">
                  <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-base font-semibold">Not in your Stash yet</p>
                      <p className="leading-relaxed text-muted-foreground">
                        No performer has this{" "}
                        {stage.profile.site === "fansly" ? "Fansly" : stage.profile.site} URL, and
                        no name or alias is an exact match.
                      </p>
                    </div>
                    <Button
                      className="shrink-0 whitespace-nowrap"
                      onClick={() => setWizardOpen(true)}
                    >
                      + Create performer
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {stashUrl && (resolved?.performer ?? stage.exactMatch) && (
              <Button
                onClick={() => {
                  const performer = resolved?.performer ?? stage.exactMatch;
                  if (!performer) return;
                  const base = stashUrl.replace(/\/+$/, "");
                  void browser.tabs.create({ url: `${base}/performers/${performer.id}` });
                }}
              >
                Open in Stash
                <ExternalLinkIcon />
              </Button>
            )}

            {!resolved && !stage.exactMatch && (
              <>
                {stage.candidates.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold">Could it be one of these?</p>
                    <Card variant="inset" className="gap-0 divide-y py-0">
                      {stage.candidates.map((candidate) => (
                        <CandidateRow
                          key={candidate.performer.id}
                          candidate={candidate}
                          linking={linkingId === candidate.performer.id}
                          onLink={() => void linkPerformer(candidate.performer.id, stage.profile)}
                        />
                      ))}
                    </Card>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
