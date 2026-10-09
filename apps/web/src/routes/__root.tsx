import { createRootRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layout/app-shell";

export const Route = createRootRoute({
  component: AppShell,
});
