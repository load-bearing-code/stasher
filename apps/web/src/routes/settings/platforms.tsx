import { createFileRoute } from "@tanstack/react-router";
import { PlatformsSection } from "@/features/settings/platforms/platforms-section";

export const Route = createFileRoute("/settings/platforms")({
  component: PlatformsSection,
});
