import type { SiteProfile } from "@stasher/protocol";
import { Avatar, AvatarFallback, AvatarImage } from "@stasher/ui/components/avatar";
import { Card } from "@stasher/ui/components/card";
import { ExternalLinkIcon } from "lucide-react";
import { initials } from "@/shared/text";

// The post's creator, and whether they already exist as a Stash performer.
// Imported media is filed under this performer, so the import is blocked until
// they're in Stash.
export function PerformerCard({ profile, inStash }: { profile: SiteProfile; inStash: boolean }) {
  const name = profile.displayName ?? profile.username;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Performer
      </p>
      <Card variant="inset" className="py-0">
        <div className="flex items-center gap-3 p-4">
          <Avatar>
            <AvatarImage src={profile.photoUrl ?? undefined} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-semibold">{name}</p>
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <span className="truncate">
                {profile.site}.com/{profile.username}
              </span>
              <ExternalLinkIcon className="size-3 shrink-0" />
            </a>
          </div>
          <span
            className={
              inStash
                ? "shrink-0 rounded-full border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400"
                : "shrink-0 rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
            }
          >
            {inStash ? "In Stash" : "Not in Stash"}
          </span>
        </div>
      </Card>
    </div>
  );
}
