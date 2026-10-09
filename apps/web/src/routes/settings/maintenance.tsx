import { createFileRoute } from "@tanstack/react-router";
import { MaintenanceSection } from "@/features/settings/maintenance/maintenance-section";

export const Route = createFileRoute("/settings/maintenance")({
  component: MaintenanceSection,
});
