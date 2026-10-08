import { RefreshCwIcon } from "lucide-react";
import { ImportWizard } from "@/features/import-performer/ImportWizard";
import { StageMessage } from "@/features/page-lookup/components/StageMessage";
import { usePageStage } from "@/features/page-lookup/use-page-stage";
import { PostStatusCard } from "@/features/post/components/PostStatusCard";
import { CandidateList } from "@/features/profile/components/CandidateList";
import { OpenInStashButton } from "@/features/profile/components/OpenInStashButton";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import { ProfileStatusCard } from "@/features/profile/components/ProfileStatusCard";
import { useProfileActions } from "@/features/profile/use-profile-actions";
import { ConnectionIndicator } from "@/features/stash-connection/components/ConnectionIndicator";
import { useStashConnection } from "@/features/stash-connection/use-stash-connection";

export function App() {
  const { connection, stashUrl, refresh: refreshConnection } = useStashConnection();
  const { stage, setStage, refreshing, refresh: refreshStage } = usePageStage();
  const { wizardOpen, setWizardOpen, resolved, linkingId, link, markCreated, reset } =
    useProfileActions((message) => setStage({ kind: "error", message }));

  async function refresh() {
    await Promise.all([refreshConnection(), refreshStage()]);
    reset();
  }

  return (
    <main className="glass-thick flex max-h-[600px] w-[400px] flex-col overflow-y-auto text-xs">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="flex items-center gap-3 text-sm font-medium">
          <div className="flex size-8 items-center justify-center rounded-lg bg-tint-soft text-tint-text">
            <RefreshCwIcon className="size-4" />
          </div>
          Stash Sync
        </div>
        <ConnectionIndicator connection={connection} stashUrl={stashUrl} />
      </header>

      <div className="flex flex-1 flex-col gap-5 p-4">
        <StageMessage stage={stage} />

        {stage.kind === "post" && (
          <PostStatusCard
            site={stage.site}
            postId={stage.postId}
            postUrl={stage.postUrl}
            inStash={stage.inStash}
            post={stage.post}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            onError={(message) => setStage({ kind: "error", message })}
          />
        )}

        {stage.kind === "ready" &&
          (wizardOpen ? (
            <ImportWizard
              profile={stage.profile}
              onCancel={() => setWizardOpen(false)}
              onCreated={markCreated}
              onError={(message) => setStage({ kind: "error", message })}
            />
          ) : (
            <>
              <ProfileHeader
                profile={stage.profile}
                inStash={Boolean(resolved || stage.exactMatch)}
                refreshing={refreshing}
                onRefresh={() => void refresh()}
              />
              <ProfileStatusCard
                profile={stage.profile}
                resolved={resolved}
                exactMatch={stage.exactMatch}
                onCreate={() => setWizardOpen(true)}
              />
              <OpenInStashButton
                stashUrl={stashUrl}
                performerId={(resolved?.performer ?? stage.exactMatch)?.id}
              />
              {!resolved && !stage.exactMatch && stage.candidates.length > 0 && (
                <CandidateList
                  candidates={stage.candidates}
                  linkingId={linkingId}
                  onLink={(performerId) => void link(performerId, stage.profile)}
                />
              )}
            </>
          ))}
      </div>
    </main>
  );
}
