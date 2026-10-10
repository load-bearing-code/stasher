import { Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/shared/layout/app-header";

export function AppShell() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <AppHeader />
      <main id="app-scroll-container" className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
