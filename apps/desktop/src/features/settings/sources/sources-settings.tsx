import { sites } from "@stasher/core";
import { Badge } from "@stasher/ui/components/badge";
import { PuzzleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/features/settings/settings-section";
import {
  type ExtensionStatus,
  getExtensionStatus,
  getSourcesConfig,
  setSourcesConfig,
} from "@/features/settings/sources/api";
import { Toggle } from "@/features/settings/sources/components/toggle";

// How recently we must have heard from the extension to call it "connected".
// The extension connects per request rather than holding a socket open, so
// this is a recency window, not a live link.
const CONNECTED_WINDOW_MS = 90_000;
const POLL_MS = 5_000;

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
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSourcesConfig().then((config) => {
      if (config) setDisabled(new Set(config.disabledSites));
    });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3.5">
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
        description="Sign-in status and per-site sync counts arrive in a later update."
      >
        <div className="flex flex-col gap-2">
          {sites.map((site) => {
            const enabled = !disabled.has(site.site);
            return (
              <div
                key={site.site}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3.5"
              >
                <div className="flex size-[40px] shrink-0 items-center justify-center rounded-lg border bg-secondary text-sm font-medium text-muted-foreground">
                  {site.label.charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{site.label}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {site.host}
                  </span>
                </div>
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
