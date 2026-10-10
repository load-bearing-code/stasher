import { cn } from "@stasher/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface NavItem {
  label: string;
  to: string;
}

const NAV: NavItem[] = [
  { label: "Library", to: "/" },
  { label: "Feed", to: "/feed" },
];

/** Afterhours marks the current item with an accent hairline ring, not a filled pill. */
const navItem =
  "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.75 text-nav transition-colors";
const navActive = "text-acc shadow-active";
const navInactive = "text-foreground-secondary hover:text-foreground";

export function AppHeader() {
  const [query, setQuery] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [scrolled, setScrolled] = useState(false);

  // The header is transparent over the page ground and fades in a masked blur
  // once content slides under it.
  useEffect(() => {
    const scroller = document.getElementById("app-scroll-container");
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 0);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-5 bg-transparent px-[clamp(14px,3vw,32px)]">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 -bottom-6 -z-10 backdrop-blur-[20px] transition-opacity duration-200 ease-out",
          "[mask-image:linear-gradient(#000_55%,transparent)]",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />

      <Link to="/" className="flex-none cursor-pointer text-wordmark text-foreground">
        Stasher
      </Link>

      <nav className="flex flex-none gap-1">
        {NAV.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(navItem, active ? navActive : navInactive)}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 justify-center">
        <label className="afterhours-well flex h-10 w-full min-w-0 items-center gap-2.5 rounded-md px-3.5 text-muted-foreground">
          <Search className="size-[15px] flex-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts and performers"
            className="min-w-0 flex-1 bg-transparent text-caption text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <Link
        to="/settings"
        title="Settings"
        aria-label="Settings"
        className={cn(
          navItem,
          "flex-none",
          pathname.startsWith("/settings") ? navActive : navInactive,
        )}
      >
        <Settings className="size-[17px] flex-none" />
      </Link>
    </header>
  );
}
