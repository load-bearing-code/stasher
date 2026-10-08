import { Card, CardContent } from "@stasher/ui/components/card";
import { CheckIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { RefreshButton } from "@/shared/components/RefreshButton";

export function PostStatusCard({
  postUrl,
  inStash,
  refreshing,
  onRefresh,
}: {
  postUrl: string;
  inStash: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card variant="inset" className="gap-0 py-0">
      <CardContent className="flex items-center gap-4 p-5">
        {inStash ? (
          <CheckIcon className="size-5 text-primary" />
        ) : (
          <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 overflow-hidden">
          <p className="font-semibold">
            {inStash ? "This post is in your Stash" : "This post isn't in your Stash"}
          </p>
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <span className="truncate">{postUrl.replace(/^https:\/\//, "")}</span>
            <ExternalLinkIcon className="size-3 shrink-0" />
          </a>
        </div>
        <RefreshButton refreshing={refreshing} title="Re-check Stash" onClick={onRefresh} />
      </CardContent>
    </Card>
  );
}
