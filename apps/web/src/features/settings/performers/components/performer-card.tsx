import { cn } from "@stasher/ui/lib/utils";
import type { Performer } from "@/features/settings/performers/performers-api";

interface PerformerCardProps {
  performer: Performer;
  onOpen: (id: string) => void;
}

const AVATAR_GRADIENTS = [
  "from-violet-300 to-fuchsia-950",
  "from-orange-300 to-amber-950",
  "from-cyan-300 to-blue-950",
  "from-indigo-300 to-violet-950",
  "from-emerald-300 to-teal-950",
  "from-yellow-300 to-yellow-950",
  "from-rose-300 to-red-950",
  "from-lime-300 to-green-950",
] as const;

function avatarGradient(id: string): (typeof AVATAR_GRADIENTS)[number] {
  const hash = [...id].reduce((value, character) => value + character.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function PerformerCard({ performer, onOpen }: PerformerCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(performer.id)}
      className="afterhours-matte flex min-h-80 w-full cursor-pointer flex-col items-center rounded-2xl px-5 pt-8 pb-6 text-center transition-colors"
    >
      <div
        className={cn(
          "size-28 shrink-0 rounded-full bg-linear-to-br shadow-highlight",
          avatarGradient(performer.id),
        )}
      />
      <span className="mt-5 max-w-full truncate text-base font-semibold text-foreground">
        {performer.name}
      </span>
      <span className="mt-1 min-h-5 max-w-full truncate text-body text-muted-foreground">
        {performer.disambiguation || "—"}
      </span>
      <div className="mt-4 flex max-w-full flex-wrap justify-center gap-1.5">
        {performer.aliases.map((alias) => (
          <span
            key={alias}
            className="max-w-full truncate rounded-full border border-acc/40 bg-acc/12 px-2.5 py-0.5 text-meta text-acc"
          >
            {alias}
          </span>
        ))}
      </div>
    </button>
  );
}
