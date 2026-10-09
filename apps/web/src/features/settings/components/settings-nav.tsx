import { cn } from "@stasher/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { Archive, Tag, Wrench } from "lucide-react";

const NAV_ITEMS = [
  { to: "/settings/library", label: "Library", icon: Archive },
  { to: "/settings/tags", label: "Tags", icon: Tag },
  { to: "/settings/maintenance", label: "Maintenance", icon: Wrench },
] as const;

export function SettingsNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.to;
        const Icon = item.icon;
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
