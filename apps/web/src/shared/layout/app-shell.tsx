import { Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/shared/layout/app-header";

export function AppShell() {
  return (
    // No background here: the body paints Afterhours' ground (grain and glows) and
    // the header is transparent, so content scrolls under it behind a masked blur.
    <div className="flex h-svh flex-col overflow-hidden">
      <main id="app-scroll-container" className="min-h-0 flex-1 overflow-y-auto">
        <AppHeader />
        <Outlet />
      </main>
    </div>
  );
}
