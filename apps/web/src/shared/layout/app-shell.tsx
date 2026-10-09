import { Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/shared/layout/app-header";

export function AppShell() {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
