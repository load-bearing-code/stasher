import { createFileRoute } from "@tanstack/react-router";
import { TagsSection } from "@/features/settings/tags/tags-section";

export const Route = createFileRoute("/settings/tags")({
  component: TagsSection,
});
