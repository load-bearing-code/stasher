import { createFileRoute } from "@tanstack/react-router";
import { LibrarySection } from "@/features/settings/library/library-section";

export const Route = createFileRoute("/settings/library")({
  component: LibrarySection,
});
