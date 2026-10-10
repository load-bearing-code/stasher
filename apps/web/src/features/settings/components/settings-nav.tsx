import { cn } from "@stasher/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { Archive, Globe, Tag, Users } from "lucide-react";
import { useServerMetadata } from "@/features/settings/library/library-api";

const NAV_ITEMS = [
  { to: "/settings/library", label: "Library", icon: Archive, countKey: null },
  {
    to: "/settings/platforms",
    label: "Platforms",
    icon: Globe,
    countKey: "platforms",
  },
  {
    to: "/settings/performers",
    label: "Performers",
    icon: Users,
    countKey: "performers",
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
              // Afterhours marks the current item with an accent hairline ring on the
              // bare ground, not a filled pill.
              "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-nav transition-[color,box-shadow] duration-[160ms] ease-out",
              isActive
                ? "text-acc shadow-active"
                : "text-foreground-secondary hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4 flex-none", !isActive && "opacity-70")} />
            <span className="flex-1">{item.label}</span>
            {count !== undefined ? (
              <span className="min-w-[22px] rounded-full bg-muted px-[7px] py-px text-center font-mono text-mono-badge text-muted-foreground">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
