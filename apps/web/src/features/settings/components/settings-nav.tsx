import { cn } from "@stasher/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { Archive, Globe, Tag } from "lucide-react";
import { useServerMetadata } from "@/features/settings/library/library-api";

const NAV_ITEMS = [
  { to: "/settings/library", label: "Library", icon: Archive, countKey: null },
  {
    to: "/settings/platforms",
    label: "Platforms",
    icon: Globe,
    countKey: "platforms",
  },
  { to: "/settings/tags", label: "Tags", icon: Tag, countKey: "tags" },
] as const;

export function SettingsNav() {
  const { pathname } = useLocation();
  const { data } = useServerMetadata();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.to;
        const Icon = item.icon;
        const count = item.countKey ? data?.itemCounts[item.countKey] : undefined;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", isActive && "text-tint-text")} />
            <span className="flex-1">{item.label}</span>
            {count !== undefined ? (
              <span className="min-w-8 rounded-full bg-foreground/10 px-2.5 py-0.5 text-center text-[11px] text-muted-foreground/80 tabular-nums">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
