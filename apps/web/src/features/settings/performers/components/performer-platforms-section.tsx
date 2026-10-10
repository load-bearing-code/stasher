import { Button } from "@stasher/ui/components/button";
import { Input } from "@stasher/ui/components/input";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import {
  getPlatformAccount,
  type PlatformAccount,
  useCreatePlatformAccount,
  usePerformerPlatformAccounts,
  useUpdatePlatformAccount,
} from "@/features/settings/performers/platform-accounts-api";
import { type PlatformSummary, usePlatforms } from "@/features/settings/platforms/platforms-api";
import { apiAssetURL } from "@/shared/api/graphql";

interface PerformerPlatformsSectionProps {
  performerId: string;
}

interface PlatformAccountCardProps {
  account: PlatformAccount;
  performerId: string;
}

interface PlatformMarkProps {
  platform: Pick<PlatformSummary, "name" | "iconUri">;
  size?: "sm" | "lg";
}

function PlatformMark({ platform, size = "sm" }: PlatformMarkProps) {
  const sizeClass = size === "lg" ? "size-12 rounded-xl" : "size-9 rounded-lg";
  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden bg-white font-medium text-black/75`}
    >
      {platform.iconUri ? (
        <img src={apiAssetURL(platform.iconUri)} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{platform.name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function PlatformAccountCard({ account, performerId }: PlatformAccountCardProps) {
  const updateAccount = useUpdatePlatformAccount();
  const [handle, setHandle] = useState(account.handle);
  const [platformUserId, setPlatformUserId] = useState(account.platformUserId ?? "");
  const normalizedHandle = handle.trim().replace(/^@/, "");
  const isDirty =
    normalizedHandle !== account.handle || platformUserId.trim() !== (account.platformUserId ?? "");
  const isShared = account.performers.length > 1;

  function accountInput(performerIds: string[]) {
    return {
      id: account.id,
      platformId: account.platform.id,
      platformUserId: platformUserId.trim() || null,
      handle: normalizedHandle,
      bio: account.bio,
      studioId: account.studio?.id ?? null,
      performerIds,
    };
  }

  function save() {
    if (!normalizedHandle) return;
    updateAccount.mutate(accountInput(account.performers.map((performer) => performer.id)));
  }

  function unlink() {
    updateAccount.mutate(
      accountInput(
        account.performers
          .filter((performer) => performer.id !== performerId)
          .map((performer) => performer.id),
      ),
    );
  }

  return (
    <div className="border-b border-border/60 p-4 last:border-b-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
        <PlatformMark platform={account.platform} size="lg" />
        <div className="flex h-12 min-w-0 flex-col justify-evenly">
          <p className="truncate text-sm font-semibold text-foreground">{account.platform.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            {isShared
              ? `Shared with ${account.performers.length - 1} other ${account.performers.length === 2 ? "performer" : "performers"}`
              : account.platformUserId
                ? "Linked by platform ID"
                : "Linked by username"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={updateAccount.isPending}
          aria-label={`Unlink ${account.platform.name}`}
          onClick={unlink}
          className="my-auto"
        >
          <X />
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={handle}
          disabled={updateAccount.isPending}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Username"
          aria-label={`${account.platform.name} username`}
          className="h-10 flex-1 bg-background/50"
        />
        <Input
          value={platformUserId}
          disabled={updateAccount.isPending}
          onChange={(event) => setPlatformUserId(event.target.value)}
          placeholder="ID —"
          aria-label={`${account.platform.name} platform ID`}
          className="h-10 flex-1 bg-background/50"
        />
        {isDirty ? (
          <Button
            disabled={!normalizedHandle || updateAccount.isPending}
            onClick={save}
            className="h-10"
          >
            {updateAccount.isPending ? "Saving..." : "Update"}
          </Button>
        ) : null}
      </div>
      {updateAccount.error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {updateAccount.error.message}
        </p>
      ) : null}
    </div>
  );
}

export function PerformerPlatformsSection({ performerId }: PerformerPlatformsSectionProps) {
  const { data: platformsData, isPending: platformsPending } = usePlatforms();
  const {
    data: accounts = [],
    isPending: accountsPending,
    error: accountsError,
  } = usePerformerPlatformAccounts(performerId, true);
  const createAccount = useCreatePlatformAccount();
  const updateExistingAccount = useUpdatePlatformAccount();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [platformQuery, setPlatformQuery] = useState("");
  const [addingPlatformId, setAddingPlatformId] = useState<string | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [newPlatformUserId, setNewPlatformUserId] = useState("");
  const [lookupError, setLookupError] = useState<Error | null>(null);
  const platforms = platformsData?.platforms ?? [];
  const addingPlatform = platforms.find((platform) => platform.id === addingPlatformId) ?? null;
  const needle = platformQuery.trim().toLowerCase();
  const visiblePlatforms = needle
    ? platforms.filter(
        (platform) =>
          platform.name.toLowerCase().includes(needle) ||
          platform.id.toLowerCase().includes(needle),
      )
    : platforms;
  const isPending = platformsPending || accountsPending;

  function openPicker() {
    setPickerOpen(true);
    setPlatformQuery("");
    setAddingPlatformId(null);
    setLookupError(null);
  }

  function closePicker() {
    setPickerOpen(false);
    setPlatformQuery("");
    setAddingPlatformId(null);
    setLookupError(null);
  }

  function startAdding(platformId: string) {
    setAddingPlatformId(platformId);
    setNewHandle("");
    setNewPlatformUserId("");
    setLookupError(null);
    createAccount.reset();
    updateExistingAccount.reset();
  }

  function addAccount() {
    if (!addingPlatform) return;
    const handle = newHandle.trim().replace(/^@/, "");
    if (!handle) return;
    setLookupError(null);
    void getPlatformAccount(addingPlatform.id, handle)
      .then((existingAccount) => {
        if (!existingAccount) {
          createAccount.mutate(
            {
              platformId: addingPlatform.id,
              platformUserId: newPlatformUserId.trim() || null,
              handle,
              performerIds: [performerId],
            },
            { onSuccess: closePicker },
          );
          return;
        }
        if (existingAccount.performers.some((linked) => linked.id === performerId)) {
          closePicker();
          return;
        }
        updateExistingAccount.mutate(
          {
            id: existingAccount.id,
            platformId: existingAccount.platform.id,
            platformUserId: existingAccount.platformUserId,
            handle: existingAccount.handle,
            bio: existingAccount.bio,
            studioId: existingAccount.studio?.id ?? null,
            performerIds: [...existingAccount.performers.map((linked) => linked.id), performerId],
          },
          { onSuccess: closePicker },
        );
      })
      .catch((error: unknown) => {
        setLookupError(
          error instanceof Error ? error : new Error("Couldn't find platform account"),
        );
      });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Accounts <span className="font-mono font-normal">{accounts.length}</span>
      </h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-muted/25">
        {!isPending && accounts.length === 0 ? (
          <p className="px-5 pt-5 pb-5 text-sm text-muted-foreground">No accounts linked</p>
        ) : null}
        {isPending ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Loading accounts...</p>
        ) : null}
        {accountsError ? (
          <p role="alert" className="px-5 py-3 text-xs text-destructive">
            {accountsError.message}
          </p>
        ) : null}
        {accounts.map((account) => (
          <PlatformAccountCard key={account.id} account={account} performerId={performerId} />
        ))}

        {pickerOpen && !addingPlatform ? (
          <div className="border-t border-border/60 p-5 first:border-t-0">
            <div className="flex items-center gap-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={platformQuery}
                onChange={(event) => setPlatformQuery(event.target.value)}
                placeholder="Search platforms..."
                aria-label="Search platforms"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close platform picker"
                onClick={closePicker}
              >
                <X />
              </Button>
            </div>
            <div className="mt-3 flex max-h-64 flex-col overflow-y-auto">
              {visiblePlatforms.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => startAdding(platform.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <PlatformMark platform={platform} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {platform.name}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {platform.id}
                  </span>
                </button>
              ))}
              {visiblePlatforms.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No matching platforms.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {addingPlatform ? (
          <div className="border-t border-border/60 p-5 first:border-t-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back to platform picker"
                onClick={() => setAddingPlatformId(null)}
              >
                <ArrowLeft />
              </Button>
              <PlatformMark platform={addingPlatform} />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                Link {addingPlatform.name}
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close platform picker"
                onClick={closePicker}
              >
                <X />
              </Button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Input
                autoFocus
                value={newHandle}
                disabled={createAccount.isPending || updateExistingAccount.isPending}
                onChange={(event) => setNewHandle(event.target.value)}
                placeholder="Username"
                aria-label={`${addingPlatform.name} username`}
                className="h-10 bg-background/50"
              />
              <Input
                value={newPlatformUserId}
                disabled={createAccount.isPending || updateExistingAccount.isPending}
                onChange={(event) => setNewPlatformUserId(event.target.value)}
                placeholder="ID optional"
                aria-label={`${addingPlatform.name} platform ID`}
                className="h-10 bg-background/50"
              />
              <Button
                disabled={
                  !newHandle.trim() || createAccount.isPending || updateExistingAccount.isPending
                }
                onClick={addAccount}
                className="self-end"
              >
                {createAccount.isPending || updateExistingAccount.isPending
                  ? "Linking..."
                  : "Link account"}
              </Button>
            </div>
            {createAccount.error || updateExistingAccount.error || lookupError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {(createAccount.error ?? updateExistingAccount.error ?? lookupError)?.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {!pickerOpen ? (
          <button
            type="button"
            onClick={openPicker}
            disabled={platforms.length === 0}
            className="flex w-full cursor-pointer items-center gap-3 border-t border-border/60 px-4 py-3 text-left text-primary transition-colors first:border-t-0 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-dashed border-primary/40">
              <Plus className="size-4" />
            </span>
            <span className="text-sm font-medium">Add account</span>
          </button>
        ) : null}
      </div>
      {!isPending && platforms.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Create a platform before linking an account.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Matched by ID first, then username. The extension fills in IDs when it sees the profile.
        </p>
      )}
    </section>
  );
}
