import type { SiteProfile } from "@stasher/protocol";
import { Avatar, AvatarFallback, AvatarImage } from "@stasher/ui/components/avatar";
import { ExternalLinkIcon } from "lucide-react";
import { RefreshButton } from "@/shared/components/RefreshButton";
import { initials } from "@/shared/text";

export function ProfileHeader({
  profile,
  inStash,
  refreshing,
  onRefresh,
}: {
  profile: SiteProfile;
  inStash: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const name = profile.displayName ?? profile.username;

  return (
    <div className="flex items-center gap-4 px-1">
      <Avatar size="lg" className="size-[52px]">
        <AvatarImage src={profile.photoUrl ?? undefined} />
        <AvatarFallback className="text-base">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 overflow-hidden">
        <p className="truncate text-base font-medium">{name}</p>
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
      <RefreshButton
        refreshing={refreshing}
        title="Re-fetch the profile and re-check Stash"
        onClick={onRefresh}
      >
        {inStash ? "In Stash" : "Not in Stash"}
      </RefreshButton>
    </div>
  );
}
