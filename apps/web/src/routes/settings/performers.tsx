import { createFileRoute } from "@tanstack/react-router";
import { PerformersSection } from "@/features/settings/performers/performers-section";

export const Route = createFileRoute("/settings/performers")({
  component: PerformersSection,
});
