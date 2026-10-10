import { sites } from "@stasher/core";
import type { SourceStatus } from "@stasher/protocol";
import { Badge } from "@stasher/ui/components/badge";
import { PuzzleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  type ExtensionStatus,
  getExtensionStatus,
  getSourceStatuses,
  getSourcesConfig,
  setSourcesConfig,
} from "@/features/settings/sources/api";
import { Toggle } from "@/features/settings/sources/components/toggle";

// How recently we must have heard from the extension to call it "connected".
// The extension connects per request rather than holding a socket open, so
// this is a recency window, not a live link.
const CONNECTED_WINDOW_MS = 90_000;
const POLL_MS = 5_000;
const SOURCE_POLL_MS = 30_000;

function relativeTime(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function SourcesSettings() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSourcesConfig().then((config) => {
      if (config) setDisabled(new Set(config.disabledSites));
    });
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => {
      getSourceStatuses()
        .then((next) => {
          if (active) setSourceStatuses(next);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, SOURCE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => {
      getExtensionStatus()
        .then((next) => {
          if (active) setStatus(next);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const toggleSite = useCallback((site: string, enabled: boolean) => {
    setSourceStatuses((current) =>
      current.map((source) =>
        source.site === site
          ? { ...source, sessionState: "unknown", account: null, sessionCheckedAtMs: null }
          : source,
      ),
    );
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(site);
      else next.add(site);
      void setSourcesConfig({ disabledSites: [...next] });
      return next;
    });
  }, []);

  const lastSeen = status?.lastSeenMs ?? null;
  const connected = lastSeen !== null && Date.now() - lastSeen < CONNECTED_WINDOW_MS;
  const extensionSubtitle = connected
    ? "Sessions come from your browser — no passwords stored here"
    : lastSeen !== null
      ? `Last active ${relativeTime(lastSeen)} — open a supported site to reconnect`
      : "Waiting to hear from the browser extension";
  const statusesBySite = new Map(sourceStatuses.map((source) => [source.site, source]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 afterhours-glass rounded-lg p-3.5">
        <div className="flex size-[44px] shrink-0 items-center justify-center rounded-lg border bg-secondary text-muted-foreground">
          <PuzzleIcon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">Browser extension</span>
          <span className="truncate text-xs text-muted-foreground">{extensionSubtitle}</span>
        </div>
        <Badge
          variant="outline"
          className={
            connected ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground"
          }
        >
          <span
            className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground"}`}
          />
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      <SettingsSection
        title="Sites"
        description="Browser sessions and the performers linked to each supported site"
      >
        <div className="flex flex-col divide-y divide-divider afterhours-glass rounded-lg">
          {sites.map((site) => {
            const enabled = !disabled.has(site.site);
            const source = statusesBySite.get(site.site);
            const sessionState = source?.sessionState ?? "unknown";
            const account = source?.account;
            const performerCount = source?.performersSynced;
            const performerSummary =
              performerCount === null || performerCount === undefined
                ? "Sync count unavailable"
                : `${performerCount} ${performerCount === 1 ? "performer" : "performers"} synced`;
            const sourceSummary =
              sessionState === "signedIn" && account
                ? `@${account.username} · ${performerSummary}`
                : performerSummary;
            return (
              <div key={site.site} className="flex items-center gap-3 p-3.5">
                <div className="flex size-[40px] shrink-0 items-center justify-center rounded-lg border bg-secondary text-body font-medium text-muted-foreground">
                  {site.label.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{site.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{sourceSummary}</span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    enabled && sessionState === "signedIn"
                      ? "border-success/30 bg-success/10 text-success"
                      : "text-muted-foreground"
                  }
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      enabled && sessionState === "signedIn" ? "bg-success" : "bg-muted-foreground"
                    }`}
                  />
                  {!enabled
                    ? "Disabled"
                    : sessionState === "signedIn"
                      ? "Signed in"
                      : sessionState === "signedOut"
                        ? "Signed out"
                        : "Not checked"}
                </Badge>
                <Toggle
                  checked={enabled}
                  onChange={(next) => toggleSite(site.site, next)}
                  label={`Enable ${site.label}`}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
