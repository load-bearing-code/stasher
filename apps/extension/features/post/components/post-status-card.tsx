import type { PostDetails, SiteProfile } from "@stasher/protocol";
import { Button } from "@stasher/ui/components/button";
import { Card, CardContent } from "@stasher/ui/components/card";
import { CheckIcon, DownloadIcon, FilmIcon, ImageIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { RefreshButton } from "@/shared/components/RefreshButton";
import { sendHostRequest } from "@/shared/host";
import { getFaphouseToken, getFanslyToken } from "../session";
import { PerformerCard } from "./performer-card";

function formatPostedAt(seconds: number): string {
  const date = new Date(seconds * 1000);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${time} · ${day}`;
}

export function PostStatusCard({
  site,
  postId,
  postUrl,
  inStash,
  post,
  creator,
  creatorInStash,
  refreshing,
  onRefresh,
  onError,
}: {
  site: string;
  postId: string;
  postUrl: string;
  inStash: boolean;
  post: PostDetails | null;
  creator: SiteProfile | null;
  creatorInStash: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  // Imported media is filed under the creator's Stash performer, so block the
  // import until they're in Stash (the desktop app enforces this too).
  const blockedOnPerformer = creator !== null && !creatorInStash;
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ files: number; performer: string } | null>(null);

  async function importPost() {
    setImporting(true);
    try {
      const authToken =
        site === "fansly"
          ? await getFanslyToken()
          : site === "faphouse"
            ? await getFaphouseToken()
            : null;
      const response = await sendHostRequest({
        type: "importPost",
        site,
        postId,
        postUrl,
        authToken,
      });
      if (response.type === "error") onError(response.message);
      else if (response.type === "postImported")
        setImported({ files: response.files, performer: response.performer.name });
    } catch {
      onError("Couldn't reach the Stasher desktop app.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 px-1">
        <div className="flex h-[52px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {post?.mediaKind === "image" ? (
            <ImageIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-body font-medium hover:underline"
          >
            {post?.title ?? `Post ${postId}`}
          </a>
          {post?.postedAt != null && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {formatPostedAt(post.postedAt)}
            </p>
          )}
        </div>
        <RefreshButton refreshing={refreshing} title="Re-check Stash" onClick={onRefresh}>
          {inStash ? "In Stash" : "Not in Stash"}
        </RefreshButton>
      </div>

      {!inStash && creator && <PerformerCard profile={creator} inStash={creatorInStash} />}

      <Card variant="inset" className="gap-0 py-0">
        {inStash ? (
          <CardContent className="flex items-center gap-4 p-5">
            <CheckIcon className="size-5 text-primary" />
            <p className="font-semibold">This post is in your Stash</p>
          </CardContent>
        ) : imported !== null ? (
          <CardContent className="flex items-center gap-4 p-5">
            <CheckIcon className="size-5 text-primary" />
            <p className="font-semibold">
              Saved {imported.files} {imported.files === 1 ? "file" : "files"} to {imported.performer}
            </p>
          </CardContent>
        ) : (
          <CardContent className="flex items-center gap-5 rounded-xl border border-dashed p-5">
            <FilmIcon className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold">Scene not in your Stash</p>
                <p className="leading-relaxed text-muted-foreground">
                  {blockedOnPerformer
                    ? "Add this creator to your Stash as a performer first — imported media is filed under them."
                    : "No scene has this URL, and no file in your library matches its fingerprint."}
                </p>
              </div>
              <Button
                className="shrink-0 whitespace-nowrap"
                disabled={importing || blockedOnPerformer}
                onClick={() => void importPost()}
              >
                <DownloadIcon className="size-4" />
                {importing ? "Importing…" : "Download & import"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
