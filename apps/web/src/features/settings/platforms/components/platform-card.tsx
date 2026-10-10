import { cn } from "@stasher/ui/lib/utils";
import { SelectCheckbox } from "@/features/settings/platforms/components/select-checkbox";
import type { PlatformSummary } from "@/features/settings/platforms/platforms-api";
import { apiAssetURL } from "@/shared/api/graphql";
import { pluralize } from "@/shared/pluralize";

interface PlatformCardProps {
  platform: PlatformSummary;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

const ICON_GRADIENTS = [
  "from-violet-300 to-fuchsia-950",
  "from-orange-300 to-amber-950",
  "from-cyan-300 to-blue-950",
  "from-indigo-300 to-violet-950",
  "from-emerald-300 to-teal-950",
  "from-yellow-300 to-yellow-950",
  "from-rose-300 to-red-950",
  "from-lime-300 to-green-950",
] as const;

function iconGradient(id: string): (typeof ICON_GRADIENTS)[number] {
  const hash = [...id].reduce((value, character) => value + character.charCodeAt(0), 0);
  return ICON_GRADIENTS[hash % ICON_GRADIENTS.length];
}

export function PlatformCard({ platform, selected, onOpen, onToggleSelect }: PlatformCardProps) {
  return (
    <div className="group/platform relative">
      <button
        type="button"
        onClick={() => onOpen(platform.id)}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center rounded-2xl border border-border bg-[#111013] px-5 pt-7 pb-6 text-center transition-colors hover:bg-muted/70",
          selected && "border-primary",
        )}
      >
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-inner shadow-white/10">
          {platform.iconUri ? (
            <img src={apiAssetURL(platform.iconUri)} alt="" className="size-full object-cover" />
          ) : (
            <div
              className={cn(
                "flex size-full items-center justify-center bg-linear-to-br text-2xl font-semibold text-white",
                iconGradient(platform.id),
              )}
            >
              {platform.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {platform.wordmarkUri ? (
          <img
            src={apiAssetURL(platform.wordmarkUri)}
            alt={platform.name}
            className="mt-4 h-7 max-w-full object-contain"
          />
        ) : (
          <span className="mt-4 max-w-full truncate text-base font-semibold text-foreground">
            {platform.name}
          </span>
        )}
        <span className="mt-1 max-w-full truncate text-sm text-muted-foreground">
          {platform.performerCount} {pluralize(platform.performerCount, "performer")}
        </span>
      </button>

      <SelectCheckbox
        state={selected ? "checked" : "unchecked"}
        aria-label={selected ? `Deselect ${platform.name}` : `Select ${platform.name}`}
        onClick={() => onToggleSelect(platform.id)}
        className={cn(
          "absolute top-2.5 left-2.5 opacity-0 transition-opacity group-hover/platform:opacity-100",
          selected && "opacity-100",
        )}
      />
    </div>
  );
}
