import { cn } from "@stasher/ui/lib/utils";
import { Archive, Tag, Wrench } from "lucide-react";
import type { SettingsNavItem, SettingsSectionId } from "@/features/settings/types";

const NAV_ITEMS: SettingsNavItem[] = [
  { id: "library", label: "Library", icon: Archive },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
];

interface SettingsNavProps {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4", isActive && "text-tint-text")}
            />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
