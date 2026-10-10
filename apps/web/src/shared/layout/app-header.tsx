import { cn } from "@stasher/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  to: string;
}

const NAV: NavItem[] = [
  { label: "Home", to: "/" },
  { label: "Feed", to: "/feed" },
];

export function AppHeader() {
  const [query, setQuery] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="z-10 flex h-16 shrink-0 items-center gap-5 bg-[rgba(8,7,10,0.86)] px-[clamp(14px,3vw,32px)] backdrop-blur-2xl backdrop-saturate-150">
      <Link
        to="/"
        className="flex-none cursor-pointer text-[19px] font-semibold tracking-[-0.035em] text-foreground"
      >
        Stasher
      </Link>

      <nav className="flex flex-none gap-1">
        {NAV.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-[7px] text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 justify-center">
        <label className="flex h-10 w-full max-w-[520px] items-center gap-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--muted)] px-3.5 text-muted-foreground">
          <Search className="size-[15px] flex-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts and performers"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <Link
        to="/settings"
        className={cn(
          "flex flex-none cursor-pointer items-center rounded-lg px-3.5 py-[7px] text-sm font-medium transition-colors",
          pathname.startsWith("/settings")
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Settings
      </Link>
    </header>
  );
}
