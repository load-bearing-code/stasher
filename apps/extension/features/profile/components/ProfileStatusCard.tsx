import type { Performer, SiteProfile } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent } from "@stasher/ui/components/card";
import { CheckIcon, SearchIcon } from "lucide-react";
import type { Resolved } from "../types";

export function ProfileStatusCard({
  profile,
  resolved,
  exactMatch,
  onCreate,
}: {
  profile: SiteProfile;
  resolved: Resolved | null;
  exactMatch: Performer | null;
  onCreate: () => void;
}) {
  return (
    <Card variant="inset" className="gap-0 py-0">
      {resolved ? (
        <CardContent className="flex items-center gap-4 p-5">
          <CheckIcon className="size-5 text-primary" />
          <p>
            {resolved.via === "created" ? "Created" : "Linked to"}{" "}
            <span className="font-semibold">{resolved.performer.name}</span> in Stash.
          </p>
        </CardContent>
      ) : exactMatch ? (
        <CardContent className="flex items-center gap-4 p-5">
          <CheckIcon className="size-5 text-primary" />
          <div>
            <p className="font-semibold">Already in your Stash</p>
            <p className="text-muted-foreground">{exactMatch.name}</p>
          </div>
        </CardContent>
      ) : (
        <CardContent className="flex items-center gap-5 rounded-xl border border-dashed p-5">
          <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">Not in your Stash yet</p>
              <p className="leading-relaxed text-muted-foreground">
                No performer has this {profile.site === "fansly" ? "Fansly" : profile.site} URL, and
                no name or alias is an exact match.
              </p>
            </div>
            <Button className="shrink-0 whitespace-nowrap" onClick={onCreate}>
              + Create performer
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
